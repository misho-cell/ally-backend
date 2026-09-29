import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ROWS 308, 309 AND 316 — ONE STALE READ, THREE Pr1 FAULTS, ON THE FOUNDER'S
 * OWN ACCOUNT.
 *
 * 29 September, introduction request 1981. Giorgi asked to be introduced to a
 * lawyer. The founder accepted and chose `direct` — connect the two of them.
 * What the three people were then told:
 *
 *   to the FOUNDER   „[the lawyer]-ს კონტაქტი ვერ ვიპოვე შენს წიგნაკში"     (308)
 *   to GIORGI        „შუამავალმა აირჩია, რომ კავშირი მის გავლით გაგრძელდეს"  (309)
 *   to the LAWYER    nothing at all, though he is a Netai member             (316)
 *
 * Every one of those three is false, and the database says so. Measured before
 * the fix:
 *
 *     id 1981   intro_channel = 'direct'   target_phone IS NOT NULL = true
 *               target_user_id IS NULL     phone belongs to a member = true
 *
 * ⚠️ SO THE LOOKUP WAS NEVER THE PROBLEM — AND THAT IS WHAT MAKES THIS WORTH A
 * TEST RATHER THAN A PATCH. Both the tester's read and my own first read said
 * the accept path searched by one spelling and needed a better ladder. It does
 * not. `findContactPhonesByName` — both alphabets, spelling variants, the
 * mediator's own tags — had ALREADY resolved the lawyer and written his number
 * to the row. `deliverAcceptOutcome` was then handed the copy of the row read
 * BEFORE that write, found `target_phone` null, and re-derived the answer with
 * the weakest rule in the file (`LOWER(alias) = LOWER(target_name)`), which
 * cannot match a name saved in Latin against a request written in Georgian.
 *
 * A correct answer was computed, stored, and thrown away by a second rule for
 * the same question. The file's own comment names the shape exactly: „the rule
 * went on one wire and the other one kept running."
 *
 * Across every accepted direct introduction: 14 in all, 9 carrying a number, 8
 * of those never linked to a member — and all 8 of those numbers belong to
 * Netai members who were never told.
 */
const SERVICE = readFileSync(join(__dirname, '..', 'introduction.service.ts'), 'utf8');

/** Source with comment lines removed — a warning about a bug is not the bug. */
function code(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^\s*(\*|\/\*|\/\/)/.test(line))
    .join('\n');
}

