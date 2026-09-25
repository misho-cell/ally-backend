import { readFileSync } from 'fs';
import { join } from 'path';
import { planAllows } from '../taskPlans.service';

/**
 * ROW 251 / D438 — THE TARGET'S OWN YES LOST TO A LIST IT WAS NEVER ON.
 *
 * The founder's rule: after the mediator's yes, the asker's and the solver's
 * assistants get a direct channel — the asker writes one line, it lands in the
 * solver's chat, the reply comes back the same way, and nobody is told to go
 * and write to somebody themselves.
 *
 * The wall in the way was `planAllows`. A plan is the OWNER saying „you may
 * write to these people". An accepted introduction is THE TARGET THEMSELVES
 * saying „yes, they may reach me", relayed by somebody who knows them both.
 * That is the stronger consent of the two, and it counted for nothing.
 *
 * WHY THIS FILE IS MOSTLY ABOUT WHAT IS *NOT* OPENED. This widens who the model
 * may write to, which is the one direction that cannot be corrected after the
 * fact — a message that should not have gone cannot be recalled. So the tests
 * that matter here are the three that keep it narrow, and they outnumber the
 * one that opens it.
 */
const plan = {
  version: 1,
  approved_at: '2026-09-23T08:00:00Z',
  people_to_involve: [{ phone: '+995500000001', name: 'In the plan' }],
  never_contact: [{ phone: '+995500000002', name: 'Never this one' }],
} as never;

const TARGET = '+995500000003';

describe('an accepted introduction opens the one door it should', () => {
  it('still refuses a stranger the plan does not name', () => {
    expect(planAllows(plan, TARGET)).toEqual({ allowed: false, reason: 'outside_plan' });
  });

  it('lets through the person who accepted, and says why', () => {
    expect(planAllows(plan, TARGET, [TARGET])).toEqual({
      allowed: true,
      reason: 'accepted_introduction',
    });
  });

  /** The spelling of a number is not the number. */
  it('matches on digits rather than on formatting', () => {
    expect(planAllows(plan, '+995 500 00 00 03', [TARGET]).allowed).toBe(true);
    expect(planAllows(plan, TARGET, ['995500000003']).allowed).toBe(true);
  });
});

describe('and it is checked in the right order, which is the whole safety of it', () => {
  /**
   * NEVER_CONTACT OUTRANKS AN ACCEPTANCE, AND IT HAS TO.
   *
   * These are two people saying different things: the target says „they may
   * reach me", the OWNER says „not this person, for this goal". It is the
   * owner's goal, and their „never" is about whether they want it at all — so
   * an acceptance cannot reach past it, even though the acceptance is the
   * stronger evidence of the target's own willingness.
   *
   * Written as its own test because getting the ORDER wrong inside the function
   * would leave every other test in this file green.
   */
  it('refuses somebody on never_contact even when they accepted', () => {
    expect(planAllows(plan, '+995500000002', ['+995500000002'])).toEqual({
      allowed: false,
      reason: 'never_contact',
    });
  });

  /** A goal with no plan is unchanged — the blanket gate decides elsewhere. */
  it('changes nothing where there is no plan', () => {
    expect(planAllows(null, TARGET, [TARGET])).toEqual({ allowed: true, reason: 'no_plan' });
  });

  /**
   * AND EVERY CALLER THAT DOES NOT PASS THE LIST IS UNTOUCHED. The parameter
   * defaults to empty, so nothing widens anywhere it was not deliberately
   * wired — which is what makes this safe to add to a function with other
   * callers.
   */
  it('opens nothing for a caller that passes no acceptances', () => {
    expect(planAllows(plan, TARGET, []).allowed).toBe(false);
    expect(planAllows(plan, TARGET).allowed).toBe(false);
  });
});

