import Anthropic from '@anthropic-ai/sdk';
import { RUN_HARD_TIMEOUT_MS } from '../../config/runBudgets';
import { isModelOnlyNudge, withoutModelOnlyNudges } from '../chat.service';
import { fileIdsIn, forgetArrivedFiles, lateFilesFor, noteFileArrived } from '../lateFiles';
import { LATE_FILE_PREFIX, lateFileNudge } from '../replyGuards';

/**
 * #1921 (phone report point 174; thread 39569, 5 Oct). „Check these five
 * companies" started a run; the Excel came six seconds later, after the run
 * had read its history, and the answer said the file could not be opened.
 * A file that arrives mid-answer now reaches the run that is answering.
 */
const THREAD = 39569;
const OTHER_THREAD = 39601;
const NOW = 1_000_000;

function eventFor(fileId: number): string {
  return `[მოვლენა] მფლობელმა ფაილი ატვირთა: „list.xlsx" (file_id ${fileId}).\n<file>\ncompany | city\n</file>`;
}

const HISTORY_WITHOUT_FILES: Anthropic.MessageParam[] = [
  { role: 'user', content: 'ეს ხუთი კომპანია შეამოწმე' },
];

beforeEach(() => forgetArrivedFiles());

describe('a file attached while the run answers', () => {
  it('is given to the run that had not seen it, once', () => {
    const late = lateFilesFor(THREAD, HISTORY_WITHOUT_FILES);
    expect(late.take(NOW)).toEqual([]);
    noteFileArrived(THREAD, 299, eventFor(299), NOW);
    expect(late.take(NOW + 1)).toEqual([eventFor(299)]);
    expect(late.take(NOW + 2)).toEqual([]);
  });

  it('is not given to a run whose history already holds it', () => {
    noteFileArrived(THREAD, 299, eventFor(299), NOW);
    const history: Anthropic.MessageParam[] = [
      ...HISTORY_WITHOUT_FILES,
      { role: 'user', content: eventFor(299) },
    ];
    expect(lateFilesFor(THREAD, history).take(NOW + 1)).toEqual([]);
  });

  it('stays in its own conversation', () => {
    noteFileArrived(OTHER_THREAD, 331, eventFor(331), NOW);
    expect(lateFilesFor(THREAD, HISTORY_WITHOUT_FILES).take(NOW + 1)).toEqual([]);
  });

  it('is forgotten once no run can still be answering', () => {
    noteFileArrived(THREAD, 299, eventFor(299), NOW);
    const late = lateFilesFor(THREAD, HISTORY_WITHOUT_FILES);
    expect(late.take(NOW + RUN_HARD_TIMEOUT_MS)).toEqual([]);
  });
});

describe('the file ids a history carries', () => {
  it('reads them from text and from content blocks', () => {
    const history: Anthropic.MessageParam[] = [
      { role: 'user', content: eventFor(7) },
      { role: 'user', content: [{ type: 'text', text: eventFor(8) }] },
    ];
    expect([...fileIdsIn(history)].sort()).toEqual([7, 8]);
  });
});

describe('the note that carries the file', () => {
  it('says the file is in hand and carries its content', () => {
    const note = lateFileNudge([eventFor(299)], false);
    expect(note.startsWith(LATE_FILE_PREFIX)).toBe(true);
    expect(note).toContain('არ თქვა, რომ ფაილს ვერ ხსნი');
    expect(note).toContain('company | city');
    // The tester's 41450: „გეგმაში დავინახე ატვირთული ფაილი" — there was no plan.
    expect(note).toContain('არ ახსენო, როგორ ან სად მოგივიდა');
    expect(note).not.toContain('თავიდან დაწერე');
  });

  it('after an answer, asks for the answer once again, written fresh', () => {
    expect(lateFileNudge([eventFor(299)], true)).toContain('თავიდან დაწერე');
  });

  it('never reaches the thread view', () => {
    const note = lateFileNudge([eventFor(299)], true);
    expect(isModelOnlyNudge(note)).toBe(true);
    const kept = withoutModelOnlyNudges([
      { role: 'user', content: 'ეს ხუთი კომპანია შეამოწმე' },
      { role: 'user', content: note },
    ]);
    expect(kept).toEqual([{ role: 'user', content: 'ეს ხუთი კომპანია შეამოწმე' }]);
  });
});
