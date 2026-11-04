import { geoName } from './georgianCase';
import { RunLanguage } from './runLanguage';

/**
 * 1696 (A13, D679/D680): the person asked answers „not me — but ask Eka". The
 * chain used to stop there, or the line went to the asker garbled (task 1486).
 * Now, when the line names exactly one person in HIS OWN phonebook, his
 * assistant asks him one thing first: shall I ask Eka for the asker — with his
 * name, without it, or not at all. Nothing goes to Eka before his tap, and his
 * phonebook is never shown to the asker.
 */
export enum ReferralTap {
  Named = 'named',
  Unnamed = 'unnamed',
  No = 'no',
}

const REFERRAL_LABELS: Readonly<Record<RunLanguage, Readonly<Record<ReferralTap, string>>>> = {
  ka: {
    [ReferralTap.Named]: 'კი, და უთხარი, რომ მე გირჩიე',
    [ReferralTap.Unnamed]: 'კი, ჩემი სახელის გარეშე',
    [ReferralTap.No]: 'არა, არ ვკითხოთ',
  },
  en: {
    [ReferralTap.Named]: 'Yes, and say I suggested it',
    [ReferralTap.Unnamed]: 'Yes, without my name',
    [ReferralTap.No]: "No, let's not ask",
  },
  ru: {
    [ReferralTap.Named]: 'Да, и скажи, что это я посоветовал',
    [ReferralTap.Unnamed]: 'Да, без моего имени',
    [ReferralTap.No]: 'Нет, не будем',
  },
  es: {
    [ReferralTap.Named]: 'Sí, y di que lo sugerí yo',
    [ReferralTap.Unnamed]: 'Sí, sin mi nombre',
    [ReferralTap.No]: 'No, mejor no',
  },
};

const REFERRAL_QUESTION: Readonly<
  Record<RunLanguage, (referral: string, asker: string) => string>
> = {
  ka: (referral, asker) => `ვკითხო ${geoName(referral, 'dat')} ${geoName(asker, 'gen')}თვის?`,
  en: (referral, asker) => `Shall I ask ${referral} for ${asker}?`,
  ru: (referral, asker) => `Спросить у ${referral} — для ${asker}?`,
  es: (referral, asker) => `¿Le pregunto a ${referral} de parte de ${asker}?`,
};

/** The card's three buttons, in the reader's language. */
export function referralChoices(language: RunLanguage): string[] {
  const labels = REFERRAL_LABELS[language] ?? REFERRAL_LABELS.ka;
  return [labels[ReferralTap.Named], labels[ReferralTap.Unnamed], labels[ReferralTap.No]];
}

export function referralQuestion(language: RunLanguage, referral: string, asker: string): string {
  return (REFERRAL_QUESTION[language] ?? REFERRAL_QUESTION.ka)(referral, asker);
}

/** Which of the card's buttons this line is, in any language; null for anything else. */
export function referralTapOf(message: string): ReferralTap | null {
  const typed = message.trim();
  for (const labels of Object.values(REFERRAL_LABELS)) {
    for (const tap of Object.values(ReferralTap)) {
      if (labels[tap] === typed) return tap;
    }
  }
  return null;
}

const RELAYED_QUESTION: Readonly<Record<RunLanguage, (asker: string, question: string) => string>> =
  {
    ka: (asker, question) => `${geoName(asker, 'gen')}თვის გეკითხები: ${question}`,
    en: (asker, question) => `I'm asking for ${asker}: ${question}`,
    ru: (asker, question) => `Спрашиваю для ${asker}: ${question}`,
    es: (asker, question) => `Pregunto de parte de ${asker}: ${question}`,
  };

const ASKED_FOR_THEM: Readonly<Record<RunLanguage, (referral: string, asker: string) => string>> = {
  ka: (referral, asker) =>
    `ვკითხე ${geoName(referral, 'dat')}. პასუხს ${geoName(asker, 'dat')} გადავცემ.`,
  en: (referral, asker) => `I've asked ${referral}. The answer goes to ${asker}.`,
  ru: (referral, asker) => `Спросил у ${referral}. Ответ передам ${asker}.`,
  es: (referral, asker) => `Le pregunté a ${referral}. La respuesta le llegará a ${asker}.`,
};

