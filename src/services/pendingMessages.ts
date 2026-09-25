import { geoName } from './georgianCase';
import { RunLanguage } from './runLanguage';

/**
 * Ticket 16 Task 98: one answer answers one question.
 *
 * Until now a waiting request, an old introduction or a follow-up was woven
 * into the END of whatever the user had just asked about, by the prompt, with
 * two bare buttons under it. Lika's recording of 11 September is the case: she
 * asked about a DJ, and the reply ended on an unrelated introduction request
 * with „კი, გაუგზავნე / არა, ახლა არა" beneath it. She could not tell what she
 * was agreeing to, and one of those buttons sends a message to a real person
 * in her name.
 *
 * So the pending item stops being part of the answer. Each one becomes its own
 * message, after the answer, with its own buttons — and the BUTTONS ARE
 * WRITTEN HERE, from the item's kind and payload, not by the model. That is
 * the half that matters: a button that says „გაუგზავნე ჩემი ნომერი Sulkhan-ს"
 * cannot be misread the way „კი" can.
 *
 * Nothing here invents news. Every sentence is built from a payload the engine
 * already wrote, and an item whose payload cannot produce one is skipped
 * rather than guessed at.
 */

export interface PendingItemInput {
  readonly kind: string;
  readonly task_id: number | null;
  readonly payload: Record<string, unknown>;
}

export interface RenderedPendingMessage {
  /** What the user reads. Deterministic; never the model's words. */
  readonly text: string;
  /** Buttons, each naming its own action. */
  readonly choices: string[];
  /** What this message is about, for the client and for the log. */
  readonly ref: {
    kind: string;
    task_id?: number;
    ask_id?: number;
    thread_id?: number;
    request_id?: number;
  };
  /**
   * The model-facing line that rides with it as an `event` row: the tool
   * instruction the engine wrote, so the NEXT run knows what the user's tap
   * means. Invisible to the user, exactly like an engine wake.
   */
  readonly instruction: string;
}

