import { readFileSync } from 'fs';
import { join } from 'path';
import { CLOSED_ROUTE_ON, routeLooksClosed } from '../closedRoute';
import { PrematchWord } from '../prematch.service';

jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

/** 1697 part 2: both sides not of this field — the route looks closed (held behind AO, D44). */
describe('a closed route', () => {
  it('is both sides saying it is not their field, and nothing less', () => {
    expect(routeLooksClosed(PrematchWord.NotHisField, PrematchWord.NotHisField)).toBe(true);
    expect(routeLooksClosed(PrematchWord.NotHisField, PrematchWord.AskHim)).toBe(false);
    expect(routeLooksClosed(PrematchWord.LikelyYes, PrematchWord.NotHisField)).toBe(false);
    expect(routeLooksClosed(undefined, PrematchWord.NotHisField)).toBe(false);
  });

  it('is refused since Misho approved its line (AO, §110.1)', () => {
    expect(CLOSED_ROUTE_ON).toBe(true);
    const tool = readFileSync(join(__dirname, '..', 'tools', 'requestIntroduction.ts'), 'utf8');
    expect(tool).toMatch(
      /if \(CLOSED_ROUTE_ON\)\s*return \{ success: false, reason: 'route_closed', error: CLOSED_ROUTE_LINE \};/u,
    );
    expect(tool).toContain(
      'if (!isDirect && (await closedRouteFor(context.requesterTaskId, resolvedPhone, targetPhone))) {',
    );
  });
});
