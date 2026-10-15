jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}));

import { fillResearchWorkers, RESEARCH_WORKERS } from '../registrationResearch.service';

/** F9 (the tester's 60358; Misho's yes to Q6): 200 sign-ups waited 200 minutes. */
describe('the registration research workers', () => {
  it('research several users at once, each taking the next as soon as it is done', async () => {
    let queued = 7;
    let atOnce = 0;
    let most = 0;
    const research = async (): Promise<boolean> => {
      if (queued === 0) return false;
      queued -= 1;
      atOnce += 1;
      most = Math.max(most, atOnce);
      await new Promise((resolve) => setImmediate(resolve));
      atOnce -= 1;
      return true;
    };

    expect(fillResearchWorkers(research, 3)).toBe(3);
    for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));

    expect(queued).toBe(0);
    expect(most).toBe(3);
    expect(fillResearchWorkers(async () => false, 3)).toBe(3);
  });

  it('starts no more than the limit while workers are busy', () => {
    const never = (): Promise<boolean> => new Promise<boolean>(() => undefined);
    expect(fillResearchWorkers(never, 2)).toBe(2);
    expect(fillResearchWorkers(never, 2)).toBe(0);
  });

  it('runs five at launch', () => {
    expect(RESEARCH_WORKERS).toBe(5);
  });
});