function str(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function num(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function bool(payload: Record<string, unknown>, key: string): boolean {
  return payload[key] === true;
}

// The Georgian is the product's language; English is here because a run can be
// in English and the buttons must match the answer above them.
interface PendingTexts {
  chorusAsk: (who: string) => string;
  chorusOpen: string;
  later: string;
  goalQuestionWith: (goal: string, question: string) => string;
  goalQuestionBare: (goal: string) => string;
  goalAnswerNow: string;
  askSilent: (who: string) => string;
  askKeepWaiting: string;
  askSomeoneElse: string;
  introHow: (who: string) => string;
  introWorked: string;
  introFailed: string;
  notYet: string;
  searchFollowUp: string;
  searchSolved: string;
  searchNot: string;
  /** The requester's name is missing — a person, still, not a blank. */
  someone: string;
  introDirect: (who: string) => string;
  introMediated: (who: string, target: string) => string;
  introMessage: (message: string) => string;
  introAcceptDirect: (who: string) => string;
  introAcceptMediated: (target: string) => string;
  introDecline: string;
  /**
   * Ticket 20 row 98, second pass — "more are still coming".
   *
   * The count used to be a sentence the PROMPT asked the model to append, and
   * the battery caught it glued to the end of three unrelated answers: the
   * mayor, the price, the English price. Tornike's word: the answer stays
   * clean and the note comes as its own short message with a button.
   *
   * It is a plural because "1 განახლება" and "6 განახლება" are different
   * sentences in both languages, and a number in a template that reads wrong
   * at one is a product that looks unfinished at that one.
   */
  morePending: (count: number) => string;
  morePendingOpen: string;
  /**
   * ⚠️ ROW 250 — „N MORE UPDATES ARE WAITING" WITHOUT SAYING WHAT THEY ARE.
   * The tester raised it THREE times on 25 September before I took it.
   *
   * The founder's rule: say what they are, or do not appear. A bare number is
   * a demand on somebody's attention with nothing to weigh it against — „9
   * more updates" could be nine search results or nine people waiting on an
   * answer, and those deserve very different amounts of worry. His own nine,
   * read from the base: six questions on his own goals, two debriefs, one
   * search result.
   *
   * A kind with no name here falls back to „განახლება" rather than vanishing:
   * a new kind must make the line vaguer, never shorter than the truth.
   */
  kindName: (kind: string, count: number) => string;
  morePendingKinds: (parts: readonly string[]) => string;
  /**
   * Row 262 — somebody the owner tagged with an organisation has just opened
   * Netai, and one of their open goals names that organisation.
   *
   * It says WHY it is on the screen. „Nino has joined" is a notification;
   * „Nino, who you have down as Arci, has joined, and your tiler goal is
   * waiting on Arci's contractor network" is a reason — and the owner can tell
   * at a glance whether the match is any good, which on a matched card is the
   * only defence they have.
   */
  newMemberFits: (who: string, organisation: string, goal: string) => string;
  newMemberAsk: string;
  /**
   * Row 275 / D496 — an introduction nobody answered in a fortnight.
   *
   * It says the request is CLOSED and that they may ask again, because both
   * halves matter: „no answer yet" leaves somebody waiting on a thing that is
   * over, and „it expired" without the second half reads as a door shutting.
   * It does NOT say the other person refused — they may never have seen it.
   */
  introExpired: (who: string, days: number) => string;
  introAskAgain: string;
  /** Nobody is written to without this being pressed. */
  someoneNew: string;
}

/**
 * „a, b and c". One part is itself; two are joined by the word alone.
 *
 * The founder wrote the line out himself — „Also waiting: 2 'how did it go'
 * questions and 1 search result" — and a comma where he put an „and" is the
 * difference between a sentence and an inventory.
 */
function listOut(parts: readonly string[], and: string): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} ${and} ${parts[parts.length - 1]}`;
}

const TEXTS: Record<'ka' | 'en', PendingTexts> = {
  ka: {
    chorusAsk: (who: string) => `„${who}"-ის მოწვევაზე შეკითხვა გელოდება, ცალკე თემაში.`,
    chorusOpen: 'ვნახავ ახლა',
    later: 'მოგვიანებით',
    goalQuestionWith: (goal: string, question: string) =>
      `მიზანი „${goal}" შენს პასუხს ელოდება: ${question}`,
    goalQuestionBare: (goal: string) => `მიზანი „${goal}" შენს პასუხს ელოდება.`,
    goalAnswerNow: 'ვუპასუხებ ახლა',
    askSilent: (who: string) => `${who}-სთვის გაგზავნილ კითხვას სამი დღეა პასუხი არ მოჰყოლია.`,
    askKeepWaiting: 'დაველოდოთ კიდევ',
    askSomeoneElse: 'სხვას ვკითხოთ',
    introHow: (who: string) => `${who}-თან გაცნობა დადასტურდა. გამოდგა?`,
    introWorked: 'გამოდგა',
    introFailed: 'ვერ გამოდგა',
    notYet: 'ჯერ არ მომხდარა',
    searchFollowUp: 'კვირის წინ რომ ვეძებდით — ის საქმე მოგვარდა?',
    searchSolved: 'მოგვარდა',
    searchNot: 'ვერ მოგვარდა',
    someone: 'Netai-ს მომხმარებელი',
    introDirect: (who: string) => `${geoName(who, 'dat')} შენი გაცნობა სურს.`,
    introMediated: (who: string, target: string) =>
      `${geoName(who, 'dat')} სურს, ${geoName(target, 'dat')} გააცნო.`,
    introMessage: (message: string) => ` მისი შეტყობინება: „${message}"`,
    introAcceptDirect: (who: string) => `დიახ, გავიცნობ ${geoName(who, 'dat')}`,
    introAcceptMediated: (target: string) => `დიახ, გავაცნობ ${geoName(target, 'dat')}`,
    introDecline: 'არა, ამჯერად არა',
    morePending: (count: number) =>
      count === 1 ? 'კიდევ ერთი განახლება გელოდება.' : `კიდევ ${count} განახლება გელოდება.`,
    morePendingOpen: 'ვნახოთ',
    kindName: (kind: string, count: number) => {
      switch (kind) {
        case 'goal_question':
          return `${count} კითხვა შენს მიზნებზე`;
        case 'debrief':
          return `${count} შეკითხვა — როგორ ჩაიარა`;
        case 'search_followup':
          return `${count} ძებნის შედეგი`;
        case 'chorus_ask':
          return `${count} შეკითხვა მოწვევაზე`;
        case 'intro_request':
          return `${count} გაცნობის მოთხოვნა`;
        case 'goal_feedback':
          return `${count} შეკითხვა დასრულებულ მიზანზე`;
        case 'new_member_for_goal':
          return `${count} ახალი წევრი შენს მიზნებზე`;
        case 'intro_expired':
          return `${count} დახურული გაცნობის მოთხოვნა`;
        case 'weekly_summary':
          return 'კვირის შეჯამება';
        default:
          return `${count} განახლება`;
      }
    },
    morePendingKinds: (parts) => `კიდევ გელოდება: ${listOut(parts, 'და')}.`,
    newMemberFits: (who, organisation, goal) =>
      `${who} ახლახან შემოვიდა Netai-ზე — შენთან ${organisation}-ით არის მონიშნული, ` +
      `და მიზანი „${goal}" სწორედ ${organisation}-ს ეხება. ვკითხოთ?`,
    newMemberAsk: 'კი, ვკითხოთ',
    introExpired: (who, days) =>
      `${geoName(who, 'dat')} გაცნობის მოთხოვნას ${days} დღეა პასუხი არ მოჰყოლია, ` +
      `ამიტომ დავხურეთ. თუ ისევ გჭირდება, თავიდან ვცადოთ.`,
    introAskAgain: 'თავიდან ვცადოთ',
    someoneNew: 'ახალი მომხმარებელი',
  },
  en: {
    chorusAsk: (who: string) => `A question about inviting „${who}" is waiting, in its own thread.`,
    chorusOpen: 'Open it now',
    later: 'Later',
    goalQuestionWith: (goal: string, question: string) =>
      `The goal „${goal}" is waiting on you: ${question}`,
    goalQuestionBare: (goal: string) => `The goal „${goal}" is waiting on your answer.`,
    goalAnswerNow: 'I will answer now',
    askSilent: (who: string) => `The question sent to ${who} has had no answer for three days.`,
    askKeepWaiting: 'Keep waiting',
    askSomeoneElse: 'Ask somebody else',
    introHow: (who: string) => `The introduction to ${who} was accepted. Did it work out?`,
    introWorked: 'It worked',
    introFailed: 'It did not work',
    notYet: 'Has not happened yet',
    searchFollowUp: 'The search from a week ago — did that get solved?',
    searchSolved: 'Solved',
    searchNot: 'Not solved',
    someone: 'A Netai user',
    introDirect: (who: string) => `${who} would like to meet you.`,
    introMediated: (who: string, target: string) =>
      `${who} is asking you to introduce them to ${target}.`,
    introMessage: (message: string) => ` Their message: "${message}"`,
    introAcceptDirect: (who: string) => `Yes, I will meet ${who}`,
    introAcceptMediated: (target: string) => `Yes, I will introduce them to ${target}`,
    introDecline: 'No, not now',
    morePending: (count: number) =>
      count === 1 ? 'One more update is waiting for you.' : `${count} more updates are waiting.`,
    morePendingOpen: 'Show them',
    kindName: (kind: string, count: number) => {
      switch (kind) {
        case 'goal_question':
          return count === 1 ? 'one question on your goals' : `${count} questions on your goals`;
        case 'debrief':
          return count === 1 ? 'one "how did it go"' : `${count} "how did it go" questions`;
        case 'search_followup':
          return count === 1 ? 'one search result' : `${count} search results`;
        case 'chorus_ask':
          return count === 1 ? 'one question about an invite' : `${count} questions about invites`;
        case 'intro_request':
          return count === 1 ? 'one introduction request' : `${count} introduction requests`;
        case 'goal_feedback':
          return count === 1
            ? 'one question about a finished goal'
            : `${count} questions about finished goals`;
        case 'new_member_for_goal':
          return count === 1 ? 'one new member for a goal' : `${count} new members for your goals`;
        case 'intro_expired':
          return count === 1
            ? 'one introduction request that expired'
            : `${count} introduction requests that expired`;
        case 'weekly_summary':
          return 'the weekly summary';
        default:
          return count === 1 ? 'one update' : `${count} updates`;
      }
    },
    morePendingKinds: (parts) => `Also waiting: ${listOut(parts, 'and')}.`,
    newMemberFits: (who, organisation, goal) =>
      `${who} has just opened Netai — you have them down as ${organisation}, and your goal ` +
      `„${goal}" is about ${organisation}. Shall we ask them?`,
    newMemberAsk: 'Yes, ask them',
    introExpired: (who, days) =>
      `Your request to be introduced to ${who} has had no answer for ${days} days, so it is ` +
      `closed. If you still need it, we can try again.`,
    introAskAgain: 'Try again',
    someoneNew: 'Somebody new',
  },
};