describe('the loader is scoped to one goal and one asker', () => {
  const plans = readFileSync(join(__dirname, '..', 'taskPlans.service.ts'), 'utf8');
  const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

  /**
   * ONE GOAL. An introduction accepted for a plumber must not open a channel
   * inside an unrelated goal, and the only thing preventing that is this
   * clause.
   */
  it('reads only this task’s acceptances, from this asker', () => {
    const at = plans.indexOf('export async function acceptedIntroductionPhones');
    const fn = plans.slice(at, at + 2600);

    expect(fn).toContain('WHERE ir.requester_task_id = $1');
    expect(fn).toContain("AND ir.status = 'accepted'");
  });

  /**
   * AND IT READS BOTH COLUMNS THE CONSENT CAN BE RECORDED IN.
   *
   * An accepted introduction names its target either by phone or, when the
   * target is a member, by user id. Reading only `target_phone` threw away six
   * real acceptances on production at the time of writing — 1520, 1420, 1321,
   * 1289, 1256, 1090 — each one a Netai member with a `"UserPhone"` row and a
   * recorded yes. The same shape this project keeps finding: the rule went on
   * one wire and the other one kept running.
   *
   * THE JOIN IS A LEFT JOIN AND THAT IS NOT A DETAIL. An inner join would drop
   * every acceptance whose target is not a member — the majority — and turn a
   * widening of reach into a narrowing of it.
   */
  it('resolves a member’s number from the id when no phone was stored', () => {
    const at = plans.indexOf('export async function acceptedIntroductionPhones');
    const fn = plans.slice(at, at + 2600);

    expect(fn).toContain('LEFT JOIN "UserPhone" up ON up."userId" = ir.target_user_id');
    expect(fn).toContain('COALESCE(ir.target_phone, up.phone)');
    expect(fn).not.toMatch(/\n\s*JOIN "UserPhone"/);
  });

  /**
   * THE SCOPE DID NOT MOVE WHEN THE REACH DID. Every clause that makes this an
   * acceptance for THIS goal by THIS asker is still in the same WHERE, and the
   * join added a column to read, not a row to match on.
   */
  it('keeps every scope clause it had before the join', () => {
    const at = plans.indexOf('export async function acceptedIntroductionPhones');
    const fn = plans.slice(at, at + 2600);

    for (const clause of [
      'ir.requester_task_id = $1',
      'ir.requester_user_id = $2::int',
      "ir.status = 'accepted'",
    ]) {
      expect(fn).toContain(clause);
    }
  });

  /**
   * THE CAST, BECAUSE I GOT IT WRONG AND PRODUCTION CAUGHT IT RATHER THAN THIS
   * FILE.
   *
   * The first version said `requester_user_id = $2::text`. That column is an
   * INTEGER, so every call failed with „operator does not exist: integer =
   * text" — the exact fault whose P0 comment I had quoted in the same change,
   * while congratulating myself for avoiding it on `submitted_by_user_id` three
   * files away. I checked the type of the column I had been warned about and
   * not the one beside it.
   *
   * The test that would have caught it is not a mock of `query`; it is this:
   * name the cast, against the type the database actually has. Both columns
   * asserted, since they sit in the same WHERE and were the two I confused.
   */
  it('casts each id to the type its column really is', () => {
    const at = plans.indexOf('export async function acceptedIntroductionPhones');
    const fn = plans.slice(at, at + 2600);

    expect(fn).toContain('AND ir.requester_user_id = $2::int');
    expect(fn).not.toContain('requester_user_id = $2::text');
  });

  /**
   * A DATABASE HICCUP MUST NARROW THE GATE, NOT WIDEN IT. Returning the phones
   * on failure is unthinkable; returning none costs a retry.
   */
  it('returns nothing when it cannot read', () => {
    const at = plans.indexOf('export async function acceptedIntroductionPhones');
    expect(plans.slice(at, at + 1200)).toContain('catch {\n    return [];');
  });

  /** And the wire, which is the part a unit test of the predicate cannot see. */
  it('is actually consulted where asks are created', () => {
    expect(asks).toContain('acceptedIntroductionPhones(taskId, fromUserId)');
    expect(asks).toContain('planAllows(planInForce(planRow), contactPhone, acceptedPhones)');
  });
});

/**
 * THE OTHER HALF OF THE ROW, AND WHY THE NUMBER HAS TO BE RECORDED AT
 * ACCEPTANCE OR NONE OF THE ABOVE FIRES.
 *
 * `planAllows` matches on a phone. Measured before any of this was written, of
 * every accepted introduction there has ever been:
 *
 *     accepted                                        37
 *       carrying a target phone                       14
 *       carrying a requester task                     13
 *       carrying BOTH — what the gate can use          4
 *
 * So the gate alone would have fixed four of thirty-seven and looked finished.
 * The missing phone is not an omission at the asking end: in a mediated
 * introduction the requester does not HAVE the number, which is the entire
 * reason they are asking a mediator. Acceptance is where it becomes known,
 * because the mediator is the person who has it.
 */
