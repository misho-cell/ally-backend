import { readFileSync } from 'fs';
import { join } from 'path';
import { ModerationVerdict } from '../moderation.service';
import { startEarlyModeration, verdictForShown } from '../earlyModeration';

const SAFE: ModerationVerdict = { safe: true };

/** #8524 (tester 82932): the reply check ran only after the guards, one after the other. */
describe('#8524: the reply check starts beside the guards', () => {
  it('uses the early verdict when the guards left the text as it was', async () => {
    const moderate = jest.fn(async (): Promise<ModerationVerdict> => SAFE);
    const early = startEarlyModeration('ნიკა ბერიძე თიბისში მუშაობს.', moderate);
    await expect(verdictForShown('ნიკა ბერიძე თიბისში მუშაობს.', early, moderate)).resolves.toBe(
      SAFE,
    );
    expect(moderate).toHaveBeenCalledTimes(1);
  });

  it('checks the changed text again when the guards changed it', async () => {
    const moderate = jest.fn(async (): Promise<ModerationVerdict> => SAFE);
    const early = startEarlyModeration('ნიკა — 555 12 34 56', moderate);
    await verdictForShown('ნიკა — [ნომერი დამალულია]', early, moderate);
    expect(moderate).toHaveBeenCalledTimes(2);
    expect(moderate).toHaveBeenLastCalledWith('ნიკა — [ნომერი დამალულია]');
  });

  it('checks the shown text when nothing started early', async () => {
    const moderate = jest.fn(async (): Promise<ModerationVerdict> => SAFE);
    await verdictForShown('გამარჯობა', null, moderate);
    expect(moderate).toHaveBeenCalledWith('გამარჯობა');
  });

  it('passes an early failure to where the verdict is awaited, never swallowed', async () => {
    const moderate = jest.fn(async (): Promise<ModerationVerdict> => {
      throw new Error('moderation down');
    });
    const early = startEarlyModeration('ტექსტი', moderate);
    await expect(verdictForShown('ტექსტი', early, moderate)).rejects.toThrow('moderation down');
  });

  it('is wired: started before the trail is saved, owner runs only, read at the check', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const start = chat.indexOf('const earlyVerdict: EarlyVerdict | null');
    expect(start).toBeGreaterThan(0);
    expect(chat.indexOf('await saveRunTrail(userId, threadId, pending);')).toBeGreaterThan(start);
    expect(chat.slice(start, start + 200)).toMatch(/moderationSkipped \|\| ownerAbsent/);
    expect(chat).toMatch(/await verdictForShown\(cleanedFinal, earlyVerdict,/);
  });
});
