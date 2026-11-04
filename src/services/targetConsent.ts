import { geoName } from './georgianCase';
import { isPlainYes } from './plainYes';
import { RunLanguage } from './runLanguage';

/**
 * #8945 (battery 5 Nov, case 6 ×3; the real Kurashvili case): when the go-between
 * said yes, the asker got a MEMBER target's number before the target was asked.
 * The founder: the target's assistant asks first, and the number (or the chat,
 * #8878) moves only after the target agrees. A target who is not on Netai has
 * no assistant to ask; for them nothing changes.
 *
 * The texts here are the server's own lines until the tester writes the prompt
 * part; they say only what happened.
 */

/** Only rows the question was put on and no answer has closed yet. */
export const TARGET_HAS_AGREED_SQL = '(ir.target_asked_at IS NULL OR ir.target_said_yes IS TRUE)';

export enum TargetAnswer {
  Yes = 'yes',
  No = 'no',
}

const TARGET_CHOICES: Readonly<Record<RunLanguage, Readonly<Record<TargetAnswer, string>>>> = {
  ka: { [TargetAnswer.Yes]: 'კი, გავიცნოთ', [TargetAnswer.No]: 'ახლა არა' },
  en: { [TargetAnswer.Yes]: "Yes, let's meet", [TargetAnswer.No]: 'Not now' },
  ru: { [TargetAnswer.Yes]: 'Да, давай познакомимся', [TargetAnswer.No]: 'Не сейчас' },
  es: { [TargetAnswer.Yes]: 'Sí, conozcámonos', [TargetAnswer.No]: 'Ahora no' },
};

/** The two buttons under the question, in the target's language. */
export function targetChoices(language: RunLanguage): string[] {
  const labels = TARGET_CHOICES[language] ?? TARGET_CHOICES.ka;
  return [labels[TargetAnswer.Yes], labels[TargetAnswer.No]];
}

/** Which answer this line is: a button in any language, or a plain yes. */
export function targetAnswerOf(line: string): TargetAnswer | null {
  const typed = line.trim();
  for (const labels of Object.values(TARGET_CHOICES)) {
    if (labels[TargetAnswer.Yes] === typed) return TargetAnswer.Yes;
    if (labels[TargetAnswer.No] === typed) return TargetAnswer.No;
  }
  return isPlainYes(typed) ? TargetAnswer.Yes : null;
}

type Line2 = (a: string, b: string) => string;
type Line3 = (a: string, b: string, c: string) => string;

const TARGET_QUESTION: Readonly<Record<RunLanguage, Line3>> = {
  ka: (between, asker, why) =>
    `${geoName(between, 'erg')} თანხმობა მისცა, რომ **${asker}** გაგაცნოს${why}.\n\n` +
    `გინდა გაიცნოთ ერთმანეთი? თუ კი, ${geoName(asker, 'dat')} შენს კონტაქტს გადავცემ.`,
  en: (between, asker, why) =>
    `${between} agreed to introduce you to **${asker}**${why}.\n\n` +
    `Would you like to meet? If yes, I will pass your contact to ${asker}.`,
  ru: (between, asker, why) =>
    `${between} согласился познакомить тебя с **${asker}**${why}.\n\n` +
    `Хочешь познакомиться? Если да, передам ${asker} твой контакт.`,
  es: (between, asker, why) =>
    `${between} aceptó presentarte a **${asker}**${why}.\n\n` +
    `¿Quieres conoceros? Si dices que sí, le paso tu contacto a ${asker}.`,
};

const WHY_PREFIX: Readonly<Record<RunLanguage, string>> = {
  ka: ' — მიზეზი: ',
  en: ' — their reason: ',
  ru: ' — причина: ',
  es: ' — su motivo: ',
};

export function targetQuestion(
  language: RunLanguage,
  between: string,
  asker: string,
  reason: string | null,
): string {
  const why = reason ? `${WHY_PREFIX[language] ?? WHY_PREFIX.ka}„${reason}"` : '';
  return (TARGET_QUESTION[language] ?? TARGET_QUESTION.ka)(between, asker, why);
}

const ASKER_WAITS: Readonly<Record<RunLanguage, Line2>> = {
  ka: (between, target) =>
    `\n\n${geoName(between, 'erg')} თანხმობა გამოთქვა. ახლა ${geoName(target, 'dat')} ვეკითხები — ` +
    'როგორც კი დათანხმდება, აქვე გეტყვი.',
  en: (between, target) =>
    `\n\n${between} said yes. I am asking ${target} now and will tell you here as soon as they agree.`,
  ru: (between, target) =>
    `\n\n${between} согласился. Сейчас спрашиваю ${target} — как только согласится, скажу здесь.`,
  es: (between, target) =>
    `\n\n${between} dijo que sí. Ahora le pregunto a ${target} y te aviso aquí en cuanto acepte.`,
};

