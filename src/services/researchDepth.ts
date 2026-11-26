import type { RunLanguage } from './runLanguage';

/**
 * Misho, 26 Nov (point 2): „the owner decides how many companies Netai looks
 * up, how many people at each, through whom it looks for acquaintances and how
 * deep the search goes; the owner's tokens are spent by the search's size and
 * depth." After the quick answer the owner picks one of three depths; the full
 * research waits for the pick, runs at that size, and every search and page it
 * reads is charged as it happens, so a deeper search spends more.
 */
export enum ResearchDepth {
  Quick = 'quick',
  Normal = 'normal',
  Deep = 'deep',
}

export interface DepthSize {
  /** Companies the web level names. */
  readonly companies: number;
  /** People looked up at each company. */
  readonly peoplePerCompany: number;
  /** Companies whose people are looked up. */
  readonly headLookups: number;
  /** Company pages read to check they do this. */
  readonly pagesRead: number;
  /** Whether acquaintances are looked for three to five handshakes away. */
  readonly farLevels: boolean;
}

export const DEPTH_SIZES: Readonly<Record<ResearchDepth, DepthSize>> = {
  [ResearchDepth.Quick]: {
    companies: 5,
    peoplePerCompany: 2,
    headLookups: 5,
    pagesRead: 5,
    farLevels: false,
  },
  [ResearchDepth.Normal]: {
    companies: 10,
    peoplePerCompany: 3,
    headLookups: 10,
    pagesRead: 10,
    farLevels: false,
  },
  [ResearchDepth.Deep]: {
    companies: 20,
    peoplePerCompany: 5,
    headLookups: 20,
    pagesRead: 20,
    farLevels: true,
  },
};

export const RESEARCH_DEPTH_KIND = 'research_depth';

const ORDER: readonly ResearchDepth[] = [
  ResearchDepth.Quick,
  ResearchDepth.Normal,
  ResearchDepth.Deep,
];

interface DepthTexts {
  readonly question: string;
  /** The button, at most 20 characters (WhatsApp's limit). */
  readonly label: Readonly<Record<ResearchDepth, string>>;
  readonly line: (size: DepthSize) => string;
  readonly far: string;
  readonly spend: string;
  readonly started: (label: string) => string;
}

const TEXTS: Readonly<Record<RunLanguage, DepthTexts>> = {
  ka: {
    question: 'რამდენად ღრმად მოვძებნო სრულად?',
    label: {
      [ResearchDepth.Quick]: 'სწრაფი',
      [ResearchDepth.Normal]: 'ჩვეულებრივი',
      [ResearchDepth.Deep]: 'ღრმა',
    },
    line: (s) => `${s.companies} კომპანია, თითოეულში ${s.peoplePerCompany} ადამიანი`,
    far: ', ნაცნობები 3-5 ხელამდე',
    spend: 'რაც უფრო ღრმაა ძიება, მით მეტ ტოკენს ხარჯავს.',
    started: (label) => `კარგი, ვიწყებ: ${label}. როცა დასრულდება, აქვე მოგწერ.`,
  },
  en: {
    question: 'How deep should the full search go?',
    label: {
      [ResearchDepth.Quick]: 'Quick',
      [ResearchDepth.Normal]: 'Standard',
      [ResearchDepth.Deep]: 'Deep',
    },
    line: (s) => `${s.companies} companies, ${s.peoplePerCompany} people at each`,
    far: ', acquaintances up to 3-5 handshakes away',
    spend: 'The deeper the search, the more tokens it spends.',
    started: (label) => `Got it — starting: ${label}. I will write here when it is done.`,
  },
  ru: {
    question: 'Насколько глубоко искать?',
    label: {
      [ResearchDepth.Quick]: 'Быстро',
      [ResearchDepth.Normal]: 'Обычно',
      [ResearchDepth.Deep]: 'Глубоко',
    },
    line: (s) => `${s.companies} компаний, по ${s.peoplePerCompany} человека в каждой`,
    far: ', знакомые до 3-5 рукопожатий',
    spend: 'Чем глубже поиск, тем больше токенов он тратит.',
    started: (label) => `Хорошо, начинаю: ${label}. Напишу здесь, когда закончу.`,
  },
  es: {
    question: '¿Qué tan a fondo busco?',
    label: {
      [ResearchDepth.Quick]: 'Rápida',
      [ResearchDepth.Normal]: 'Normal',
      [ResearchDepth.Deep]: 'Profunda',
    },
    line: (s) => `${s.companies} empresas, ${s.peoplePerCompany} personas en cada una`,
    far: ', conocidos hasta 3-5 apretones de manos',
    spend: 'Cuanto más a fondo, más tokens gasta.',
    started: (label) => `De acuerdo, empiezo: ${label}. Te escribo aquí cuando termine.`,
  },
};

/** The card after the quick answer: the three depths, each with its size. */
export function depthCard(language: RunLanguage): { text: string; choices: string[] } {
  const t = TEXTS[language];
  const lines = ORDER.map((depth) => {
    const size = DEPTH_SIZES[depth];
    return `• ${t.label[depth]} — ${t.line(size)}${size.farLevels ? t.far : ''}`;
  });
  return {
    text: `${t.question}\n${lines.join('\n')}\n${t.spend}`,
    choices: ORDER.map((depth) => t.label[depth]),
  };
}

/** The depth card as a pending item of the run that gave the quick answer. */
export function depthCardItem(): { kind: string; task_id: null; payload: Record<string, unknown> } {
  return { kind: RESEARCH_DEPTH_KIND, task_id: null, payload: {} };
}

/** A typed pick is the button's word, alone or with one more („ღრმა ძიება"). */
const MAX_TYPED_PICK_WORDS = 2;

/** Pure: the depth a tapped (or typed) button names, in any language; null for anything else. */
export function depthTapOf(message: string): ResearchDepth | null {
  const words = message.trim().toLocaleLowerCase().split(/\s+/u);
  if (words.length > MAX_TYPED_PICK_WORDS) return null;
  for (const t of Object.values(TEXTS)) {
    const depth = ORDER.find((d) => t.label[d].toLocaleLowerCase() === words[0]);
    if (depth !== undefined) return depth;
  }
  return null;
}

/** The server's line once the owner has picked. */
export function depthStartedLine(language: RunLanguage, depth: ResearchDepth): string {
  const t = TEXTS[language];
  return t.started(t.label[depth]);
}
