jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: jest.fn() } },
}));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordClaudeUsage: jest.fn().mockResolvedValue(undefined),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import anthropic from '../../config/anthropic';
import {
  boundaryTerm,
  queryTerms,
  detectAskBoundary,
  saveAskBoundary,
  boundaryExclusionsFor,
} from '../askBoundary.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockCreate = (anthropic as unknown as { messages: { create: jest.Mock } }).messages.create;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

function modelSays(payload: unknown): void {
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    usage: {},
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue(rows([]) as never);
});

/**
 * ROW 247 — A PERSON'S OWN BOUNDARY HAD TO REACH OTHER PEOPLE'S SEARCHES, AND
 * IT REACHED NOTHING AT ALL.
 *
 * The seat measured the promise being broken twice on the live build,
 * 22 September, on two different accounts:
 *
 *   14:11:49  Test 9 tells its OWN assistant „I do not want to be asked
 *             anything about plumbers. Never pass me those questions."
 *   14:12:2x  save_user_note ok — „Got it, noted: no questions about plumbers
 *             or plumbing will come your way."
 *   14:12:54  a DIFFERENT account opens a plumber goal
 *   14:13:43  plan v1 names her
 *   14:14:52  ask 3797 SENT, sitting in her chat
 *
 * Two minutes thirty, with nothing capped or throttled. The note saved, it
 * persisted, her own assistant read it back to her, and it changed nothing.
 *
 * THE FOUNDER'S RULING, the same day (D421): „if a person prefers not to be
 * asked about it, she has not to be in plan, because the search system finds
 * that she has asked her assistant not to bother her with it." And the
 * reasoning that fixes the shape: „If my human assistant knows that Nino will
 * not answer, then my human assistant will never ask Nino about it."
 *
 * Absent, silently. Not named and marked; not named and refused at send.
 */
describe('the comparable form of a word', () => {
  /**
   * The same pair the tag search compares by, so a boundary and a search agree
   * about what a Georgian word is. „სანტექნიკი" and „santexniki" are one word
   * to this product and must be one word to a boundary.
   */
  it('folds a Georgian spelling onto its Latin twin', () => {
    expect(boundaryTerm('სანტექნიკი')).toBe(boundaryTerm('santexniki'));
  });

  it('drops a word too short to mean anything', () => {
    expect(queryTerms('a plumber in Tbilisi')).not.toContain('a');
    expect(queryTerms('a plumber in Tbilisi')).toContain('plumber');
  });

  it('is empty for a query with no real words', () => {
    expect(queryTerms('?? 12 !')).toEqual([]);
  });
});

describe('what the model is asked, and what it is not allowed to produce', () => {
  it('records the subject and its words when it is a boundary', async () => {
    modelSays({ boundary: true, topic: 'plumbers or plumbing', terms: ['plumber', 'plumbing'] });

    const found = await detectAskBoundary('Never pass me questions about plumbers.');

    expect(found?.topic).toBe('plumbers or plumbing');
    expect(found?.terms).toEqual(['plumber', 'plumbing']);
  });

  /**
   * A PREFERENCE ABOUT TONE IS NOT A BOUNDARY. „Keep answers short" would
   * otherwise remove somebody from every search containing the word „short".
   */
  it('records nothing when the model says it is not one', async () => {
    modelSays({ boundary: false });

    expect(await detectAskBoundary('Keep your answers short please.')).toBeNull();
  });

  /**
   * THE „EVERYTHING" BUTTON IS NOT AVAILABLE THROUGH THIS DOOR — the founder
   * refused it in the same ruling („It's not an option. I don't like it"), so
   * the brief says so and a boundary with no subject is not one.
   */
  it('tells the model that „about anything at all" is not one of these', async () => {
    modelSays({ boundary: false });
    await detectAskBoundary('Do not let anybody ask me anything, ever.');

    const brief = String(mockCreate.mock.calls[0][0].messages[0].content);
    expect(brief).toContain('ANY and EVERY subject is NOT one of these');
  });

  /**
   * FAIL-CLOSED HERE MEANS „NO BOUNDARY", WHICH IS EXACTLY TODAY'S BEHAVIOUR.
   * A model that is down leaves the product doing what it already does, so the
   * worst this change can do is what already happens. Inventing a boundary on
   * a failure would silently remove a real person from other people's searches
   * and nobody would ever see it.
   */
  it('records nothing when the model throws', async () => {
    mockCreate.mockRejectedValue(new Error('down'));

    expect(await detectAskBoundary('Never ask me about plumbers.')).toBeNull();
  });

  it('records nothing when the answer cannot be read', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'sorry?' }], usage: {} });

    expect(await detectAskBoundary('Never ask me about plumbers.')).toBeNull();
  });

  it('records nothing when it claims a boundary with no words', async () => {
    modelSays({ boundary: true, topic: 'plumbing', terms: ['a', 'it'] });

    expect(await detectAskBoundary('Never ask me about plumbers.')).toBeNull();
  });
});

