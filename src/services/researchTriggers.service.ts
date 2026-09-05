import { LabelSignals } from './labelReader.service';

/**
 * THE TARGETS, Part 3 Task 3 — the trigger table.
 *
 * The label is the trigger and the web is the verdict (D113). This module is
 * the join between them: given what the labels said about somebody, it decides
 * WHAT to look up and WHAT TO TYPE, and nothing else. It performs no research,
 * writes no facts and judges nobody — Tasks 4–7 do the looking, Task 8 does
 * the judging.
 *
 * Every row of the founder's table is a named rule here, countable and
 * separately switchable, for the same reason the gates are: "the admin screen
 * shows how many people each rule sent where in the last run".
 */

/** One row of the founder's table. */
export type TriggerName =
  /** A name and ONE company word — the commonest shape by far. */
  | 'one_company_word'
  /** Several company words from different savers: the hustler's fingerprint. */
  | 'several_company_words'
  /** A company word thousands of people carry — look up the seat, not the firm. */
  | 'big_company_word'
  /** A small company word he ranks first on: probably HIS company. */
  | 'runs_it'
  /** Consultant, lawyer, auditor, broker — he serves his own clients. */
  | 'profession_with_clients'
  /** „axel" among the words — the roster is what confirms it, never the label. */
  | 'axel_hint'
  /** A startup or a programme word. No company needed (D111). */
  | 'startup_hint'
  /** Nothing but a name, and 30+ phonebooks hold him. */
  | 'name_only_but_known'
  /** A trade word and nothing anybody agrees on. */
  | 'trade_only'
  /** Nothing to go on yet. Parked, never dropped. */
  | 'nothing_to_go_on';

export const RESEARCH_TRIGGERS: readonly TriggerName[] = [
  'runs_it',
  'axel_hint',
  'startup_hint',
  'several_company_words',
  'big_company_word',
  'one_company_word',
  'profession_with_clients',
  'name_only_but_known',
  'trade_only',
  'nothing_to_go_on',
];

/** Where one step of the research goes looking. */
export type ResearchSource = 'register' | 'web' | 'linkedin' | 'roster';

export interface ResearchStep {
  source: ResearchSource;
  /**
   * What to type. Built here rather than at the worker, so the reason a search
   * was run and the words it used are the same object — a search nobody can
   * explain is a search nobody can fix.
   */
  query: string;
}

export interface ResearchPlan {
  phone: string;
  trigger: TriggerName;
  steps: ResearchStep[];
  /**
   * The target number this shape points at (THE TARGETS Part 1), or null when
   * the research has to come back first. Never a verdict — a pointer.
   */
  points_at_target: number | null;
}

/**
 * 30 or more phonebooks opens target 8 on the counts alone, whatever the
 * labels say — so a bare name held by a crowd is still worth researching.
 */
const CONNECTOR_PHONEBOOKS = Number(process.env.TARGET_CONNECTOR_PHONEBOOKS ?? 30);

