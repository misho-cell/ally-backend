/**
 * THE WALL BETWEEN THE MODEL AND WRITING TO PEOPLE THE OWNER NEVER CHOSE.
 *
 * Sabotaged on 22 September, both layers, one at a time, whole suite re-run:
 *
 *   layer 1  `confirmed !== true` removed          3,705 pass    NOT HELD
 *   layer 2  the screen check removed              3,705 pass    NOT HELD
 *
 * The predicate underneath is tested from every angle — `approves`,
 * `withdrawsTheApproval`, `approvalBelongsToThePlan`, the multi-line scan, the
 * „დამტკიცებულია, ოღონდ…" case. The wall that CALLS it was held by nothing.
 * Same shape as row 210 the same afternoon: a well-tested piece behind an
 * untested wire, and this is the wire with people's names on the other side.
 *
 * BOTH LAYERS ARE PRODUCTION INCIDENTS THAT ALREADY HAPPENED.
 *
 *   Row 1, 14 September. approve_task_plan was called at 14:37:40 with no yes
 *   from the user at all — the model read its own persuasive summary as the
 *   approval. ask_contact fired on Inna Ruxadze and Natasha Mestvirishvili and
 *   was refused only because neither had ever opened Netai.
 *
 *   Ticket 19 G2, 15 September. A tap on a DRAFT card's „კი, გააგზავნე" was
 *   recorded as approving a three-person plan, and day one wrote to two people
 *   the founder had not chosen. `confirmed` cannot tell that apart — he did
 *   say yes.
 */
jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  __esModule: true,
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { planApprovalRefusal, readPlanConsentScreen } from '../chat.service';

/** The screen as it looks when a real plan card is the newest thing with buttons. */
function aPlanOnScreen(ownerSaid: string): ReturnType<typeof readPlanConsentScreen> {
  return readPlanConsentScreen(
    [{ at: '2026-09-22T10:00:00Z', labels: ['ვამტკიცებ', 'შევცვალოთ'] }],
    [{ at: '2026-09-22T10:01:00Z', content: ownerSaid }],
  );
}

describe('layer 1 — nothing is recorded without the user’s yes', () => {
  it.each([
    ['false', false],
    ['a string', 'true'],
    ['undefined', undefined],
    ['missing', null],
    ['1', 1],
  ])('refuses when confirmed is %s', (_label, confirmed) => {
    const refused = planApprovalRefusal(confirmed, aPlanOnScreen('ვამტკიცებ'));

    expect(refused?.reason).toBe('not_confirmed');
  });

  /**
   * ROW 1 IN ONE LINE: the model's own summary is not an approval. `confirmed`
   * is the model's claim about the user, and the gate exists because on
   * 14 September that claim was made with nothing behind it.
   */
  it('refuses even when the screen shows a plan the owner could have approved', () => {
    expect(planApprovalRefusal(false, aPlanOnScreen('ვამტკიცებ'))?.reason).toBe('not_confirmed');
  });

  it('lets a real yes through', () => {
    expect(planApprovalRefusal(true, aPlanOnScreen('ვამტკიცებ'))).toBeNull();
  });
});