describe('storing it', () => {
  it('stores one normalized term per row, against the note it came from', async () => {
    await saveAskBoundary('42', { topic: 'plumbing', terms: ['plumber', 'plumbing'] }, 7);

    expect(mockQuery).toHaveBeenCalledTimes(2);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO ask_boundaries');
    expect(sql).toContain('ON CONFLICT (user_id, term)');
    expect(params).toEqual(['42', 'plumbing', 'plumber', 7]);
  });

  /**
   * ONE TERM FAILING MUST NOT LOSE THE OTHERS, and none of it may fail the
   * note — the note is what the person actually asked for and is already
   * saved by the caller.
   */
  it('keeps going when one term cannot be written', async () => {
    mockQuery.mockRejectedValueOnce(new Error('nope') as never);

    const saved = await saveAskBoundary('42', { topic: 't', terms: ['plumber', 'plumbing'] }, 7);

    expect(saved).toBe(1);
  });
});

describe('the search side', () => {
  it('asks only when the query has words to ask about', async () => {
    expect(await boundaryExclusionsFor('   ')).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  /**
   * EXACT OR PREFIX EITHER WAY, AND DELIBERATELY NOT A SUBSTRING. „art" inside
   * „quarter" is how a boundary about art quietly removes somebody from a
   * search for a flat.
   */
  it('matches a term to a query word without matching inside one', async () => {
    await boundaryExclusionsFor('plumber');

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("ab.term LIKE w || '%'");
    expect(sql).toContain("w LIKE ab.term || '%'");
    expect(sql).not.toContain("'%' || w");
    expect((params[0] as string[])[0]).toBe('plumber');
  });

  /**
   * AND IT RETURNS NOBODY WHEN IT CANNOT READ — the opposite direction from
   * `acceptedIntroductionPhones`, for the same reason in both: fail towards
   * what the person in front of you can see and correct. A hiccup here must
   * not hide people nobody meant to hide.
   */
  it('hides nobody when the query fails', async () => {
    mockQuery.mockRejectedValue(new Error('down') as never);

    expect(await boundaryExclusionsFor('plumber')).toEqual([]);
  });
});

/**
 * THE WIRE, AND IT IS THE WHOLE POINT OF WHERE THIS WAS PUT.
 *
 * This project's most frequent fault, three times in three days, is the rule
 * on one wire while the other one keeps running. The boundary is therefore in
 * `getExcludedPhones` — the single function every search already asks „who
 * must not appear" — and not in each search in turn.
 */
describe('every subject search passes what it is searching for', () => {
  const block = readFileSync(join(__dirname, '..', 'block.service.ts'), 'utf8');

  it('is applied inside the one function the searches share', () => {
    expect(block).toContain('boundaryExclusionsFor(aboutQuery)');
    expect(block).toContain(
      'export async function getExcludedPhones(userId: string, aboutQuery?: string)',
    );
  });

  /**
   * ABSENT MEANS SOMETHING. A warm path to one named person and a country's
   * channels are not searches for a subject, so they pass nothing and behave
   * exactly as they did — which is what makes this change unable to alter a
   * caller nobody looked at.
   */
  it('changes nothing for a caller that names no subject', () => {
    const at = block.indexOf('export async function getExcludedPhones');
    expect(block.slice(at, at + 400)).toContain(
      "aboutQuery === undefined || aboutQuery.trim() === ''",
    );
  });

  it.each([
    ['tools/searchByTag.ts', 'getExcludedPhones(userId, tagQuery)'],
    ['tools/searchSecondDegree.ts', 'getExcludedPhones(userId, tagQuery)'],
    ['tools/searchByInsight.ts', 'getExcludedPhoneSet(userId, searchQuery)'],
  ])('%s hands its query to the exclusion', (file, call) => {
    expect(readFileSync(join(__dirname, '..', file), 'utf8')).toContain(call);
  });
});

/**
 * AND THE SENTENCE THE PERSON READS CHANGES WITH THE TRUTH OF IT.
 *
 * `NOTE_SCOPE` and `NOTE_REPLY_RULE` forbid promising that questions will stop,
 * because until today that promise was false. Keeping the ban over a boundary
 * that now works would be the same fault reflected: the product would keep
 * somebody's word and tell them it had not.
 */
describe('what the model is allowed to say afterwards', () => {
  const notes = readFileSync(join(__dirname, '..', 'userNotes.service.ts'), 'utf8');
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const mcp = readFileSync(join(__dirname, '..', 'mcp', 'handlers.ts'), 'utf8');

  it('says what to SAY, not only what not to say', () => {
    expect(notes).toContain('BOUNDARY_REPLY_RULE');
    expect(notes).toMatch(/questions about THIS SUBJECT will not reach them/);
  });

  /** It never widens: the founder refused the all-or-nothing button. */
  it('forbids widening it to everything', () => {
    const at = notes.indexOf('export const BOUNDARY_REPLY_RULE');
    expect(notes.slice(at, at + 400)).toContain('only this subject is covered');
  });

  /** Both surfaces, and both read the one field the save decided. */
  it.each([
    ['the app', chat],
    ['the connector', mcp],
  ])('%s flips the pair on the recorded boundary', (_surface, source) => {
    expect(source).toContain('note.boundaryTopic === undefined');
    expect(source).toContain('reply_rule: BOUNDARY_REPLY_RULE');
  });

  /**
   * THE NARRATION BEFORE THE CALL STILL PROMISES NOTHING, and that is not an
   * oversight. The step line is written BEFORE the tool runs, so at that
   * moment nobody knows whether a boundary will be recorded — the model would
   * be guessing, and it guessed wrong three times out of three in September.
   */
  it('keeps the narration silent, because the answer does not exist yet', () => {
    const at = chat.indexOf("name: 'save_user_note'");
    const tool = chat.slice(at, at + 1400);

    expect(tool).toContain('NARRATION BEFORE THE CALL must never say that questions will stop');
    expect(tool).toContain('obey `reply_rule` in the result');
  });
});

/**
 * AND THE WAY BACK, WHICH A SILENT FILTER CANNOT DO WITHOUT.
 *
 * The person is absent from other people's searches and nobody, including
 * them, is told. If the note they wrote were the only visible trace and
 * deleting it left the rows behind, they would have taken back the sentence
 * and stayed excluded for ever with nothing on any screen to explain it —
 * the 17 September guard again, which took search away from ten real goals
 * for three days because a filtered-out person looks like no person at all.
 */
describe('deleting the note lifts the boundary', () => {
  const notes = readFileSync(join(__dirname, '..', 'userNotes.service.ts'), 'utf8');

  it('is done from the one function that deletes notes', () => {
    const at = notes.indexOf('export async function deleteUserNotes');
    expect(notes.slice(at, at + 500)).toContain('await liftBoundariesFrom(userId, ids);');
  });

  it('is scoped to the owner and to those notes', () => {
    expect(notes).toContain(
      'DELETE FROM ask_boundaries WHERE user_id = $1::int AND note_id = ANY($2::bigint[])',
    );
  });

  /** And it says so, because an exclusion nobody can see is the whole danger. */
  it('says in the log that they are findable again', () => {
    const at = notes.indexOf('async function liftBoundariesFrom');
    expect(notes.slice(at, at + 700)).toContain('findable again');
  });
});