/** Rules named here stop producing steps. They still report what they caught. */
function disabledTriggers(): ReadonlySet<string> {
  return new Set(
    (process.env.RESEARCH_TRIGGERS_OFF ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  );
}

export interface TriggerReport {
  trigger: TriggerName;
  enabled: boolean;
  /** People this rule matched. */
  matched: number;
  /** People it actually sent to research — zero while it is switched off. */
  planned: number;
}

/**
 * Which row of the table this person falls on.
 *
 * ORDER IS THE RULE. „runs it" is asked before „one company word" because a
 * man who IS his company needs the register pointed at the company, not at
 * him; the roster before everything because membership is a door on its own;
 * and a trade word only decides anything once nothing else has.
 */
export function triggerFor(signals: LabelSignals): TriggerName {
  if (signals.axel_hint) return 'axel_hint';
  if (signals.runs_it) return 'runs_it';
  if (signals.startup_hint && signals.org_count > 0) return 'startup_hint';
  if (signals.several_directions) return 'several_company_words';
  if (signals.in_big_organisation) return 'big_company_word';
  if (signals.org_count > 0) return 'one_company_word';
  if (signals.profession_with_clients) return 'profession_with_clients';
  if (signals.trade_only) return 'trade_only';
  if (signals.savers >= CONNECTOR_PHONEBOOKS) return 'name_only_but_known';
  return 'nothing_to_go_on';
}

/** The commonest word his savers use — the one worth searching with. */
function topWord(signals: LabelSignals): string {
  return signals.org_set[0] ?? '';
}

/**
 * What to look up for this person, and where.
 *
 * A name is needed for every query and the labels do not reliably carry one —
 * so the caller passes the crowd's best name for the number. With no name
 * there is nothing to type, and the plan comes back empty rather than
 * searching for a company and attributing whatever it finds to a stranger.
 */
export function planResearch(phone: string, name: string, signals: LabelSignals): ResearchPlan {
  const trigger = triggerFor(signals);
  const word = topWord(signals);
  const person = name.trim();
  const steps: ResearchStep[] = [];
  let pointsAt: number | null = null;

  if (person === '' && trigger !== 'axel_hint') {
    return { phone, trigger, steps: [], points_at_target: null };
  }

  switch (trigger) {
    case 'axel_hint':
      // Never the label: staff and portfolio founders carry „axel" too, and
      // plenty of real members never do. The roster is the only answer.
      steps.push({ source: 'roster', query: person });
      pointsAt = 9;
      break;
    case 'runs_it':
      // The company is searched, not the man: the register answers "who
      // directs this" far better than "what does this person own".
      steps.push({ source: 'register', query: word });
      steps.push({ source: 'web', query: `${person} ${word}` });
      pointsAt = 1;
      break;
    case 'startup_hint':
      // No register step. D111: "no registered company needed" — an empty
      // register must never park a startuper as NOT YET.
      steps.push({ source: 'web', query: `${person} ${word}` });
      steps.push({ source: 'web', query: `${word} startup` });
      pointsAt = 6;
      break;
    case 'several_company_words':
      for (const w of signals.org_set) steps.push({ source: 'register', query: w });
      steps.push({ source: 'web', query: person });
      steps.push({ source: 'linkedin', query: `${person} ${word}` });
      pointsAt = 7;
      break;
    case 'big_company_word':
      // The seat, and only the seat. The firm is known; what he does inside
      // it is the whole question, and no label will ever answer it.
      steps.push({ source: 'linkedin', query: `${person} ${word}` });
      steps.push({ source: 'web', query: `${person} ${word} director` });
      break;
    case 'one_company_word':
      steps.push({ source: 'register', query: `${person} ${word}` });
      steps.push({ source: 'web', query: `${person} ${word}` });
      break;
    case 'profession_with_clients':
      steps.push({ source: 'web', query: person });
      pointsAt = 4;
      break;
    case 'name_only_but_known':
      // The counts already opened target 8. The research only adds pluses, so
      // it stays cheap: the register by name, then the name alone.
      steps.push({ source: 'register', query: person });
      steps.push({ source: 'web', query: person });
      pointsAt = 8;
      break;
    case 'trade_only':
    case 'nothing_to_go_on':
      // Deliberately nothing. Parked, not dropped — another saver may write a
      // real word tomorrow, and then a different row of this table applies.
      break;
  }
  return { phone, trigger, steps, points_at_target: pointsAt };
}

/** Counts every rule's hits and decides, in one place, whether it acts. */
export class TriggerLedger {
  private readonly off: ReadonlySet<string>;
  private readonly matched = new Map<TriggerName, number>();
  private readonly planned = new Map<TriggerName, number>();

  constructor() {
    this.off = disabledTriggers();
  }

  /** Records the row this person fell on; returns the plan, emptied if off. */
  record(plan: ResearchPlan): ResearchPlan {
    this.matched.set(plan.trigger, (this.matched.get(plan.trigger) ?? 0) + 1);
    if (this.off.has(plan.trigger)) return { ...plan, steps: [] };
    if (plan.steps.length > 0) {
      this.planned.set(plan.trigger, (this.planned.get(plan.trigger) ?? 0) + 1);
    }
    return plan;
  }

  report(): TriggerReport[] {
    return RESEARCH_TRIGGERS.map((trigger) => ({
      trigger,
      enabled: !this.off.has(trigger),
      matched: this.matched.get(trigger) ?? 0,
      planned: this.planned.get(trigger) ?? 0,
    }));
  }
}