describe('acceptance records the number, which is what makes the gate reachable', () => {
  const intro = readFileSync(join(__dirname, '..', 'introduction.service.ts'), 'utf8');

  it('fills the target phone when the answer lands', () => {
    expect(intro).toContain('target_phone = COALESCE(');
    expect(intro).toContain('SELECT up.phone FROM "UserPhone" up');
  });

  /**
   * COALESCE, NOT AN OVERWRITE. A direct introduction resolved its phone when
   * it was created, from the requester's own book, and that is better evidence
   * than this lookup.
   */
  it('never overwrites a number already recorded', () => {
    const at = intro.indexOf('target_phone = COALESCE(');
    expect(intro.slice(at, at + 260)).toContain('COALESCE(\n           target_phone,');
  });
});

/**
 * THE THIRD GATE, FOUND BY GETTING THROUGH THE OTHER TWO.
 *
 * The tester's run on c61f4d3: the handle worked, the model called ask_contact
 * with the RIGHT number on the RIGHT goal — the first time anybody reached this
 * gate — and it was refused, because goal 7163 has carried a plan nobody
 * approved since 21 September. The channel worked and a two-day-old unapproved
 * draft stopped it. The owner got there in the end, through one extra approval.
 *
 * The draft is about who the OWNER will write to for this goal and it is right
 * that it waits for them. An accepted introduction is a different fact about a
 * different person: the owner ASKED for it and the target THEMSELVES said yes,
 * relayed by somebody who knows them both. Both parties have agreed about that
 * one person — more than the unapproved plan carried about anybody.
 */
describe('an unapproved plan does not block the person who accepted', () => {
  const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

  it('checks the acceptance before refusing for an unapproved plan', () => {
    expect(asks).toContain('const introAccepted =');
    // The draft test is named once and shared by both bypasses (row 251's
    // last piece added the owner's own instruction beside the acceptance).
    // The property is unchanged: the refusal reads the bypasses, not the raw
    // condition.
    expect(asks).toContain('const draftIsWaiting =');
    expect(asks).toContain('if (!introAccepted && !ownerNamedThem && draftIsWaiting) {');
  });

  /**
   * This task, this asker — and the scoping now lives in ONE place, because
   * two gates ask the same question (see the permission-wall describe below).
   * The property has not moved; the assertion follows it.
   */
  it('is scoped to the goal and the asker, not to the person alone', () => {
    const at = asks.indexOf('const acceptedIntroductionToThisPerson =');
    const block = asks.slice(at, at + 420);

    expect(at).toBeGreaterThan(0);
    expect(block).toContain('acceptedIntroductionPhones(taskId, fromUserId)');
    expect(block).toContain('phoneDigits(p) === phoneDigits(contactPhone)');
  });

  /**
   * AND IT ONLY EVER APPLIES WHERE THE OLD GATE WOULD HAVE FIRED. The condition
   * repeats `plan_proposed !== null && planInForce === null` rather than
   * standing alone, so a goal with no draft pays nothing for this and the
   * bypass cannot reach a case the wall was not already refusing.
   */
  it('costs a goal with no unapproved draft nothing', () => {
    // `draftIsWaiting` is the whole of the old condition, and BOTH bypasses
    // are gated on it — so a goal with no draft still asks neither question
    // and pays for neither.
    expect(asks).toContain(
      'const draftIsWaiting = (task.plan_proposed ?? null) !== null && planInForce(task) === null;',
    );
    expect(asks).toContain('const introAccepted = draftIsWaiting &&');
    expect(asks).toContain('draftIsWaiting && (await ownerJustNamedThisPerson())');
  });

  /** It says so in the log, or the next person cannot tell why an ask went. */
  it('leaves a line saying the draft was bypassed', () => {
    expect(asks).toContain('unapproved plan bypassed for an accepted introduction (row 251)');
  });
});

/**
 * THE LAST MILE — RESOLVING THE TARGET IN THE MEDIATOR'S OWN PHONEBOOK.
 *
 * MEASURED AFTER THE FIRST FIX RATHER THAN ASSUMED. Of the accepted, direct
 * introductions since it shipped: three, of which ONE carried a number and TWO
 * carried neither a number nor a user id. So resolving from `target_user_id`
 * helps nobody in the commonest case, because on a mediated request the
 * requester typed a NAME — not knowing the person is the whole premise.
 *
 * The mediator is the one person who certainly knows them, and they have just
 * said „yes, and hand the contact over".
 */
