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
    expect(tool).toMatch(
      /!isDirect &&\s+\(await closedRouteFor\(context\.requesterTaskId, resolvedPhone, receiverForCheck\)\)/u,
    );
  });

  it('finds the receiver in the bridge’s own phonebook when the owner gave no number (49667)', () => {
    const tool = readFileSync(join(__dirname, '..', 'tools', 'requestIntroduction.ts'), 'utf8');
    expect(tool).toMatch(
      /const receiverForCheck =\s+targetPhone \?\? \(await receiverInBridgesBook\(String\(mediatorUserId\), targetName\)\);/u,
    );
    const fn = tool.slice(tool.indexOf('async function receiverInBridgesBook('));
    expect(fn.slice(0, 500)).toContain('findContactPhonesByName(mediatorUserId, targetName, 2)');
    expect(fn.slice(0, 500)).toContain('phones.length === 1 ? phones[0] : undefined');
  });
});
