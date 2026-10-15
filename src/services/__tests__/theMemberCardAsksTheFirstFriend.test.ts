import { readFileSync } from 'fs';
import { join } from 'path';
import { ChainLinkRole, ChainLinkState, ChainMap } from '../chainMap';
import { firstAskableBridge } from '../memberIntroRequest.service';

jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../chainMap.service', () => ({ chainMapsFor: jest.fn() }));
jest.mock('../tools/requestIntroduction', () => ({ requestIntroduction: jest.fn() }));

const you = { id: null, name: null, role: ChainLinkRole.You, state: null, is_member: true };
const target = {
  id: 'ref-target',
  name: 'ეკა',
  role: ChainLinkRole.Target,
  state: ChainLinkState.NotContacted,
  is_member: true,
};
const bridge = (id: string, name: string | null, member: boolean): ChainMap['links'][number] => ({
  id,
  name,
  role: ChainLinkRole.Bridge,
  state: ChainLinkState.Next,
  is_member: member,
});
const map = (...middle: ChainMap['links'][number][]): ChainMap => ({
  hops: middle.length + 1,
  warm_steps: 0,
  links: [you, ...middle, target],
});

/** 4621 (Misho's yes, 14 Oct): the member card's „გაცნობის თხოვნა" asks the first friend on the path. */
describe('the member card asks the first friend on the path', () => {
  it('takes the first friend of the best path who uses Netai', () => {
    expect(firstAskableBridge([map(bridge('ref-zura', 'ზურა', true))])?.id).toBe('ref-zura');
  });

  it('passes over a path whose first friend has never opened Netai', () => {
    const maps = [map(bridge('ref-a', 'ანა', false)), map(bridge('ref-b', 'ბექა', true))];
    expect(firstAskableBridge(maps)?.id).toBe('ref-b');
  });

  it('asks nobody when no path starts with a friend on Netai, or the friend has no name', () => {
    expect(firstAskableBridge([map(bridge('ref-a', 'ანა', false))])).toBeNull();
    expect(firstAskableBridge([map(bridge('ref-a', null, true))])).toBeNull();
    expect(firstAskableBridge([map()])).toBeNull();
  });

  it('is a POST on the members router, limited and checked', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'people.routes.ts'),
      'utf8',
    );
    expect(routes).toContain("'/:id/intro-request',");
    expect(routes).toContain('rateLimit({ windowMs: 60_000, max: INTRO_REQUESTS_PER_MINUTE })');
    expect(routes).toContain("error: 'goal_id must be a positive integer'");
  });
});
