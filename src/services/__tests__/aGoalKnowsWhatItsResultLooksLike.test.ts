jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  __esModule: true,
  default: { end: jest.fn() },
}));

import { query } from '../../db/postgres/client';
import { resultBriefSection } from '../chat.service';
import {
  ResultKind,
  createTask,
  defaultResultBrief,
  cleanCheckpoints,
  isResultKind,
  nextCheckpoint,
  setResultBrief,
} from '../taskStore.service';

/**
 * #7822 (founder 26 Oct, D888–D891): a goal keeps the KIND of result it is
 * after, what the delivered result looks like and the kind's checkpoints, and
 * every run of it is told the next checkpoint instead of searching again.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => jest.clearAllMocks());

describe('the result brief (#7822)', () => {
  it('knows the eight kinds and nothing else', () => {
    expect(isResultKind('A')).toBe(true);
    expect(isResultKind('H')).toBe(true);
    expect(isResultKind('I')).toBe(false);
    expect(isResultKind(1)).toBe(false);
  });

  it('keeps the model’s checkpoints as steps with a done flag, and drops empties', () => {
    expect(
      cleanCheckpoints([
        { step: ' find who holds a masseur ', done: true },
        { step: '' },
        { step: 'ask that holder', done: 'yes' },
        'junk',
      ]),
    ).toEqual([
      { step: 'find who holds a masseur', done: true },
      { step: 'ask that holder', done: false },
    ]);
    expect(cleanCheckpoints('not a list')).toBeNull();
    expect(cleanCheckpoints([])).toBeNull();
  });

  it('points at the first checkpoint not done', () => {
    expect(
      nextCheckpoint([
        { step: 'one', done: true },
        { step: 'two', done: false },
        { step: 'three', done: false },
      ]),
    ).toBe('two');
    expect(nextCheckpoint([{ step: 'one', done: true }])).toBeNull();
    expect(nextCheckpoint(null)).toBeNull();
  });

  it('saves beside the free brief and keeps what is not given', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    await expect(
      setResultBrief('7', 4400, {
        kind: ResultKind.TrustedProvider,
        shape: null,
        checkpoints: null,
      }),
    ).resolves.toBe(true);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('result_kind = COALESCE($3, result_kind)');
    expect(String(sql)).toContain("status = 'open'");
    expect(params).toEqual([4400, '7', 'A', null, null]);
  });

  it('tells each run the kind, the shape and the next checkpoint', () => {
    const section = resultBriefSection({
      result_kind: 'A',
      result_shape: 'two trusted masseurs in Vake with a member who vouches',
      checkpoints: [
        { step: 'find who holds a masseur', done: true },
        { step: 'ask that holder to recommend one', done: false },
      ],
    });
    expect(section).toContain('შედეგის სახე: A');
    expect(section).toContain('two trusted masseurs');
    expect(section).toContain('ახლა იმუშავე შემდეგ ნაბიჯზე: ask that holder to recommend one');
    expect(resultBriefSection({})).toBe('');
  });
});

/** #7822 (tester 77135, v13 round 3): the model wrote the brief in about half the goals. */
describe('a goal that gets no brief from the model', () => {
  it('starts with a reach brief: a specific person, three steps to the introduction', () => {
    const brief = defaultResultBrief('reach');
    expect(brief.kind).toBe(ResultKind.SpecificPersonOrOrg);
    expect(brief.checkpoints).toHaveLength(3);
    expect(nextCheckpoint(brief.checkpoints)).toBe('ვინ იცნობს მას მფლობელის წრეში');
  });

  it('leaves a solve goal’s kind to the model, with steps but no guessed kind', () => {
    const brief = defaultResultBrief('solve');
    expect(brief.kind).toBeNull();
    expect(brief.shape).not.toBeNull();
    expect(brief.checkpoints?.every((c) => !c.done)).toBe(true);
  });

  it('is written with every goal, whichever path opens it (tester 77506: direct asks)', async () => {
    const mockQuery = query as jest.Mock;
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 41 }], rowCount: 1 });
    expect(await createTask('7', 'ნოტარიუსი', null, 'solve')).toEqual({ id: 41 });
    const [sql, params] = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
    expect(String(sql)).toContain('result_kind, result_shape, checkpoints');
    const brief = defaultResultBrief('solve');
    expect(params).toEqual(
      expect.arrayContaining([brief.shape, JSON.stringify(brief.checkpoints)]),
    );
  });
});