describe('layer 2 — and the yes has to have been about the PLAN', () => {
  /**
   * G2 itself. The newest card with buttons is a DRAFT, its label is „კი,
   * გააგზავნე", the owner pressed it, and `confirmed` is true because he
   * genuinely did say yes — to something else.
   */
  it('refuses a yes given to another card’s button', () => {
    const draftOnTop = readPlanConsentScreen(
      [{ at: '2026-09-22T10:05:00Z', labels: ['კი, გააგზავნე', 'შევცვალოთ'] }],
      [{ at: '2026-09-22T10:06:00Z', content: 'კი, გააგზავნე' }],
    );

    expect(planApprovalRefusal(true, draftOnTop)?.reason).toBe('yes_was_about_something_else');
  });

  it('refuses when the owner asked for a change instead', () => {
    expect(planApprovalRefusal(true, aPlanOnScreen('შევცვალოთ'))?.reason).toBe(
      'yes_was_about_something_else',
    );
  });

  it('refuses when the owner said no', () => {
    expect(planApprovalRefusal(true, aPlanOnScreen('არა'))?.reason).toBe(
      'yes_was_about_something_else',
    );
  });

  /** Row 156: a short „ok" after the button does not erase the button. */
  it('keeps a yes that was followed by an ordinary line', () => {
    const afterwards = readPlanConsentScreen(
      [{ at: '2026-09-22T10:00:00Z', labels: ['ვამტკიცებ', 'შევცვალოთ'] }],
      [
        { at: '2026-09-22T10:01:00Z', content: 'ვამტკიცებ' },
        { at: '2026-09-22T10:02:00Z', content: 'გმადლობთ' },
      ],
    );

    expect(planApprovalRefusal(true, afterwards)).toBeNull();
  });
});

describe('a screen that could not be read does not block a real approval', () => {
  /**
   * The read is best-effort — a database hiccup must not refuse an approval
   * the owner really gave. Layer 1 still stands there, and layer 1 is the one
   * that needs no screen.
   */
  it('lets a confirmed approval through when the screen is null', () => {
    expect(planApprovalRefusal(true, null)).toBeNull();
  });

  it('still refuses an UNCONFIRMED one when the screen is null', () => {
    expect(planApprovalRefusal(false, null)?.reason).toBe('not_confirmed');
  });
});

describe('the refusal tells the model what to do instead', () => {
  it.each([
    ['not_confirmed', planApprovalRefusal(false, null)],
    ['yes_was_about_something_else', planApprovalRefusal(true, aPlanOnScreen('არა'))],
  ])('%s says what is missing and what to show', (_reason, refused) => {
    expect(String(refused?.error)).toContain('Not recorded');
    // „Try again" without saying what changed is how a model loops.
    expect(String(refused?.error).length).toBeGreaterThan(60);
  });
});

/**
 * AND THE WIRE, WHICH THE FIFTEEN TESTS ABOVE STILL DID NOT HOLD.
 *
 * With both layers restored and the handler's single call to
 * `planApprovalRefusal` replaced by `null`, all 3,720 tests passed. Every test
 * above exercises the decision directly, so none of them notices when nothing
 * asks for it — which is exactly the fault this whole file was written about,
 * one level further out.
 *
 * `executeToolCall` is a switch inside a function of several thousand lines and
 * there is no harness here that can drive it, so this is a source-level test —
 * the pattern `connectorCallsAreLogged` and `registryParity` already use in
 * this codebase for wiring a unit test cannot reach. It is weaker than
 * behaviour and it is not nothing: deleting the call fails it.
 */
describe('and the handler actually asks', () => {
  const source = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const approveCase = source.slice(
    source.indexOf("case 'approve_task_plan':"),
    source.indexOf("case 'save_user_note':"),
  );

  it('finds the approve_task_plan case at all', () => {
    // If this slice ever comes back empty the four tests below pass vacuously,
    // which would be the same fault wearing this file's own clothes.
    expect(approveCase.length).toBeGreaterThan(200);
  });

  it('calls the wall with the model’s confirmed flag and the screen', () => {
    expect(approveCase).toContain("planApprovalRefusal(input['confirmed'], screen)");
  });

  it('returns on a refusal rather than reading it and carrying on', () => {
    expect(approveCase).toContain('if (refusal !== null)');
    expect(approveCase).toContain('return { approved: false, error: refusal.error }');
  });

  /**
   * The order matters as much as the call: approveTaskPlan writes the
   * approval, and a wall consulted after it has already happened is not a
   * wall.
   */
  it('asks BEFORE recording the approval', () => {
    expect(approveCase.indexOf('planApprovalRefusal')).toBeLessThan(
      approveCase.indexOf('await approveTaskPlan('),
    );
  });
});
