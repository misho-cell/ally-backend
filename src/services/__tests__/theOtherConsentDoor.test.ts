import { readFileSync } from 'fs';
import { join } from 'path';
import { ownerWordsGrantPermission, grantPermissionRefusal } from '../chat.service';

/**
 * THE CONSENT WALL HAD A DOOR BESIDE IT, AND IT WAS FOUND BY TRYING TO BUILD
 * ROW 104 RATHER THAN BY LOOKING FOR IT.
 *
 * Two tools record the owner's consent and both end at `permission_granted =
 * true`, the single flag `createAsk` reads before a message reaches a real
 * person's phone:
 *
 *   approve_task_plan       `confirmed` AND the screen check
 *   grant_task_permission   one argument, `task_id`, and a one-line handler
 *
 * Everything the wall refused could be had by calling the other tool. The only
 * thing in the way was a sentence in the tool description — and layer 1 of the
 * wall next door exists precisely because on 14 September the model read its
 * own summary as the owner's approval and `ask_contact` then fired on two real
 * people.
 *
 * MEASURED BEFORE BUILDING, so nothing here is dressed up as an incident:
 *
 *     goals ever permitted without an approval      2
 *     asks sent from them                           3
 *     goals permitted with no plan at all that sent 0
 *
 * Both look legitimate — one of them is „Tell Netai Test 2 I can do Thursday",
 * which is the exact shape this plan-free route exists for. Nothing went wrong.
 * The door was open, and the whole suite passed with it open.
 *
 * THE CONTROLS COME FIRST IN THIS FILE, ON PURPOSE. A wall that refuses
 * everything also produces „no unauthorised grants", and produces it by
 * breaking every honest one — a consent bug traded for a silence bug, which is
 * a trade this project has made by accident before. So the first thing asserted
 * is that the legitimate shapes still pass.
 */
describe('the honest grants still go through — the control, first', () => {
  /** A blanket yes, in plain words, with no card anywhere. */
  it.each(['კი, გააგზავნე', 'yes, go ahead', 'დიახ', 'ok, ask them'])(
    'lets a plain yes through: %j',
    (said) => {
      expect(ownerWordsGrantPermission(said, [])).toBe(true);
    },
  );

  /**
   * ROW 104 ITSELF. „A typed instruction naming one person and one action is
   * the yes" — the founder, 19 September. These are the sentences from the
   * contact-instruction measurement, and one of them is the real goal 6172 that
   * the live measurement above turned up.
   */
  it.each([
    'Tell Netai Test 2 I can do Thursday',
    'ask Tornike Abuladze if he knows a good philosopher',
    'თორნიკე აბულაძეს ჰკითხე თუ იცნობს კარგ ფილოსოფოსს',
  ])('takes a one-person one-action instruction as the yes: %j', (said) => {
    expect(ownerWordsGrantPermission(said, [])).toBe(true);
  });

  /**
   * „ask Tornike Abuladze IF he knows a good philosopher" IS THE REGRESSION
   * TEST FOR MY OWN FIRST VERSION, and it is above rather than here because it
   * now passes.
   *
   * `TAKES_IT_BACK` holds the negations and „if" is one of them — rightly, for
   * „yes, but only if…". Composed naively as „grants AND does not withdraw",
   * the rule read the founder's own example sentence as withdrawing an approval
   * nobody had given. Row 104 failed on the sentence row 104 is about, and the
   * test caught it rather than the reading.
   */

  /**
   * AND WHAT THIS DOES NOT COVER, WRITTEN DOWN RATHER THAN STRETCHED TO FIT.
   *
   * Row 104's LITERAL sentence — „Please send the introduction request through
   * them again" — names no person. „Them" is somebody established earlier in
   * the conversation, and resolving a pronoun is not something a regex at the
   * consent wall should be doing: the way to make this pass would be to drop
   * the requirement for a name, and a rule that accepts any imperative to send
   * is not a consent check any more.
   *
   * So this sentence is still refused, and row 104 is NOT closed by this file.
   * It is no worse than today either — on 22 September that sentence was
   * already refused, by the plan wall, which is how the row was filed. What
   * would settle it is a measurement of how often an owner types a
   * send-imperative that does NOT mean „go ahead and contact people", and that
   * measurement is not done.
   */
  it('does not pretend to cover row 104’s own sentence', () => {
    expect(
      ownerWordsGrantPermission('Please send the introduction request through them again', []),
    ).toBe(false);
  });

  /**
   * A DATABASE HICCUP MUST NOT BLOCK A PERMISSION THE OWNER REALLY GAVE. The
   * screen read is best-effort, so a null screen passes on `confirmed` alone —
   * the same concession the plan wall makes, for the same reason, and layer 1
   * still stands.
   */
  it('passes on confirmed alone when the screen could not be read', () => {
    expect(grantPermissionRefusal(true, null)).toBeNull();
  });
});

