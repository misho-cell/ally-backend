/**
 * Misho, 19 Nov: the people deep-research brief (Exa, Linkup, Firecrawl), with
 * the corrections he agreed to — no LinkedIn scraper, only our own members and
 * public office-holders, a cost ceiling per person and a stop rule.
 */

/** Who may be researched. Anyone else — a private contact — is never looked up. */
export enum SubjectKind {
  /** A Netai member with a live account: researched on their own professional trail. */
  Member = 'member',
  /** A company head named in a public register, matched to our number: the professional role only. */
  PublicPerson = 'public_person',
}

export enum ProviderName {
  Exa = 'exa',
  Linkup = 'linkup',
  Firecrawl = 'firecrawl',
}

/** The steps of one person's research, in the order they run. */
export enum ResearchStep {
  Find = 'find',
  Read = 'read',
  Widen = 'widen',
  ReadMore = 'read_more',
}

export interface ResearchSubject {
  readonly phone: string;
  readonly kind: SubjectKind;
  /** The person's name in every spelling we hold, most trusted first. */
  readonly names: readonly string[];
  /** Organisations our base already ties the person to. */
  readonly companies: readonly string[];
  readonly role: string;
  readonly city: string;
}

/** One page a search or a read returned. */
export interface SourceHit {
  readonly url: string;
  readonly title: string;
  readonly text: string;
  readonly provider: ProviderName;
}

export enum SamePerson {
  Yes = 'yes',
  Unsure = 'unsure',
  No = 'no',
}

/** What the model decided about one page. */
export interface SourceVerdict {
  readonly url: string;
  readonly samePerson: SamePerson;
}

/** One fact, in the form researchFactsByNumber writes. */
export interface FoundFact {
  readonly key: string;
  readonly value: string;
  readonly source_url: string;
  readonly status: 'confirmed' | 'possible';
}

/** What the reader returned for one batch of pages. */
export interface Findings {
  readonly verdicts: readonly SourceVerdict[];
  readonly facts: readonly FoundFact[];
}

export enum StopReason {
  AllStepsRun = 'all_steps_run',
  NothingNew = 'nothing_new',
  PersonBudget = 'person_budget',
  DailyBudget = 'daily_budget',
  /** The next step would not finish inside the request's time (the server cuts a request at 5 minutes). */
  OutOfTime = 'out_of_time',
}

export interface PersonReport {
  readonly phone_last4: string;
  readonly kind: SubjectKind;
  readonly dry_run: boolean;
  readonly load: string;
  readonly steps_run: readonly ResearchStep[];
  readonly stopped: StopReason;
  readonly sources_seen: number;
  readonly sources_same_person: number;
  readonly facts_found: number;
  readonly facts_written: number;
  readonly cost_usd: number;
  readonly facts: readonly FoundFact[];
}
