import { answerText, GeminiHit, GeminiResponse, groundedHits } from './tools/geminiSearch';
import { RunLanguage } from './runLanguage';

/**
 * #8350 (founder, 29 Oct, after a real member's ask about a city office): an
 * ask that needs facts about the world gets them FIRST, from the web, with the
 * pages they come from — then what only Netai has, the route through the
 * member's own people. This file is the pure half: the question put to the
 * web, the answer read back, the member's message and the run's section.
 *
 * Never the engine's name in anything the member reads: an answer that names
 * it (when the member did not ask about it) is not shown at all.
 */
export const NO_WORLD_ANSWER = 'NONE';
const PEOPLE_LINE_RE = /^\s*PEOPLE:\s*(.*)$/imu;
const PEOPLE_NONE = 'none';
const PERSON_SEPARATOR = ';';
const FIELD_SEPARATOR = '|';
export const MAX_PEOPLE = 5;
export const MAX_SOURCES_SHOWN = 3;
const ENGINE_WORDS_RE = /gemini|google|search engine|საძიებო|გუგლ|поисков|buscador/iu;

export interface WorldPerson {
  readonly name: string;
  readonly role: string;
  readonly organisation: string;
}

export interface WorldAnswer {
  readonly text: string;
  readonly people: readonly WorldPerson[];
  readonly sources: readonly GeminiHit[];
}

const LANGUAGE_NAMES: Readonly<Record<RunLanguage, string>> = {
  ka: 'Georgian',
  en: 'English',
  ru: 'Russian',
  es: 'Spanish',
};

const SOURCES_LABEL: Readonly<Record<RunLanguage, string>> = {
  ka: 'წყაროები:',
  en: 'Sources:',
  ru: 'Источники:',
  es: 'Fuentes:',
};

/** The question as the web is asked it. */
export function worldQuestionPrompt(question: string, language: RunLanguage): string {
  return (
    'A member of a professional network in Georgia asked the question below. Search the web ' +
    'in Georgian AND in English, and trust the most recent sources: for an office or a post, ' +
    'the person who holds it now, not someone who held it before.\n' +
    `Answer in ${LANGUAGE_NAMES[language]}, speaking to the member directly, in at most six ` +
    'short sentences: the facts asked for, with each person’s full name, role and ' +
    'organisation, any public phone number or email an official page gives, and the date of ' +
    'the source when it names who holds a post. Do not say how the answer was found, and ' +
    'never mention a search, a search engine, Google or Gemini.\n' +
    `If the question is only about the member’s own contacts or private life, or the web ` +
    `cannot answer it, reply with exactly ${NO_WORLD_ANSWER}.\n` +
    'After the answer, on its own last line, write PEOPLE: followed by each person the answer ' +
    `names as name ${FIELD_SEPARATOR} role ${FIELD_SEPARATOR} organisation, separated by ` +
    `${PERSON_SEPARATOR} — or PEOPLE: ${PEOPLE_NONE}.\n\nQuestion: ${question}`
  );
}

/** Pure: the people the PEOPLE line names. */
export function peopleFromLine(line: string): WorldPerson[] {
  if (line.trim().toLowerCase() === PEOPLE_NONE) return [];
  const people: WorldPerson[] = [];
  for (const entry of line.split(PERSON_SEPARATOR)) {
    const [name = '', role = '', organisation = ''] = entry
      .split(FIELD_SEPARATOR)
      .map((field) => field.trim());
    if (name === '' || name.toLowerCase() === PEOPLE_NONE) continue;
    people.push({ name, role, organisation });
  }
  return people.slice(0, MAX_PEOPLE);
}

/** Pure: the answer's body and its PEOPLE line, apart. */
export function splitPeopleLine(raw: string): { body: string; people: WorldPerson[] } {
  const match = PEOPLE_LINE_RE.exec(raw);
  if (match === null) return { body: raw.trim(), people: [] };
  const body = (raw.slice(0, match.index) + raw.slice(match.index + match[0].length)).trim();
  return { body, people: peopleFromLine(match[1] ?? '') };
}

/** Pure: the answer the member may be shown, or null when there is none to show. */
export function worldAnswerFrom(data: GeminiResponse, question: string): WorldAnswer | null {
  const { body, people } = splitPeopleLine(answerText(data));
  if (body === '' || body.toUpperCase().startsWith(NO_WORLD_ANSWER)) return null;
  if (ENGINE_WORDS_RE.test(body) && !ENGINE_WORDS_RE.test(question)) return null;
  const sources = groundedHits(data);
  if (sources.length === 0) return null;
  return { text: body, people, sources };
}

/** The member's message: the answer, then the pages it comes from. */
export function worldAnswerMessage(answer: WorldAnswer, language: RunLanguage): string {
  const links = answer.sources
    .slice(0, MAX_SOURCES_SHOWN)
    .map((source) => (source.title === '' ? source.url : `${source.title}: ${source.url}`));
  return `${answer.text}\n\n${SOURCES_LABEL[language]}\n${links.join('\n')}`;
}

function personLine(person: WorldPerson): string {
  return [person.name, person.role, person.organisation].filter((f) => f !== '').join(' — ');
}

/** The run's section: what the member was already shown, and what is left to do. */
export function worldAnswerSection(answer: WorldAnswer): string {
  const people = answer.people.length === 0 ? 'none' : answer.people.map(personLine).join('; ');
  const sources = answer.sources.map((source) => source.url).join('; ');
  return (
    '\n\nALREADY ON THE OWNER’S SCREEN. Before this run the server answered the owner’s ' +
    'question from public web pages, and that answer is shown to them above your reply:\n' +
    `"""${answer.text}"""\nPeople it names: ${people}\nIts pages: ${sources}\n` +
    'Do not repeat it. Your reply adds only what the owner’s own network gives: look up each ' +
    'person named (search_contact_by_name, then find_warm_path to them) and the organisation ' +
    'named, as an employer. Say the route (the owner, the contact they know, the person, and ' +
    'whether to ask that contact), and anything the network confirms or contradicts in the ' +
    'answer above. If the network has nothing, say so in one sentence.'
  );
}
