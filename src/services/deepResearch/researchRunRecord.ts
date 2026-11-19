import { query } from '../../db/postgres/client';
import {
  ProviderName,
  ResearchStep,
  SamePerson,
  StopReason,
  SubjectKind,
} from './deepResearch.types';

/** One page the research saw: where, through which service, at which step, and whose it was. */
export interface SourceRecord {
  readonly url: string;
  readonly provider: ProviderName;
  readonly step: ResearchStep;
  readonly same_person: SamePerson | null;
}

export interface RunRecord {
  readonly runId: string;
  readonly phone: string;
  readonly kind: SubjectKind;
  readonly load: string;
  readonly dryRun: boolean;
  readonly stopped: StopReason;
  readonly steps: readonly ResearchStep[];
  readonly sources: readonly SourceRecord[];
  readonly factsFound: number;
  readonly factsWritten: number;
  readonly costUsd: number;
}

const RECORD_QUERY_TIMEOUT_MS = 8_000;

export async function saveRun(run: RunRecord): Promise<void> {
  await query(
    `INSERT INTO deep_research_runs
       (run_id, phone, subject_kind, research_load, dry_run, stopped, steps, sources, facts_found,
        facts_written, cost_usd)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)`,
    [
      run.runId,
      run.phone,
      run.kind,
      run.load,
      run.dryRun,
      run.stopped,
      [...run.steps],
      JSON.stringify(run.sources),
      run.factsFound,
      run.factsWritten,
      run.costUsd,
    ],
    RECORD_QUERY_TIMEOUT_MS,
  );
}
