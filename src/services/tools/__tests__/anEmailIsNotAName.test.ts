import { readFileSync } from 'fs';
import { join } from 'path';
import { DISPLAY_NAME } from '../searchByTag';
import { isDisplayableTag } from '../getContactFullProfile';

/**
 * ⚠️ A REGISTERED NAME THAT IS AN EMAIL ADDRESS — the tester, 25 September.
 *
 * `search_contacts` with tag „lawyer" on 501 returned a person whose name read
 * „[email hidden] L" — a bracket where a person should be — while `saved_as`
 * carried their real name and the app chat showed it correctly.
 *
 * BOTH FIRST GUESSES WERE WRONG, which is why this test exists rather than a
 * comment. The tester thought the connector assembles the name from tags; I
 * thought another contributor had saved an email as a tag. Neither: account
 * 551's REGISTERED NAME in `"User".name` is their email address followed by
 * „ L". Exactly one member in the base has an „@" in their name. The scrubber
 * then hides the address — correctly — and the bracket is what is left.
 *
 * The existing rule stays: a registered name outranks a phonebook label,
 * because junk labels („LIST. … Ally. Force") were being read as people. An
 * email is not a name either, so it does not outrank anything.
 */
describe('an email is not a name', () => {
  it('falls through to the saved label when the registered name carries an @', () => {
    expect(DISPLAY_NAME).toContain("TRIM(MAX(u.name)) LIKE '%@%'");
    expect(DISPLAY_NAME).toContain('THEN NULL');
    expect(DISPLAY_NAME).toContain('MAX(ua.alias)');
  });

  /** The label is the fallback, never the first choice — that rule is older. */
  it('still prefers a real registered name over the label', () => {
    const chosenFirst = DISPLAY_NAME.indexOf("NULLIF(TRIM(MAX(u.name)), '')");
    const fallback = DISPLAY_NAME.indexOf('MAX(ua.alias)');

    expect(chosenFirst).toBeGreaterThan(0);
    expect(fallback).toBeGreaterThan(chosenFirst);
  });

  /**
   * ONE EXPRESSION, THREE READS. `search_by_tag` and both halves of
   * `search_contact_by_name` picked the display name with the same copied
   * SQL, so this fault was in three places at once and a fix in one would
   * have left two. They share it now.
   */
  it('is the one expression all three searches use', () => {
    const byName = readFileSync(join(__dirname, '..', 'searchContactByName.ts'), 'utf8');
    const byTag = readFileSync(join(__dirname, '..', 'searchByTag.ts'), 'utf8');

    expect(byName).toContain("import { DISPLAY_NAME } from './searchByTag'");
    expect(byName.match(/\$\{DISPLAY_NAME\} AS name/g) ?? []).toHaveLength(2);
    expect(byTag).toContain('${DISPLAY_NAME} AS name');
    // Nobody left a copy behind.
    for (const src of [byName, byTag]) {
      expect(src).not.toContain("COALESCE(NULLIF(TRIM(MAX(u.name)), ''), MAX(ua.alias)) AS name");
    }
  });
});

/**
 * ⚠️ THE LEFTOVER THE TESTER FOUND AFTER THE NAME FIX, 25 September.
 *
 * The search stopped SHOWING „[email hidden] L" as somebody's name, and their
 * tag list still carried „[email hidden]" — the scrubber's output over a tag
 * whose stored value is a real email address, contributed by somebody about
 * that person. Nobody reads it as a name any more, but the model still saw it
 * among the words that describe who somebody is.
 *
 * AND AGAIN IT WAS TWO READERS OF ONE TABLE. The profile filtered its tags
 * through `isDisplayableTag`; the search result handed every stored tag
 * straight through with no filter at all. Third time today that a fault lived
 * in more than one reader of the same thing.
 */
describe('an email is not a label either', () => {
  it('drops an email-shaped tag', () => {
    expect(isDisplayableTag('name@example.com')).toBe(false);
    expect(isDisplayableTag('  spaced@mail.ge')).toBe(false);
  });

  it('keeps the tags a person is actually described by', () => {
    for (const tag of ['lawyer', 'იურისტი', 'Arci', 'Tbilisi', 'ex-colleague']) {
      expect(isDisplayableTag(tag)).toBe(true);
    }
  });

  /** The older rules are untouched: too short, digits only, no letter. */
  it('still drops what it already dropped', () => {
    expect(isDisplayableTag('l')).toBe(false);
    expect(isDisplayableTag('12345')).toBe(false);
    expect(isDisplayableTag('--')).toBe(false);
  });

  it('is the same filter on the search result, which had none', () => {
    const byTag = readFileSync(join(__dirname, '..', 'searchByTag.ts'), 'utf8');

    expect(byTag).toContain("import { isDisplayableTag } from './getContactFullProfile'");
    expect(byTag).toContain('isDisplayableTag(t)');
  });
});
