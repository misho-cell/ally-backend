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
      return {
        text: t.morePending(count),
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
