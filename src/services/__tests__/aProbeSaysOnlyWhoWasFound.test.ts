jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../fullResearch.service', () => ({
  __esModule: true,
  researchEveryLevel: jest.fn(),
  researchCounts: jest.fn().mockReturnValue('own contacts: 1'),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { researchEveryLevel } from '../fullResearch.service';
import { probeCaseFrom, ProbeOutcome, probeResearch, whoWasFound } from '../researchProbe';

const mocked = <T>(fn: T): jest.Mock => fn as unknown as jest.Mock;
const BODY = {
  user_id: 186272,
  thread_id: 501,
  words: 'ბრენდირებული თერმოსი',
  owner_line: 'I need 30 branded thermoses',
  expected: ['Levan Japaridze', 'Nino Beridze'],
};

/** Misho, 17 Nov: „make the results measurably better" — the tester's cases, measured. */
describe('a research probe', () => {
  beforeEach(() => jest.clearAllMocks());

  it('takes a whole case and nothing less', () => {
    expect(probeCaseFrom(BODY)).toEqual({
      userId: 186272,
      threadId: 501,
      words: BODY.words,
      ownerLine: BODY.owner_line,
      expected: BODY.expected,
    });
    expect(probeCaseFrom({ ...BODY, expected: [] })).toBeNull();
    expect(probeCaseFrom({ ...BODY, thread_id: 'x' })).toBeNull();
    expect(probeCaseFrom({ ...BODY, words: '' })).toBeNull();
    expect(probeCaseFrom(null)).toBeNull();
  });

  it('finds a person whatever alphabet the findings hold them in', () => {
    const findings = [{ people: [{ name: 'ლევან ჯაფარიძე' }] }];
    expect(whoWasFound(findings, ['Levan Japaridze', 'Nino Beridze'])).toEqual({
      'Levan Japaridze': true,
      'Nino Beridze': false,
    });
  });

  it('runs only in the owner’s own conversation', async () => {
    mocked(query).mockResolvedValueOnce({ rows: [{ owns: false }] });
    const refused = await probeResearch(probeCaseFrom(BODY));
    expect(refused.outcome).toBe(ProbeOutcome.NotTheOwnersThread);
    expect(researchEveryLevel).not.toHaveBeenCalled();
  });

  it('answers who was found, and the counts — nothing else', async () => {
    mocked(query).mockResolvedValue({ rows: [{ owns: true }] });
    mocked(researchEveryLevel).mockResolvedValue({
      findings: [{ result: { people: [{ name: 'Nino Beridze', phone: '+995599000111' }] } }],
      related: [],
    });
    expect((await probeResearch(probeCaseFrom(BODY), { checkOnly: true })).outcome).toBe(
      ProbeOutcome.Ran,
    );
    expect(researchEveryLevel).not.toHaveBeenCalled();
    const probe = await probeResearch(probeCaseFrom(BODY));
    expect(probe).toEqual({
      outcome: ProbeOutcome.Ran,
      found: { 'Levan Japaridze': false, 'Nino Beridze': true },
      counts: 'own contacts: 1',
    });
  });
});

describe('the probe’s route', () => {
  const admin = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
    'utf8',
  );

  it('is POST /admin/research-probes, refusing a bad case or another’s conversation', () => {
    expect(admin).toContain("adminRouter.post('/research-probes'");
    expect(admin).toContain('[ProbeOutcome.BadInput]: 400');
    expect(admin).toContain('[ProbeOutcome.NotTheOwnersThread]: 403');
  });

  it('answers at once and logs who was found by position, never by name', () => {
    expect(admin).toContain('res.status(202).json({ success: true, data: { started: label } });');
    expect(admin).toContain("`#${i + 1} ${yes ? 'yes' : 'no'}`");
  });
});
