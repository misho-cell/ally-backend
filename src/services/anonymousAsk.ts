import { RunLanguage } from './runLanguage';
import type { AskOpeningParts } from './askOpening';

/**
 * #7856 (engagement case, replay R3): the owner said „write to the other
 * assistants that one guy is looking for a masseur", and every ask still
 * opened with his name. An unnamed ask names nobody: not in the opening, the
 * thread title, the push, or the question the editor rewrote.
 */
export function anonymousOpeningParts(language: RunLanguage): AskOpeningParts {
  switch (language) {
    case 'en':
      return {
        first: "A Netai member's assistant is asking (they'd rather not be named yet):",
        followUp: "The same member's assistant has written again:",
        added: "The same member's assistant added:",
      };
    case 'ru':
      return {
        first: 'Ассистент одного из участников Netai спрашивает (имя пока не называет):',
        followUp: 'Ассистент того же участника написал ещё раз:',
        added: 'Ассистент того же участника добавил:',
      };
    case 'es':
      return {
        first:
          'El asistente de un miembro de Netai pregunta (prefiere no decir su nombre todavía):',
        followUp: 'El asistente del mismo miembro ha escrito otra vez:',
        added: 'El asistente del mismo miembro ha añadido:',
      };
    default:
      return {
        first: 'დამიკავშირდა Netai-ის ერთ-ერთი წევრის ასისტენტი (სახელს ჯერ არ ამბობს):',
        followUp: 'იმავე წევრის ასისტენტმა კიდევ მომწერა:',
        added: 'იმავე წევრის ასისტენტმა დამატებით მომწერა:',
      };
  }
}

/** Who is asking, where a name would stand: the title, and the editor's brief. */
export function anonymousAskerName(language: RunLanguage): string {
  switch (language) {
    case 'en':
      return 'a Netai member';
    case 'ru':
      return 'один из участников Netai';
    case 'es':
      return 'un miembro de Netai';
    default:
      return 'Netai-ის ერთ-ერთი წევრი';
  }
}

export function anonymousPushTitle(language: RunLanguage): string {
  switch (language) {
    case 'en':
      return "Netai — a member's assistant is asking you";
    case 'ru':
      return 'Netai — ассистент участника спрашивает тебя';
    case 'es':
      return 'Netai — el asistente de un miembro te pregunta';
    default:
      return 'Netai — ერთ-ერთი წევრის ასისტენტი გეკითხება';
  }
}

/** Shorter than this, a word is too common to be a name worth removing („ან", „Li"). */
const MIN_NAME_PART = 3;
const GEORGIAN_CASE_ENDING = '(?:ს|მა|ის|ისთვის|ზე|თან|ში|ით|ად|ო)?';

function escaped(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * The names the asker goes by — as registered and as the reader saved them —
 * taken out of the question, each with its Georgian case ending. What is left
 * reads „someone"; the question itself is kept.
 */
export function withoutAskerNames(
  question: string,
  names: readonly string[],
  language: RunLanguage,
): string {
  const parts = new Set(
    names
      .flatMap((name) => name.split(/\s+/u))
      .map((part) => part.trim())
      .filter((part) => part.length >= MIN_NAME_PART),
  );
  const someone = language === 'ka' ? 'ერთ-ერთი წევრი' : anonymousAskerName(language);
  let text = question;
  for (const part of [...parts].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(
      `(?<![\\p{L}])${escaped(part)}${GEORGIAN_CASE_ENDING}(?![\\p{L}])`,
      'giu',
    );
    text = text.replace(re, someone);
  }
  // Two names in a row („Giorgi Gagnidze") became the word twice; once is enough.
  const twice = new RegExp(`${escaped(someone)}(\\s+${escaped(someone)})+`, 'gu');
  return text.replace(twice, someone);
}