export function askerWaitsLine(language: RunLanguage, between: string, target: string): string {
  return (ASKER_WAITS[language] ?? ASKER_WAITS.ka)(between, target);
}

const MEDIATOR_ASKED: Readonly<Record<RunLanguage, Line2>> = {
  ka: (asker, target) =>
    `მადლობა! ${geoName(target, 'dat')} ჯერ თავად ვკითხავ — თუ დათანხმდება, ` +
    `${geoName(asker, 'dat')} მის კონტაქტს შენი წიგნაკიდან გადავცემ.`,
  en: (asker, target) =>
    `Thank you! I will ask ${target} first — if they agree, ${asker} gets their contact from your phonebook.`,
  ru: (asker, target) =>
    `Спасибо! Сначала спрошу ${target} — если согласится, ${asker} получит контакт из твоей записной книжки.`,
  es: (asker, target) =>
    `¡Gracias! Primero le pregunto a ${target} — si acepta, ${asker} recibe su contacto de tu agenda.`,
};

export function mediatorAskedLine(language: RunLanguage, asker: string, target: string): string {
  return (MEDIATOR_ASKED[language] ?? MEDIATOR_ASKED.ka)(asker, target);
}

const TARGET_SETTLED: Readonly<
  Record<RunLanguage, Readonly<Record<TargetAnswer, (a: string) => string>>>
> = {
  ka: {
    [TargetAnswer.Yes]: (asker) => `კარგი! ${geoName(asker, 'dat')} შენი კონტაქტი გადავეცი.`,
    [TargetAnswer.No]: () => 'კარგი, არაფერს გადავცემ.',
  },
  en: {
    [TargetAnswer.Yes]: (asker) => `Done — ${asker} has your contact now.`,
    [TargetAnswer.No]: () => 'Fine, nothing goes to them.',
  },
  ru: {
    [TargetAnswer.Yes]: (asker) => `Готово — ${asker} получил твой контакт.`,
    [TargetAnswer.No]: () => 'Хорошо, ничего не передаю.',
  },
  es: {
    [TargetAnswer.Yes]: (asker) => `Hecho — ${asker} ya tiene tu contacto.`,
    [TargetAnswer.No]: () => 'Vale, no le paso nada.',
  },
};

export function targetSettledLine(
  language: RunLanguage,
  answer: TargetAnswer,
  asker: string,
): string {
  return (TARGET_SETTLED[language] ?? TARGET_SETTLED.ka)[answer](asker);
}

const OTHERS_HEAR: Readonly<
  Record<RunLanguage, Readonly<Record<TargetAnswer, (t: string) => string>>>
> = {
  ka: {
    [TargetAnswer.Yes]: (target) => `${geoName(target, 'erg')} დათანხმდა.`,
    [TargetAnswer.No]: (target) => `${geoName(target, 'erg')} ამჯერად უარი თქვა.`,
  },
  en: {
    [TargetAnswer.Yes]: (target) => `${target} agreed.`,
    [TargetAnswer.No]: (target) => `${target} said no for now.`,
  },
  ru: {
    [TargetAnswer.Yes]: (target) => `${target} согласился.`,
    [TargetAnswer.No]: (target) => `${target} пока отказался.`,
  },
  es: {
    [TargetAnswer.Yes]: (target) => `${target} aceptó.`,
    [TargetAnswer.No]: (target) => `${target} dijo que no por ahora.`,
  },
};

/** What the asker and the go-between read once the target answered. */
export function targetAnsweredLine(
  language: RunLanguage,
  answer: TargetAnswer,
  target: string,
): string {
  return (OTHERS_HEAR[language] ?? OTHERS_HEAR.ka)[answer](target);
}

/** The goal's run is told the target said no — in each language, never a number. */
export function targetDeclinedEvent(target: string): Readonly<Record<RunLanguage, string>> {
  return {
    ka:
      `${target}-მ გაცნობაზე ამჯერად უარი თქვა — შუამავალი თანხმობას იძლეოდა, მაგრამ მისი ` +
      'კონტაქტი არავის გადასცემია. მფლობელს ერთი ხაზით უთხარი და შემდეგი გზით გააგრძელე.',
    en:
      `${target} said no to the introduction for now — the mediator had agreed, but no contact ` +
      'was passed on. Tell the owner in one line and carry on with the next route.',
    ru:
      `${target} пока отказался от знакомства — посредник соглашался, но контакт никому не ` +
      'передан. Скажи владельцу одной строкой и продолжай следующим путём.',
    es:
      `${target} dijo que no a la presentación por ahora — el intermediario había aceptado, pero ` +
      'no se pasó ningún contacto. Díselo al dueño en una línea y sigue con la siguiente vía.',
  };
}