describe('a contact the accept already found is not lost on the way out', () => {
  const BODY = code(SERVICE);

  /**
   * THE SECOND RULE IS GONE, not improved. Two rules for one question is the
   * fault; a better second rule would still be two.
   */
  it('has no second contact lookup of its own', () => {
    expect(BODY).not.toMatch(/LOWER\(\s*ua\.alias\s*\)\s*=\s*LOWER\(/i);
  });

  /**
   * The value comes back from the statement that wrote it. A re-read would be
   * a second query that another writer can land between — and the point of
   * this change is that one fact has one source.
   */
  it('takes the number from the accept’s own UPDATE', () => {
    expect(BODY).toContain('RETURNING target_phone');
  });

  /**
   * ⚠️ THE ASSERTION THAT WOULD HAVE CAUGHT IT. Delivery must be handed the
   * row as the UPDATE left it, never the copy loaded before it.
   */
  it('hands delivery the answered row, not the one loaded before the write', () => {
    const at = BODY.indexOf('deliverAcceptOutcome(');
    const call = BODY.slice(BODY.indexOf('deliverAcceptOutcome(', at + 1));

    expect(call).toMatch(/deliverAcceptOutcome\(\s*answered\b/);
  });

  /** And the answered row is built from what the UPDATE returned. */
  it('builds the answered row from the returned value', () => {
    expect(BODY).toMatch(/const answered: RequestRow = \{/);
    expect(BODY).toMatch(/target_phone: updated\.rows\[0\]\?\.target_phone/);
  });

  /**
   * ROW 316's HALF. The member link is gated on the phone; with a stale null
   * it never ran, so a target who is on Netai got no thread and no push. It is
   * fixed by the same change, and this records which row that was.
   */
  it('can still reach the member lookup, which the stale null skipped', () => {
    const at = BODY.indexOf('const targetPhone = req.target_phone');
    const after = BODY.slice(at, at + 900);

    expect(after).toContain('"UserPhone"');
    expect(after).toContain('targetUserId === null && targetPhone');
  });
});

/**
 * ROW 309 — „WE COULD NOT FIND IT" IS NOT „THEY DECIDED TO STAY IN THE MIDDLE".
 *
 * The outcome was a boolean, so those two shared one sentence, and a lookup
 * failure was reported to Giorgi as a decision the founder never made.
 */
describe('a lookup failing is never reported as somebody’s decision', () => {
  const BODY = code(SERVICE);

  it('carries three states rather than a yes/no', () => {
    expect(BODY).toContain('contactOutcome: IntroContactOutcome');
    expect(BODY).not.toContain('contactHandedOver: boolean');
  });

  /** The `direct` branch: empty means we failed, not that they chose. */
  it('calls an empty direct result not_found, not kept_by_mediator', () => {
    expect(BODY).toMatch(/contactOutcome: targetPhone !== null \? 'handed_over' : 'not_found'/);
  });

  /** The `via_mediator` branch is the only one that is a choice. */
  it('keeps the mediator’s actual choice as its own state', () => {
    expect(BODY).toContain("contactOutcome: 'kept_by_mediator'");
  });
});

/**
 * ⚠️ AND THE PART OF ROW 277 THAT WAS NEVER FINISHED, NAMED RATHER THAN LEFT
 * TO BE FOUND ON SOMEBODY'S PHONE.
 *
 * Row 277 — Postgres does not fold Georgian capitals and JavaScript does — was
 * fixed in six files and guarded by a sweep over `src/services/tools/`. The
 * bare `LOWER(ua.alias)` deleted above sat in `src/services/introduction.ts`'s
 * own directory, WHERE THAT SWEEP NEVER LOOKED, and it broke a real
 * introduction for the founder two days later.
 *
 * So the sweep is widened to the whole source tree, and every remaining site
 * is listed here by name. They are not fixed in this change on purpose: each
 * one wraps an indexed column, and `TRANSLATE` changes an expression's shape,
 * which is exactly how an index stops being used — the measurement row 278 is
 * parked waiting for. Making eight paths quietly slower to close a casing hole
 * would trade a visible fault for an invisible one.
 *
 * What this test buys is that the list cannot grow silently: a new bare
 * `LOWER` over a stored alias or tag fails here rather than on a phone.
 */
describe('every place that still lowercases a stored label without folding is named', () => {
  /** `LOWER` applied to a stored alias or tag column — never to a parameter. */
  const BARE_LOWER = /LOWER\(\s*(?:TRIM\(\s*)?(?:[A-Za-z_]*\.)?"?(?:alias|tag)"?\b/i;

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return entry === '__tests__' ? [] : sourceFiles(full);
      return entry.endsWith('.ts') ? [full] : [];
    });
  }

  it('matches the list exactly, so a new one cannot slip in', () => {
    const root = join(__dirname, '..', '..');
    const unfolded = sourceFiles(root)
      .filter((file) =>
        BARE_LOWER.test(code(readFileSync(file, 'utf8')).split('foldedLower(').join('FOLDED(')),
      )
      .map((file) =>
        file
          .slice(root.length + 1)
          .split('\\')
          .join('/'),
      )
      .sort();

    expect(unfolded).toEqual(
      [
        // Row 278, measured and written, parked for its index rebuild.
        'services/tools/searchSecondDegree.ts',
        // Named here for the first time — the sweep over `tools/` never saw these.
        'api/routes/admin.routes.ts',
        'api/routes/contacts.routes.ts',
        'services/graphAnalytics.service.ts',
        'services/labelReader.service.ts',
        'services/newMemberForGoal.service.ts',
        'services/officeholderGate.ts',
        'services/roster.service.ts',
        'services/taskAsks.service.ts',
      ].sort(),
    );
  });

  /** The path this change actually fixed is out of the list, and stays out. */
  it('no longer includes the introduction path', () => {
    expect(BARE_LOWER.test(code(SERVICE))).toBe(false);
  });
});