describe('the mediator’s own book is where the number comes from', () => {
  const intro = readFileSync(join(__dirname, '..', 'introduction.service.ts'), 'utf8');

  /**
   * EXACTLY ONE MATCH OR NOTHING, and this is the assertion whose absence would
   * be a disclosure rather than a bug: a wrong match hands a THIRD PERSON'S
   * number to somebody who asked to meet a different third person.
   */
  it('takes a single match and refuses to choose between two', () => {
    const at = intro.indexOf('let resolvedFromMediator');
    const block = intro.slice(at, at + 700);

    expect(block).toContain('matches.length === 1 ? matches[0] : null');
    expect(block).toContain('findContactPhonesByName(String(mediatorUserId), req.target_name, 2)');
  });

  /** Only on an accept, only on direct, and only when there is no number yet. */
  it('does not look unless the case calls for it', () => {
    const at = intro.indexOf('let resolvedFromMediator');
    const block = intro.slice(at, at + 400);

    expect(block).toContain("action === 'accept'");
    expect(block).toContain("opts.channel === 'direct'");
    expect(block).toContain('!req.target_phone');
  });

  /**
   * AND THE AMBIGUOUS CASE LEAVES A LINE. „Two Ninos in the book" is the reason
   * an introduction has no handle, and without the line the next person reads
   * it as the lookup not running at all.
   */
  it('says when it found several and chose none', () => {
    expect(intro).toContain('contacts match that name — no number recorded');
  });

  /**
   * THE STORED SPELLING, NOT THE DIGITS. `findContactPhonesByName` returns
   * digit strings; the owner is shown this number, so what is saved is the
   * mediator's own saved form rather than „995599010106".
   */
  it('stores the number as it was written, not as digits', () => {
    const at = intro.indexOf('target_phone = COALESCE(');
    const block = intro.slice(at, at + 700);

    expect(block).toContain('SELECT ua.phone FROM "UserAlias" ua');
    // readFileSync gives the SOURCE, where the escape is written twice.
    expect(block).toContain("regexp_replace(ua.phone, '\\\\D', '', 'g') = $6::text");
  });
});

/**
 * ⚠️ 25 SEPTEMBER — THE SAME ROW BROKE AGAIN, AT THE GATE ABOVE THIS ONE.
 *
 * The plan gate was opened on 23 September and the tester passed it twice.
 * Today, thread 24397: Test 16 accepted at 10:32:57, the owner typed „write to
 * Test 17 and ask when we could talk this week", and `ask_contact` was refused
 * twice — by the PERMISSION wall, which sits above the plan gate and which the
 * bypass never reached.
 *
 * D316 made the shape that exposes it: a goal born from a first-message
 * introduction goes out in the same turn with NO PLAN. Task 10168 was created
 * at 10:30:27, `request_introduction` succeeded at 10:32:04, and nothing on
 * that path records permission — so the goal that exists ONLY to reach one
 * person could not write to the one person who had agreed.
 *
 * Fixing the gate the tester happened to reach first, and not the class, is
 * the mistake this row has now made twice.
 */
describe('the permission wall does not block the person who accepted either', () => {
  const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

  it('lets an accepted introduction past the permission wall', () => {
    expect(asks).toContain(
      'if (!task.permission_granted && (await acceptedIntroductionToThisPerson())) {',
    );
    expect(asks).toContain('permission wall bypassed for an accepted introduction (row 251)');
  });

  /** And the wall itself is untouched for everybody else. */
  it('still refuses when there is no accepted introduction to that person', () => {
    expect(asks).toContain('} else if (!task.permission_granted) {');
    expect(asks).toContain('უნებართვოდ გაგზავნა შეუძლებელია');
  });

  /**
   * ONE QUESTION, ONE PLACE. Two gates asking „did this person accept" in two
   * copies is how the plan gate got the answer and the permission gate did
   * not. The lookup is shared and both call it.
   */
  it('asks the question once and shares the answer', () => {
    // Scoped to the consent block. There IS a second call to
    // `acceptedIntroductionPhones` further down, and it is a different
    // question: it runs for every ask including relays, and hands the whole
    // phone list to `planAllows` rather than a yes/no about one person.
    // Merging them would tie the relay path to this block for no gain — the
    // first version of this test asserted one call in the whole file, which
    // was stricter than the property and would have pushed somebody into
    // exactly that.
    const block = asks.slice(
      asks.indexOf('const acceptedIntroductionToThisPerson ='),
      asks.indexOf('// The recipient must be a registered member'),
    );
    const calls = block.match(/await acceptedIntroductionToThisPerson\(\)/g) ?? [];
    const lookups = block.match(/acceptedIntroductionPhones\(taskId, fromUserId\)/g) ?? [];

    expect(calls).toHaveLength(2);
    expect(lookups).toHaveLength(1);
  });

  /**
   * LAZY, because this is the hot path of every ask. The lookup runs only when
   * a gate is about to refuse — never on a send that was going through anyway.
   */
  it('costs an ordinary send nothing', () => {
    const at = asks.indexOf('const acceptedIntroductionToThisPerson =');
    const block = asks.slice(at, at + 300);

    expect(block).toContain('acceptedPhones ??=');
  });
});

