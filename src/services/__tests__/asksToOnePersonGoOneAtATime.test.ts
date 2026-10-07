import { readFileSync } from 'fs';
import { join } from 'path';
import { oneAtATimeFor } from '../recipientLock';

/** 2582 (LM-002): six askers 1.5 s apart → three or four questions over the two a day. */
describe('asksToOnePersonGoOneAtATime', () => {
  it('runs calls for one number strictly one after another', async () => {
    const log: string[] = [];
    const slow = (name: string, ms: number) => async (): Promise<string> => {
      log.push(`${name} start`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`${name} end`);
      return name;
    };
    const results = await Promise.all([
      oneAtATimeFor('+995 500 000 001', slow('a', 30)),
      oneAtATimeFor('995500000001', slow('b', 5)),
      oneAtATimeFor('995-500-000-001', slow('c', 1)),
    ]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(log).toEqual(['a start', 'a end', 'b start', 'b end', 'c start', 'c end']);
  });

  it('lets two different numbers run side by side', async () => {
    const log: string[] = [];
    await Promise.all([
      oneAtATimeFor('1', async () => {
        log.push('x start');
        await new Promise((r) => setTimeout(r, 20));
        log.push('x end');
      }),
      oneAtATimeFor('2', async () => {
        log.push('y start');
        log.push('y end');
      }),
    ]);
    expect(log.indexOf('y end')).toBeLessThan(log.indexOf('x end'));
  });

  it('a failing call does not block the next one', async () => {
    await expect(
      oneAtATimeFor('3', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(oneAtATimeFor('3', async () => 'next')).resolves.toBe('next');
  });

  it('wraps createAsk', () => {
    const source = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(source).toContain('return oneAtATimeFor(args[2], () => createAskNow(...args));');
  });
});
