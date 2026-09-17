import { RunLanguage } from './runLanguage';

/**
 * Ticket 20 row 33 — the first line of a goal that was split out of another
 * chat.
 *
 * The split itself works and the thread is no longer empty; what arrives in it
 * is the plan, four seconds later, with two buttons and nothing above them.
 * The sentence that asked for this goal, and the answer that followed it, stay
 * in the conversation the owner actually typed in. So the owner opens a chat
 * they did not start and is asked to approve a plan whose reason is in another
 * room — and approving it writes to real people in their name.
 *
 * WHY A FIXED STRING RATHER THAN THE OWNER'S OWN SENTENCE. Copying their line
 * into a thread they never typed in would put words under their name in a
 * place they did not write them, and every later reader of that thread —
 * including the engine — would take it for something they said here. The
 * provenance is what was missing, and the provenance is two goal titles.
 *
 * No em dashes, no bold: this line is written straight to the thread and does
 * not pass scrubMechanicalForStorage on the way.
 */
export function splitOpeningLine(previousGoalTitle: string, language: RunLanguage): string {
  switch (language) {
    case 'en':
      return (
        `I opened this as a goal of its own. The chat you wrote in is already working on ` +
        `"${previousGoalTitle}", and two goals in one conversation means buttons nobody can tell ` +
        `apart. Here I work on this one only. The plan follows in a moment.`
      );
    case 'ru':
      return (
        `Я вынес это в отдельную цель. В том разговоре уже идёт работа над «${previousGoalTitle}», ` +
        `а две цели в одном чате означают кнопки, которые не отличить друг от друга. ` +
        `Здесь я занимаюсь только этой. План будет через минуту.`
      );
    case 'es':
      return (
        `Lo abrí como una meta aparte. En esa conversación ya se trabaja en «${previousGoalTitle}», ` +
        `y dos metas en un mismo chat significan botones que nadie puede distinguir. ` +
        `Aquí me ocupo solo de esta. El plan llega enseguida.`
      );
    default:
      return (
        `ეს ცალკე მიზნად გავიტანე. იმ საუბარში უკვე მუშაობს „${previousGoalTitle}", ` +
        `და ერთ ჩატში ორი მიზნის ღილაკები ერთმანეთში აირევა. ` +
        `აქ მხოლოდ ამ მიზანზე ვმუშაობ. გეგმას ახლავე დაგიდებ.`
      );
  }
}
