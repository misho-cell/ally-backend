import { RunLanguage } from './runLanguage';
import { setThreadStatus } from './threadStatus.service';

/**
 * Team task #397 — founder D581 (Tornike, 2 October). While Netai searches, for
 * 30–50 seconds and more, the owner saw a list of step lines, or nothing. He
 * asked for ONE sentence that changes: contacts, then the second circle, then
 * the web, then writing the answer.
 *
 * The sentence is the thread's own status line. It is already stored on the
 * thread and broadcast to every device as `thread_updated`, so a reload reads
 * the current stage from the thread itself; nothing new is kept to survive it.
 * Each stage REPLACES the line; there is never a second one.
 *
 * FORWARD ONLY: a run that searches the web and then looks at a contact again
 * keeps saying „the web". The owner reads progress, not a log of tool calls.
 * Never on a wake: nobody is watching that run.
 */
export enum SearchStage {
  Contacts = 'contacts',
  SecondCircle = 'second_circle',
  Web = 'web',
  Writing = 'writing',
}

const STAGE_ORDER: readonly SearchStage[] = [
  SearchStage.Contacts,
  SearchStage.SecondCircle,
  SearchStage.Web,
  SearchStage.Writing,
];

export const STAGE_LINES: Readonly<Record<RunLanguage, Readonly<Record<SearchStage, string>>>> = {
  ka: {
    [SearchStage.Contacts]: 'ვეძებ შენს კონტაქტებში…',
    [SearchStage.SecondCircle]: 'ვეძებ შენი კონტაქტების კონტაქტებში…',
    [SearchStage.Web]: 'ვეძებ ინტერნეტში…',
    [SearchStage.Writing]: 'ვწერ პასუხს…',
  },
  en: {
    [SearchStage.Contacts]: 'Searching your contacts…',
    [SearchStage.SecondCircle]: 'Searching your contacts’ contacts…',
    [SearchStage.Web]: 'Searching the web…',
    [SearchStage.Writing]: 'Writing the answer…',
  },
  ru: {
    [SearchStage.Contacts]: 'Ищу в твоих контактах…',
    [SearchStage.SecondCircle]: 'Ищу в контактах твоих контактов…',
    [SearchStage.Web]: 'Ищу в интернете…',
    [SearchStage.Writing]: 'Пишу ответ…',
  },
  es: {
    [SearchStage.Contacts]: 'Buscando en tus contactos…',
    [SearchStage.SecondCircle]: 'Buscando en los contactos de tus contactos…',
    [SearchStage.Web]: 'Buscando en internet…',
    [SearchStage.Writing]: 'Escribiendo la respuesta…',
  },
};

const TOOL_STAGES: ReadonlyMap<string, SearchStage> = new Map([
  ['search_by_tag', SearchStage.Contacts],
  ['search_by_insight', SearchStage.Contacts],
  ['search_contact_by_name', SearchStage.Contacts],
  ['search_contacts_by_country', SearchStage.Contacts],
  ['search_roster', SearchStage.Contacts],
  ['search_second_degree', SearchStage.SecondCircle],
  ['find_warm_path', SearchStage.SecondCircle],
  ['web_search', SearchStage.Web],
  ['fetch_page', SearchStage.Web],
]);

/** The stage each run has reached; absent until its first search. */
const runStages = new Map<string, SearchStage>();

/** The furthest stage among a turn's tool calls, or null when none searches. */
export function stageOfTools(toolNames: readonly string[]): SearchStage | null {
  const stages = toolNames.flatMap((name) => TOOL_STAGES.get(name) ?? []);
  if (stages.length === 0) return null;
  return stages.reduce((a, b) => (STAGE_ORDER.indexOf(b) > STAGE_ORDER.indexOf(a) ? b : a));
}

function movesForward(runId: string, stage: SearchStage): boolean {
  const reached = runStages.get(runId);
  return reached === undefined || STAGE_ORDER.indexOf(stage) > STAGE_ORDER.indexOf(reached);
}

/**
 * Puts the stage on the thread's status line if it moves the run forward.
 * Awaited by the run, so a stage can never land after the run's final status.
 */
export async function showSearchStage(
  userId: string,
  threadId: number,
  runId: string,
  stage: SearchStage,
  language: RunLanguage,
): Promise<void> {
  if (!movesForward(runId, stage)) return;
  runStages.set(runId, stage);
  await setThreadStatus(userId, threadId, 'working', { statusLine: STAGE_LINES[language][stage] });
}

/** „Writing the answer" — only for a run that was shown searching first. */
export async function showWritingStage(
  userId: string,
  threadId: number,
  runId: string,
  language: RunLanguage,
): Promise<void> {
  if (!runStages.has(runId)) return;
  await showSearchStage(userId, threadId, runId, SearchStage.Writing, language);
}

/** The run is over; its final status has replaced the line. */
export function forgetSearchStage(runId: string): void {
  runStages.delete(runId);
}
