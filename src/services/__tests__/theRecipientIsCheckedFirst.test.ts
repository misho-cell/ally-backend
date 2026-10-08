jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { nextWaveNote } from '../askWaves.service';
import { orderCandidates } from '../waveOrder';
import {
  classify,
  fieldTerms,
  prematchMany,
  PrematchSource,
  PrematchWord,
} from '../prematch.service';

/**
 * 1694 (A11): four fictional seats with different private data get, for the same
 * ask, likely_yes / possibly / ask_him / not_his_field.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const GOAL = 'Need a customs broker for food exports';
const SEATS = {
  note: { phone: '+447700900101', id: '9101' },
  label: { phone: '+447700900102', id: '9102' },
  nothing: { phone: '+447700900103', id: '9103' },
  boundary: { phone: '+447700900104', id: '9104' },
};
const digits = (p: string): string => p.replace(/\D/g, '');

function seatData(): void {
  mockQuery.mockImplementation(((sql: string) => {
    const rows = (r: unknown[]): Promise<unknown> =>
      Promise.resolve({ rows: r, rowCount: r.length });
    if (sql.includes('FROM "UserPhone"'))
      return rows(Object.values(SEATS).map((s) => ({ phone: s.phone, user_id: s.id })));
    if (sql.includes('FROM ask_boundaries'))
      return rows([{ key: SEATS.boundary.id, text: 'customs' }]);
    if (sql.includes('FROM user_notes'))
      return rows([{ key: SEATS.note.id, text: 'I handle customs for food exporters' }]);
    if (sql.includes('FROM "UserTags"')) return rows([{ key: SEATS.label.phone, text: 'customs' }]);
    return rows([]);
  }) as never);
}

beforeEach(() => jest.clearAllMocks());

describe('the four words', () => {
  it('each seat gets its word, from its own data only', async () => {
    seatData();
    const words = await prematchMany(
      Object.values(SEATS).map((s) => s.phone),
      GOAL,
    );
    expect(words.get(digits(SEATS.note.phone))).toEqual({
      word: PrematchWord.LikelyYes,
      source: PrematchSource.OwnNote,
    });
    expect(words.get(digits(SEATS.label.phone))?.word).toBe(PrematchWord.Possibly);
    expect(words.get(digits(SEATS.nothing.phone))?.word).toBe(PrematchWord.AskHim);
    expect(words.get(digits(SEATS.boundary.phone))?.word).toBe(PrematchWord.NotHisField);
  });

  it('every read has a limit and a timeout', async () => {
    seatData();
    await prematchMany([SEATS.note.phone], GOAL);
    for (const call of mockQuery.mock.calls) {
      expect(String(call[0])).toContain('LIMIT $2');
      expect(call[2]).toBe(5_000);
    }
  });

  it('the need itself is not a field', () => {
    expect(fieldTerms(GOAL)).toEqual(expect.arrayContaining(['customs', 'broker']));
    expect(fieldTerms(GOAL)).not.toContain('need');
    expect(fieldTerms(GOAL)).not.toContain('for');
  });

  it('a non-member is asked as before', () => {
    expect(
      classify({ member: false, boundaryTerms: [], profileTexts: [], noteTexts: [], labels: [] }, [
        'customs',
      ]).word,
    ).toBe(PrematchWord.AskHim);
  });
});

describe('the waves follow the words', () => {
  it('likely_yes first, then possibly, ask_him, and the boundary last; the plan order within a word', () => {
    const people = [
      { name: 'boundary', phone: SEATS.boundary.phone },
      { name: 'nothing', phone: SEATS.nothing.phone },
      { name: 'label', phone: SEATS.label.phone },
      { name: 'note', phone: SEATS.note.phone },
    ];
    const words = new Map([
      [digits(SEATS.note.phone), { word: PrematchWord.LikelyYes, source: PrematchSource.OwnNote }],
      [digits(SEATS.label.phone), { word: PrematchWord.Possibly, source: PrematchSource.Label }],
      [
        digits(SEATS.boundary.phone),
        { word: PrematchWord.NotHisField, source: PrematchSource.Boundary },
      ],
    ]);
    expect(
      orderCandidates(people, { words, rates: new Map(), goalText: '' }).map((p) => p.name),
    ).toEqual(['note', 'label', 'nothing', 'boundary']);
  });

  it('the asker’s run is told names only, never a word', () => {
    const note = nextWaveNote({
      wave: 1,
      size: 3,
      inWave: 0,
      openInWave: 0,
      remaining: [{ name: 'Eka', phone: SEATS.note.phone, route: 'direct' } as never],
      nextWaveAt: null,
    });
    for (const word of Object.values(PrematchWord)) expect(note).not.toContain(word);
  });

  it('a first ask stores the word for the admin; the wave reads it', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain('prematch, prematch_source, prematch_at, field, prepared_answer,');
    const waves = readFileSync(join(__dirname, '..', 'askWaves.service.ts'), 'utf8');
    expect(waves).toContain('remaining: await inWaveOrder(');
  });
});