function textsFor(language: RunLanguage): PendingTexts {
  return language === 'ka' ? TEXTS.ka : TEXTS.en;
}

/**
 * One pending item as its own message, or null when its payload cannot say
 * anything true — a silent skip beats an invented sentence.
 */
export function renderPendingMessage(
  item: PendingItemInput,
  language: RunLanguage,
): RenderedPendingMessage | null {
  const t = textsFor(language);
  const p = item.payload ?? {};
  const instruction = str(p, 'instruction') ?? '';
  const who = str(p, 'who');

  switch (item.kind) {
    /**
     * Row 98, second pass. Not an item from the queue — the COUNT of what is
     * still behind it, which the prompt used to make the model say at the end
     * of whatever it was answering.
     *
     * A count of zero produces nothing rather than „0 more updates": silence
     * is what „nothing else is waiting" looks like, and a message saying so is
     * a message nobody needed.
     */
    case 'more_pending': {
      const count = num(p, 'count') ?? 0;
      if (count <= 0) return null;
      /**
       * Row 250: named when we know what they are, counted when we do not.
       * The breakdown is sent with the item; an older queued row without one
       * still renders, as the count it always was.
       */
      const byKind = (p.by_kind ?? null) as Record<string, number> | null;
      const named =
        byKind === null
          ? null
          : Object.entries(byKind)
              .filter(([, n]) => n > 0)
              // Most of them first: „6 questions on your goals" is the part
              // somebody decides on, and a list that opens with the single
              // stray item buries it.
              .sort((a, b) => b[1] - a[1])
              .map(([kind, n]) => t.kindName(kind, n));
      return {
        text:
          named === null || named.length === 0 ? t.morePending(count) : t.morePendingKinds(named),
        choices: [t.morePendingOpen, t.later],
        ref: { kind: item.kind },
        instruction,
      };
    }
    case 'chorus_ask': {
      if (who === null) return null;
      return {
        text: t.chorusAsk(who),
        choices: [t.chorusOpen, t.later],
        ref: { kind: item.kind, thread_id: num(p, 'thread_id') },
        instruction,
      };
    }
    case 'goal_question': {
      const goal = str(p, 'goal_title');
      if (goal === null) return null;
      const question = str(p, 'question');
      return {
        text: question === null ? t.goalQuestionBare(goal) : t.goalQuestionWith(goal, question),
        choices: [t.goalAnswerNow, t.later],
        ref: { kind: item.kind, ...(item.task_id !== null && { task_id: item.task_id }) },
        instruction,
      };
    }
    case 'debrief': {
      if (who === null) return null;
      // The two debriefs read the same in the queue and mean opposite things:
      // one is a question nobody answered, the other an introduction that was.
      if (str(p, 'about') === 'relayed_ask') {
        return {
          text: t.askSilent(who),
          choices: [t.askKeepWaiting, t.askSomeoneElse],
          ref: { kind: item.kind, ask_id: num(p, 'ask_id') },
          instruction,
        };
      }
      return {
        text: t.introHow(who),
        choices: [t.introWorked, t.introFailed, t.notYet],
        ref: { kind: item.kind },
        instruction,
      };
    }
    // Ticket 19 [18]. A request from another PERSON, waiting on this one.
    //
    // It used to reach the screen the way a pending update used to: a line the
    // prompt asked the model to append to whatever answer it was already
    // writing, with no buttons of its own. Lika's iPhone, 14 September: the
    // founder's request arrived folded under a plan's text, under the PLAN's
    // two buttons — so the only thing she could press answered the plan, and
    // there was nothing on screen that answered him. Request 1057 is still
    // pending ten days on, for exactly that reason.
    //
    // Same remedy as every other item here: its own message, after the answer,
    // with buttons that name the person and the act.
    case 'intro_request': {
      const requestId = num(p, 'request_id');
      if (requestId === undefined) return null;
      const who = str(p, 'who') ?? t.someone;
      const message = str(p, 'message');
      const tail = message === null ? '' : t.introMessage(message);
      const direct = bool(p, 'direct');
      if (direct) {
        return {
          text: t.introDirect(who) + tail,
          choices: [t.introAcceptDirect(who), t.introDecline, t.later],
          ref: { kind: item.kind, request_id: requestId },
          instruction,
        };
      }
      // Mediated: the reader is being asked to introduce the requester to a
      // third person. Without that person's name the sentence cannot be said
      // truthfully, so it is not said at all.
      const target = str(p, 'target_name');
      if (target === null) return null;
      return {
        text: t.introMediated(who, target) + tail,
        choices: [t.introAcceptMediated(target), t.introDecline, t.later],
        ref: { kind: item.kind, request_id: requestId },
        instruction,
      };
    }
    /**
     * Row 262 (D498 option B). Skipped rather than guessed at when the goal or
     * the organisation is missing from the payload: a card that cannot say
     * WHICH goal and WHICH organisation is a card the owner cannot judge, and
     * being able to judge it is the whole safeguard on a matched suggestion.
     */
    case 'new_member_for_goal': {
      const organisation = str(p, 'organisation');
      const goal = str(p, 'goal_title');
      if (organisation === null || goal === null) return null;
      return {
        text: t.newMemberFits(who ?? t.someoneNew, organisation, goal),
        choices: [t.newMemberAsk, t.introDecline, t.later],
        ref: { kind: item.kind, ...(item.task_id !== null && { task_id: item.task_id }) },
        instruction,
      };
    }
    /**
     * Row 275 / D496. Skipped when the payload cannot name who it was about:
     * „an introduction expired" with no name is a sentence somebody has to go
     * and research, which is the opposite of what a closing note is for.
     */
    case 'intro_expired': {
      const days = num(p, 'days_waiting');
      if (who === null || days === undefined) return null;
      return {
        text: t.introExpired(who, days),
        choices: [t.introAskAgain, t.later],
        ref: { kind: item.kind, request_id: num(p, 'request_id') },
        instruction,
      };
    }
    case 'search_followup':
      return {
        text: t.searchFollowUp,
        choices: [t.searchSolved, t.searchNot, t.notYet],
        ref: { kind: item.kind },
        instruction,
      };
    default:
      // thanks_loop and anything the engine adds later: the model still handles
      // it in the answer, exactly as before. Nothing is lost by not knowing it.
      return null;
  }
}