describe('and the door is shut', () => {
  /** LAYER 1, the one the model asserts. */
  it.each([[undefined], [false], ['true'], [null]])(
    'refuses when confirmed is not exactly true (%p)',
    (confirmed) => {
      const refusal = grantPermissionRefusal(confirmed, null);

      expect(refusal?.granted).toBe(false);
      expect(refusal?.reason).toBe('not_confirmed');
    },
  );

  /**
   * LAYER 2, AND IT IS THE ONE THAT MATTERS, because layer 1 is a boolean the
   * model fills in itself. This reads the owner's own lines out of the
   * database. `confirmed: true` with nothing the owner said behind it is
   * exactly the 14 September shape.
   */
  it('refuses a confirmed grant the owner never said', () => {
    const refusal = grantPermissionRefusal(true, {
      lastOwnerMessage: 'what do you think of the first one?',
      newestOfferedChoices: null,
      ownerSaidSinceCard: ['what do you think of the first one?'],
      labelsDealtAfterTheCard: [],
    });

    expect(refusal?.granted).toBe(false);
    expect(refusal?.reason).toBe('owner_did_not_say_so');
  });

  it('is not satisfied by silence', () => {
    expect(ownerWordsGrantPermission(null, [])).toBe(false);
    expect(ownerWordsGrantPermission('', [])).toBe(false);
    expect(ownerWordsGrantPermission('   ', [])).toBe(false);
  });

  /** An ordinary stated need is a GOAL, not a permission to write to anybody. */
  it.each([
    'I need a good photographer in Tbilisi for a wedding',
    'მჭირდება კარგი სტომატოლოგი თბილისში',
  ])('does not read a stated need as consent: %j', (said) => {
    expect(ownerWordsGrantPermission(said, [])).toBe(false);
  });

  /**
   * AND A YES TAKEN BACK IS NOT A YES. The same rule as the plan wall: find the
   * granting line, then let everything said after it decide whether it stands.
   */
  it('lets a later line take the permission back', () => {
    expect(ownerWordsGrantPermission(null, ['yes, go ahead'])).toBe(true);
    expect(ownerWordsGrantPermission(null, ['yes, go ahead', 'actually, change it'])).toBe(false);
  });

  /** A yes inside a withdrawal is not a yes either. */
  it('does not take „approved, only…" as a clean yes on its own', () => {
    expect(ownerWordsGrantPermission('დამტკიცებულია, ოღონდ შეცვალე', [])).toBe(false);
  });
});

/**
 * THE WIRE, because every assertion above holds the PREDICATE and this project
 * keeps finding that the piece is tested from every angle and the line that
 * calls it is not. The whole suite passed with this door wide open; it would
 * pass again if the handler stopped consulting the wall.
 */
describe('the handler and the schema, not merely the predicate', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('consults the wall before granting anything', () => {
    expect(chat).toContain(
      "const refused = grantPermissionRefusal(input['confirmed'], grantScreen);",
    );
    expect(chat).toContain('if (refused) return refused;');
  });

  /** Refused BEFORE the update, not after it. A granted permission is granted. */
  it('refuses before the flag is written', () => {
    const refusedAt = chat.indexOf('const refused = grantPermissionRefusal(');
    const writtenAt = chat.indexOf('granted: await grantTaskPermission(', refusedAt);

    expect(refusedAt).toBeGreaterThan(0);
    expect(writtenAt).toBeGreaterThan(refusedAt);
  });

  /**
   * AND THE TOOL ASKS FOR IT. A required argument is how the model learns to
   * send one; a wall that refuses an argument the schema never mentions would
   * refuse every call and be the silence bug in its purest form.
   */
  it('requires confirmed in the tool the model is given', () => {
    const at = chat.indexOf('const GRANT_TASK_PERMISSION_TOOL');
    const tool = chat.slice(at, at + 1400);

    expect(tool).toContain("required: ['task_id', 'confirmed']");
    expect(tool).toContain('confirmed: {');
  });

  /**
   * IT GRANTS A PERMISSION AND IT DOES NOT APPROVE A PLAN. Row 104's fix must
   * not become ticket 19 G2 in new clothes: a sentence naming ONE person must
   * never stand for a plan naming five. The plan wall is a separate function
   * and this one must not reach for it.
   */
  it('never touches the plan wall', () => {
    const at = chat.indexOf("case 'grant_task_permission':");
    const block = chat.slice(at, at + 700);

    expect(block).not.toContain('planApprovalRefusal');
    expect(block).not.toContain('approveTaskPlan');
  });
});
