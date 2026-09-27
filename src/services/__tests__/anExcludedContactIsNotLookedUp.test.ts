import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * THE BLOCKED-AND-DECEASED GUARD ON THE CHAT'S OWN TOOLS, WHICH NOTHING HELD.
 *
 * Multi-line sabotage, 22 September: `if (phoneField) {` in `executeToolCall`
 * replaced with `false` — the whole suite passed. The MCP connector's twin of
 * this got its test earlier tonight; the in-app path, which is where almost
 * every call actually comes from, had none.
 *
 * What it does: before any tool runs, if that tool takes a phone, the phone is
 * checked against the owner's excluded set — blocked contacts and people
 * recorded as deceased — and an excluded one is answered
 * `{ found: false, reason: 'unavailable' }` rather than looked up.
 *
 * Why it is keyed on a MAP rather than on the tool's own schema: the guard is
 * for READS that would surface somebody. `block_contact`, `unblock_contact`
 * and `remove_contact_exclusion` all take a phone and must keep working on an
 * excluded one — refusing them would make a block impossible to undo.
 *
 * AND WHAT THIS FILE DELIBERATELY DOES NOT CLAIM. I tried to hold the MAP as
 * well — „every tool that takes a phone is either in it or deliberately out"
 * — and could not enumerate the tools by regex twice in a row without getting
 * two different answers. Two measurements that disagree are one measurement
 * too few, so the map's completeness is written up rather than asserted here.
 * What is asserted is the guard itself, and the shape of what it answers.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

const GUARD = 'const phoneField = PHONE_KEYED_TOOL_FIELD[name];';

describe('a tool keyed on a phone never surfaces an excluded contact', () => {
  /**
   * AND THE CONDITION ITSELF, WHICH THE FIRST VERSION OF THIS FILE LEFT OUT.
   *
   * Written at midnight, run, green — and then sabotaged, and still green.
   * Every assertion below looks at the lines AROUND the guard: the lookup of
   * the map, the comparison, the answer. Replacing `if (phoneField) {` with
   * `if (false) {` changes none of them, so the test held nothing and said it
   * did. That is the exact fault this whole file is about, committed in the
   * test written to catch it, an hour after writing the lesson down.
   */
  it('holds the condition, not merely the lines around it', () => {
    expect(chat).toContain('if (phoneField) {');
  });

  it('finds the guard at all', () => {
    expect(chat).toContain(GUARD);
    expect(chat).toContain("return { found: false, reason: 'unavailable' };");
  });

  /** Before the dispatch. A read that has already happened cannot be refused. */
  it('runs before any tool is dispatched', () => {
    const guardAt = chat.indexOf(GUARD);
    const switchAt = chat.indexOf("case 'lookup_contact_by_phone'", guardAt);

    expect(guardAt).toBeGreaterThan(0);
    expect(switchAt).toBeGreaterThan(guardAt);
  });

  /**
   * FORMAT-INDEPENDENT. „+995 599 12 34 56" and „995599123456" are one person,
   * and a block that only holds for the spelling it was written in is not a
   * block. `normalizePhone` on both sides is the whole of that.
   */
  it('compares the number without trusting its spelling', () => {
    const at = chat.indexOf(GUARD);
    const block = chat.slice(at, at + 400);

    expect(block).toContain('excluded.has(normalizePhone(phone))');
  });

  /**
   * AND IT SAYS „unavailable", NOT „blocked". The reason code goes back to a
   * model that will phrase it for the owner, and „this person has blocked
   * you" — or „this person has died" — is not ours to announce on the strength
   * of a lookup. The same restraint as the connector's twin.
   */
  it('answers a reason that reveals nothing about why', () => {
    const at = chat.indexOf(GUARD);
    const block = chat.slice(at, at + 400);

    expect(block).toContain("reason: 'unavailable'");
    expect(block).not.toMatch(/blocked|deceased|died/i);
  });

  /**
   * The map is narrow ON PURPOSE and that is worth pinning: the tools that
   * MANAGE an exclusion must keep working on an excluded person, or a block
   * could never be undone.
   */
  it('does not cover the tools that exist to manage an exclusion', () => {
    const mapAt = chat.indexOf('const PHONE_KEYED_TOOL_FIELD');
    const map = chat.slice(mapAt, chat.indexOf('};', mapAt));

    expect(map).not.toContain('unblock_contact');
    expect(map).not.toContain('remove_contact_exclusion');
    expect(map).not.toContain('block_contact');
  });
});

/**
 * ⚠️ AND THE ONE TOOL THAT HANDS OVER A REAL PHONE NUMBER IS NOT IN THAT MAP.
 *
 * `get_own_contact_number` is the only tool that returns a number to the owner
 * rather than a fact about somebody. It is absent from
 * `PHONE_KEYED_TOOL_FIELD` — correctly, because it is not a lookup that could
 * be answered „unavailable" without telling the owner something about their
 * own phonebook — so the pre-dispatch gate above never runs for it.
 *
 * ITS ONLY PROTECTION IS ONE LINE INSIDE `getOwnContactNumber`, and on 27
 * September the block-mode sweep could falsify that line with 4,964 tests
 * green. Without it the product hands over the number of somebody the owner
 * has BLOCKED, or somebody recorded as DECEASED — which is the one category
 * this codebase has been most careful about everywhere else.
 *
 * ⚠️ THESE ASSERT THE WHOLE `if (...) {`, NOT THE CONDITION ALONE, and that is
 * not a style choice. The sweep's own mutation used to echo the condition into
 * a comment, so a test asserting `excluded.has(normalizePhone(phone))` passed
 * under mutation and the guard looked untested when it was not. Fixed in the
 * sweep the same day; the rule it leaves behind is this one.
 */
describe('the number tool refuses a blocked or deceased contact by itself', () => {
  const AT = chat.indexOf('async function getOwnContactNumber(');

  it('is not covered by the pre-dispatch gate, so it must guard itself', () => {
    const map = chat.slice(
      chat.indexOf('const PHONE_KEYED_TOOL_FIELD'),
      chat.indexOf('const PHONE_KEYED_TOOL_FIELD') + 300,
    );

    expect(AT).toBeGreaterThan(0);
    expect(map).not.toContain('get_own_contact_number');
  });

  it('holds the condition itself', () => {
    const fn = chat.slice(AT, AT + 1_600);

    expect(fn).toContain('if (excluded.has(normalizePhone(phone))) {');
    expect(fn).toContain("return { error: 'This contact is unavailable.' };");
  });

  /**
   * BEFORE THE NUMBER IS BUILT, not after. A refusal that happens once the
   * number is in the reply is not a refusal, and the ordering is the only
   * thing that makes this line a gate rather than a comment.
   */
  it('refuses before the number is assembled', () => {
    const fn = chat.slice(AT, AT + 1_600);
    const guardAt = fn.indexOf('if (excluded.has(normalizePhone(phone))) {');
    const numberAt = fn.indexOf('number: `${ALLOW_OPEN}');

    expect(guardAt).toBeGreaterThan(0);
    expect(numberAt).toBeGreaterThan(guardAt);
  });

  /** „Unavailable", not „blocked" and not „deceased" — the same restraint as above. */
  it('says nothing about why', () => {
    const fn = chat.slice(AT, AT + 1_600);
    const line = fn.slice(
      fn.indexOf('if (excluded.has(normalizePhone(phone))) {'),
      fn.indexOf('if (excluded.has(normalizePhone(phone))) {') + 200,
    );

    expect(line).not.toMatch(/blocked|deceased|died/i);
  });
});