const NOT_ON_NETAI: Readonly<Record<RunLanguage, (referral: string) => string>> = {
  ka: (referral) =>
    `${referral} ნეტაიზე ჯერ არ არის, ამიტომ აქედან ვერ ვკითხავ. თუ გინდა, შენი სახელით მოვიწვევ — მომწერე „მოიწვიე ${referral}".`,
  en: (referral) =>
    `${referral} isn't on Netai yet, so I can't ask from here. If you like, I can invite them in your name — just write „invite ${referral}".`,
  ru: (referral) =>
    `${referral} пока нет в Netai, поэтому отсюда спросить не получится. Если хочешь, приглашу от твоего имени — напиши «пригласи ${referral}».`,
  es: (referral) =>
    `${referral} todavía no está en Netai, así que no puedo preguntar desde aquí. Si quieres, lo invito en tu nombre: escribe «invita a ${referral}».`,
};

const DECLINED: Readonly<Record<RunLanguage, (asker: string) => string>> = {
  ka: (asker) => `კარგი, არავის ვკითხავ. ${geoName(asker, 'dat')} ვეტყვი, რომ ამაში ვერ დაეხმარე.`,
  en: (asker) => `Fine, I won't ask anyone. I'll let ${asker} know you couldn't help with this.`,
  ru: (asker) => `Хорошо, никого спрашивать не буду. Передам ${asker}, что помочь не получилось.`,
  es: (asker) => `Vale, no preguntaré a nadie. Le diré a ${asker} que no pudiste ayudar.`,
};

/** The asker's line, in the asker's goal: the question went one step further. */
const FOR_THE_ASKER: Readonly<Record<RunLanguage, (reader: string | null) => string>> = {
  ka: (reader) =>
    reader
      ? `${reader} შენთვის თავის ერთ ნაცნობს ეკითხება. პასუხს როგორც კი მივიღებ, გეტყვი.`
      : 'შენი კითხვა ერთი ნაბიჯით წინ წავიდა — ადამიანთან, ვინც შეიძლება იცოდეს. პასუხს როგორც კი მივიღებ, გეტყვი.',
  en: (reader) =>
    reader
      ? `${reader} is asking someone they know for you. I'll tell you as soon as the answer comes.`
      : "Your question went one step further, to someone who may know. I'll tell you as soon as the answer comes.",
  ru: (reader) =>
    reader
      ? `${reader} спрашивает для тебя своего знакомого. Как только будет ответ, скажу.`
      : 'Твой вопрос ушёл на шаг дальше — к человеку, который может знать. Как только будет ответ, скажу.',
  es: (reader) =>
    reader
      ? `${reader} le está preguntando por ti a alguien que conoce. Te aviso en cuanto llegue la respuesta.`
      : 'Tu pregunta avanzó un paso más, hasta alguien que puede saberlo. Te aviso en cuanto llegue la respuesta.',
};

export function relayedQuestion(language: RunLanguage, asker: string, question: string): string {
  return (RELAYED_QUESTION[language] ?? RELAYED_QUESTION.ka)(asker, question);
}

export function askedForThemLine(language: RunLanguage, referral: string, asker: string): string {
  return (ASKED_FOR_THEM[language] ?? ASKED_FOR_THEM.ka)(referral, asker);
}

export function notOnNetaiLine(language: RunLanguage, referral: string): string {
  return (NOT_ON_NETAI[language] ?? NOT_ON_NETAI.ka)(referral);
}

export function declinedLine(language: RunLanguage, asker: string): string {
  return (DECLINED[language] ?? DECLINED.ka)(asker);
}

export function askerLine(language: RunLanguage, reader: string | null): string {
  return (FOR_THE_ASKER[language] ?? FOR_THE_ASKER.ka)(reader);
}
