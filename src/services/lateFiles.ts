import Anthropic from '@anthropic-ai/sdk';
import { RUN_HARD_TIMEOUT_MS } from '../config/runBudgets';

/**
 * #1921 (phone report point 174; thread 39569, 5 Oct). The owner wrote „check
 * these five companies" and attached the Excel six seconds later. The run for
 * the sentence had already read its history, so it never saw the file, and
 * answered „the list is received, but I cannot open its content in this
 * chat" — while the server had read all five rows.
 *
 * A file that arrives while a run is answering is noted here, and the run
 * takes it: between model rounds, or before its final answer. A run knows the
 * files already in its history by their file_id, so a file is given to a run
 * at most once and never to a run that already has it.
 *
 * In memory, like the thread run queue it sits beside: the upload and the run
 * it must reach live in the same process.
 */
const KEEP_MS = RUN_HARD_TIMEOUT_MS;
const MAX_FILES_KEPT_PER_THREAD = 5;
const FILE_ID_RE = /\(file_id (\d+)\)/gu;

interface ArrivedFile {
  readonly fileId: number;
  readonly eventText: string;
  readonly at: number;
}

const arrived = new Map<number, ArrivedFile[]>();

function fresh(threadId: number, now: number): ArrivedFile[] {
  const kept = (arrived.get(threadId) ?? []).filter((f) => now - f.at < KEEP_MS);
  if (kept.length === 0) arrived.delete(threadId);
  else arrived.set(threadId, kept);
  return kept;
}

/** The upload route: this conversation just received a file, with its history event. */
export function noteFileArrived(
  threadId: number,
  fileId: number,
  eventText: string,
  now: number = Date.now(),
): void {
  const kept = [...fresh(threadId, now), { fileId, eventText, at: now }];
  arrived.set(threadId, kept.slice(-MAX_FILES_KEPT_PER_THREAD));
}

/** The file ids a run's messages already carry. */
export function fileIdsIn(messages: readonly Anthropic.MessageParam[]): Set<number> {
  const text = JSON.stringify(messages);
  return new Set(Array.from(text.matchAll(FILE_ID_RE), (m) => Number(m[1])));
}

export interface LateFiles {
  /** The history events of files this run has not seen yet; each is given once. */
  take(now?: number): readonly string[];
}

export function lateFilesFor(
  threadId: number,
  history: readonly Anthropic.MessageParam[],
): LateFiles {
  const seen = fileIdsIn(history);
  return {
    take(now: number = Date.now()): readonly string[] {
      const unseen = fresh(threadId, now).filter((f) => !seen.has(f.fileId));
      for (const f of unseen) seen.add(f.fileId);
      return unseen.map((f) => f.eventText);
    },
  };
}

/** Test seam: forget every noted file. */
export function forgetArrivedFiles(): void {
  arrived.clear();
}
