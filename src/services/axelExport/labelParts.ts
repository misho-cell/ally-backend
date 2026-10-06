import { classifyToken, labelTokens } from '../labelReader.service';

/**
 * Part B of the Axel export: the parts of a phonebook label, read at export
 * time — the base stores none of them (only occupations, as facts). The same
 * reading the product uses (labelReader.classifyToken), so the export never
 * disagrees with what the assistant believes about a label.
 */
export type LabelScript = 'georgian' | 'latin' | 'mixed' | 'none';

export interface LabelParts {
  readonly script: LabelScript;
  readonly first_name: string;
  readonly surname: string;
  readonly company: string;
  readonly role: string;
}

const GEORGIAN_LETTER = /[ა-ჿᲐ-Ჿ]/u;
const LATIN_LETTER = /[a-zA-Z]/;

export function labelScript(label: string): LabelScript {
  const ka = GEORGIAN_LETTER.test(label);
  const lat = LATIN_LETTER.test(label);
  if (ka && lat) return 'mixed';
  if (ka) return 'georgian';
  return lat ? 'latin' : 'none';
}

const ROLE_KINDS = new Set(['role', 'trade', 'profession_with_clients']);

export function labelParts(label: string | null): LabelParts {
  const text = label ?? '';
  const names: string[] = [];
  const companies: string[] = [];
  const roles: string[] = [];
  labelTokens(text).forEach((token, i) => {
    const kind = classifyToken(token.lower, i === 0);
    if (kind === 'name') names.push(token.raw);
    else if (kind === 'organisation') companies.push(token.raw);
    else if (ROLE_KINDS.has(kind)) roles.push(token.raw);
  });
  return {
    script: labelScript(text),
    first_name: names[0] ?? '',
    surname: names.slice(1).join(' '),
    company: companies.join(' '),
    role: roles.join(' '),
  };
}

/** The founder's part C3: a label or fact naming a senior role. */
const SENIOR_ROLE_RE =
  /\b(ceo|cfo|coo|cto|founder|co-?founder|owner|director|chairman|president|minister|deputy|head of|managing partner|partner|vp|vice president)\b|დირექტორ|დამფუძნებ|მფლობელ|მინისტრ|მოადგილ|ხელმძღვანელ|თავმჯდომარ|პრეზიდენტ|უფროს/iu;

export function namesSeniorRole(text: string): boolean {
  return SENIOR_ROLE_RE.test(text);
}
