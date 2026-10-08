jest.mock('../waveOrder', () => ({
  inWaveOrder: jest.fn((people: unknown[]) => Promise.resolve([...people])),
}));
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import {
  advanceWaveIfDone,
  nextWaveNote,
  notYetAsked,
  readWave,
  waveIsDone,
  waveMayWiden,
  waveRoomFor,
  waveSize,
  widenWaveOnSilence,
  type WaveSnapshot,
} from '../askWaves.service';
import type { PlanPerson } from '../taskPlans.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * #1685 (A2): an approved plan with eight people asks three; the next three
 * go when those are closed, or at the silent-day wake — never asking the
 * owner again in between (D119).
 */
const person = (n: number): PlanPerson => ({
  name: `Person ${n}`,
  phone: `+99559900000${n}`,
  route: 'network',
});
const EIGHT = [1, 2, 3, 4, 5, 6, 7, 8].map(person);
const TASK = {
  id: 7,
  plan: { solved_when: 'x', routes: [], people_to_involve: EIGHT, never_contact: [] },
  plan_version: 1,
  plan_approved_at: '2026-10-06T09:00:00Z',
};

/** Answers the four reads readWave makes, in order: wave number, wave asks, asked phones. */
function waveReads(
  wave: number,
  asks: Array<{ status: string; later_until?: string | null; expired_at?: string | null }>,
  askedDigits: string[],
): void {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ ask_wave: wave, next_wave_at: null }] } as never)
    .mockResolvedValueOnce({
      rows: asks.map((a) => ({
        declined_at: null,
        seen_at: null,
        later_until: null,
        expired_at: null,
        ...a,
      })),
    } as never)
    .mockResolvedValueOnce({ rows: askedDigits.map((digits) => ({ digits })) } as never);
}

const digitsOf = (n: number): string => `99559900000${n}`;

beforeEach(() => mockQuery.mockReset());

describe('the size of a wave', () => {
  it('is three for a favour and five for real work', () => {
    expect(waveSize({})).toBe(3);
    expect(waveSize({ real_work: true })).toBe(5);
  });

  it('takes the plan’s people in order, skipping everyone already asked', () => {
    const asked = new Set([digitsOf(1), digitsOf(3)]);
    expect(notYetAsked(EIGHT, asked).map((p) => p.name)).toEqual([
      'Person 2',
      'Person 4',
      'Person 5',
      'Person 6',
      'Person 7',
      'Person 8',
    ]);
  });
});