/**
 * ⚠️ ROW 251, THE LAST PIECE — THE OWNER NAMED SOMEBODY AND WAS ASKED TO
 * APPROVE A PLAN TO DO IT.
 *
 * Thread 24534. Plan v1 said „Who I will ask: nobody". The owner typed „Ask
 * Netai Test 14 if they know a good accountant." The approve refusal now sends
 * the model to `grant_task_permission`, which grants it — and the ask still
 * died at the unapproved-plan gate, because `grantTaskPermission` does not
 * clear the draft.
 *
 * Misho, asked in plain words on 25 September: „ask X about Y" IS consent to
 * write to X. So the draft does not outrank the owner's own sentence for the
 * one person it names. Everybody else in the draft still waits.
 *
 * THIS DECIDES WHO RECEIVES A MESSAGE, so the tests that matter most here are
 * the ones where it must REFUSE.
 */
describe('the owner naming somebody outranks the draft, for that person only', () => {
  const service = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
  const matcher = service.slice(
    service.indexOf('const ownerJustNamedThisPerson'),
    service.indexOf('const draftIsWaiting'),
  );

  it('reads the owner’s own latest message, not the model’s and not an event', () => {
    expect(matcher).toContain("role = 'user'");
    expect(matcher).toContain("COALESCE(kind, '') <> 'event'");
    expect(matcher).toContain('ORDER BY created_at DESC LIMIT 1');
  });

  /** „Nino already knows about this" names Nino and instructs nothing. */
  it('requires an instruction, by the predicate D316 already uses', () => {
    expect(matcher).toContain('looksLikeContactInstruction(line)');
  });

  /**
   * WHOLE-LABEL CONTAINMENT, NOT WORD STEMS. „Netai Test 14" and „Netai Test
   * 15" share every word once „14" and „15" are dropped as too short — which
   * is exactly how a stem matcher sends the question to the wrong seat.
   */
  it('matches the whole label inside the sentence, not its words', () => {
    expect(matcher).toContain('POSITION(LOWER(TRIM(ua.alias)) IN LOWER($2)) > 0');
    expect(matcher).not.toMatch(/sameWord|stem|goalNamedIn/);
  });

  /**
   * THE LONGEST LABEL WINS AND A TIE REFUSES. „Nino" sits inside „ask Nino
   * Beridze", so without this a sentence about Nino Beridze would open the
   * gate for a different Nino.
   */
  it('lets the longest label decide, and refuses a tie', () => {
    expect(matcher).toContain('ORDER BY LENGTH(TRIM(ua.alias)) DESC');
    expect(matcher).toContain('LIMIT 2');
    expect(matcher).toContain('runnerUp.alias.trim().length === best.alias.trim().length');
  });

  /** And the winner has to be the person we are about to write to. */
  it('opens only for the person the sentence actually named', () => {
    expect(matcher).toContain('phoneDigits(best.phone) === phoneDigits(contactPhone)');
  });

  /** Short labels are where a wrong recipient comes from: „ana" inside „Anano". */
  it('ignores a label too short to be evidence', () => {
    expect(service).toContain('const MIN_NAMED_LABEL_CHARS = 4;');
    expect(matcher).toContain('LENGTH(TRIM(ua.alias)) >= $3');
  });

  /** A read that fails refuses, like every other gate in this file. */
  it('fails towards refusing', () => {
    expect(matcher).toContain('could not read who the owner named');
    expect(matcher.slice(matcher.indexOf('catch'))).toContain('return false');
  });

  /**
   * THE PERMISSION WALL IS UNTOUCHED. This opens the DRAFT gate only — the
   * owner's instruction still has to become permission through the tool that
   * records it, and every other gate in this function runs as it did.
   */
  it('does not open the permission wall', () => {
    expect(service).toContain(
      'if (!task.permission_granted && (await acceptedIntroductionToThisPerson())) {',
    );
    expect(service).not.toContain('permission_granted && (await ownerJustNamedThisPerson())');
  });

  /** It says so in the log, or nobody can tell later why an ask went. */
  it('leaves a line saying why the draft was bypassed', () => {
    expect(service).toContain('the owner named this person (row 251)');
  });
});