describe('the first wave', () => {
  it('lets exactly three of eight go, and refuses the fourth', async () => {
    for (const sent of [0, 1, 2]) {
      waveReads(
        1,
        Array.from({ length: sent }, () => ({ status: 'sent' })),
        Array.from({ length: sent }, (_, i) => digitsOf(i + 1)),
      );
      await expect(waveRoomFor(TASK, EIGHT[sent].phone, async () => false)).resolves.toEqual({
        allowed: true,
        wave: 1,
      });
    }
    waveReads(
      1,
      [{ status: 'sent' }, { status: 'sent' }, { status: 'sent' }],
      [1, 2, 3].map(digitsOf),
    );
    const fourth = await waveRoomFor(TASK, EIGHT[3].phone, async () => false);
    expect(fourth.allowed).toBe(false);
  });

  it('never holds back the person the owner named himself (D625)', async () => {
    waveReads(
      1,
      [{ status: 'sent' }, { status: 'sent' }, { status: 'sent' }],
      [1, 2, 3].map(digitsOf),
    );
    await expect(waveRoomFor(TASK, EIGHT[5].phone, async () => true)).resolves.toEqual({
      allowed: true,
      wave: 1,
    });
  });

  it('does not count anyone outside the plan, or a plan without a yes', async () => {
    await expect(waveRoomFor(TASK, '+995555000111', async () => false)).resolves.toEqual({
      allowed: true,
      wave: null,
    });
    await expect(
      waveRoomFor({ ...TASK, plan_approved_at: null }, EIGHT[0].phone, async () => false),
    ).resolves.toEqual({ allowed: true, wave: null });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('tells the run the three names and the owner’s one line', async () => {
    waveReads(1, [], []);
    const note = nextWaveNote(await readWave(TASK));
    expect(note).toContain('Person 1, Person 2, Person 3');
    expect(note).toContain('„ახლა ვეკითხები: Person 1, Person 2, Person 3"');
    expect(note).not.toContain('Person 4');
  });
});

describe('the next wave', () => {
  const snapshot = (over: Partial<WaveSnapshot>): WaveSnapshot => ({
    wave: 1,
    size: 3,
    inWave: 3,
    openInWave: 0,
    remaining: EIGHT.slice(3),
    nextWaveAt: null,
    ...over,
  });

  it('opens when every ask of the wave is closed', () => {
    expect(waveIsDone(snapshot({ openInWave: 0 }))).toBe(true);
    expect(waveIsDone(snapshot({ openInWave: 1 }))).toBe(false);
    expect(waveIsDone(snapshot({ inWave: 0 }))).toBe(false);
    expect(waveIsDone(snapshot({ remaining: [] }))).toBe(false);
  });

  it('opens at the silent-day wake even with a „later" still open', () => {
    expect(waveMayWiden(snapshot({ openInWave: 1 }))).toBe(true);
  });

  it('counts later and held as open, answered, declined and expired as closed', async () => {
    waveReads(
      1,
      [
        { status: 'answered' },
        { status: 'sent', expired_at: '2026-10-01T00:00:00Z' },
        { status: 'sent', later_until: '2099-01-01T00:00:00Z' },
        { status: 'held' },
      ],
      [1, 2, 3, 4].map(digitsOf),
    );
    const read = await readWave(TASK);
    expect(read?.inWave).toBe(4);
    expect(read?.openInWave).toBe(2);
  });

  it('moves the goal on once, with no new approval, when the wave closed', async () => {
    waveReads(
      1,
      [{ status: 'answered' }, { status: 'answered' }, { status: 'answered' }],
      [1, 2, 3].map(digitsOf),
    );
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    await expect(advanceWaveIfDone(TASK)).resolves.toBe(true);
    const [sql, params] = mockQuery.mock.calls[3];
    expect(String(sql)).toContain('SET ask_wave = ask_wave + 1');
    expect(String(sql)).toContain('AND ask_wave = $2');
    expect(params).toEqual([7, 1]);
  });

  it('stays put while one of the three is on „later", until the silent day', async () => {
    const later = [
      { status: 'answered' },
      { status: 'answered' },
      { status: 'sent', later_until: '2099-01-01T00:00:00Z' },
    ];
    waveReads(1, later, [1, 2, 3].map(digitsOf));
    await expect(advanceWaveIfDone(TASK)).resolves.toBe(false);

    waveReads(1, later, [1, 2, 3].map(digitsOf));
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    await expect(widenWaveOnSilence(TASK)).resolves.toBe(true);
  });

  it('names the next three for wave two', async () => {
    waveReads(2, [], [1, 2, 3].map(digitsOf));
    const note = nextWaveNote(await readWave(TASK));
    expect(note).toContain('ტალღა 2');
    expect(note).toContain('Person 4, Person 5, Person 6');
  });
});

describe('the wiring', () => {
  const read = (...parts: string[]): string =>
    readFileSync(join(__dirname, '..', ...parts), 'utf8');

  it('refuses a full wave at the one choke point every ask passes', () => {
    const asks = read('taskAsks.service.ts');
    expect(asks).toContain("return { sent: false, reason: 'wave_full', error: room.error };");
    expect(asks).toContain('isFollowUp ? null : waveNo,');
  });

  it('opens the next wave on a silent day and before a goal’s run', () => {
    expect(read('taskEngine.service.ts')).toContain('await widenWaveOnSilence(task)');
    expect(read('chat.service.ts')).toContain('await advanceWaveIfDone(task);');
  });

  it('numbers the asks of goals already in flight as their first wave', () => {
    const sql = read('..', 'db', 'postgres', 'migrations', '209_asks_go_in_waves.sql');
    expect(sql).toContain('UPDATE task_asks SET wave_no = 1');
  });
});
