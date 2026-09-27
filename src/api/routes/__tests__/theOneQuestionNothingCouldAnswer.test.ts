import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * IS THE SERVER UP — AND THE TWO THINGS THAT MUST STAY TRUE ABOUT ASKING.
 *
 * `outage.sh` reads `usage_events`, so it tells „people are being served" from
 * „people are seeing errors" honestly. What it cannot tell apart is „nobody
 * used it for twenty minutes" from „the server is not there", and it says so
 * rather than guessing: `NOTHING PROVEN`. On a quiet evening that is ordinary.
 * On 22 September the same shape was an outage nobody noticed for fifty
 * minutes.
 *
 * Until 27 September the only way to ask was to guess a path and read the 404
 * — which answers by accident, and stops answering the day a real route is
 * added at that path.
 *
 * TWO PROPERTIES, and neither is visible from the endpoint working:
 *
 *   1. IT SAYS NOTHING BUT THAT IT IS ALIVE. No version, no commit, no counts.
 *      It is reachable by anyone, and a liveness probe that leaks what is
 *      deployed is an unauthenticated inventory of the estate.
 *   2. IT IS RATE LIMITED. CLAUDE.md's rule for every public endpoint, and the
 *      only two in `index.ts` are this and the favicon redirect.
 *
 * ⚠️ AND THE REASON THIS FILE EXISTS AT ALL rather than a line in
 * `everyRouteIsBehindAuth`: that audit reads `src/api/routes/*.ts` and has
 * never looked at `index.ts`. The routes mounted directly on the app are
 * outside it. Two today, both public on purpose — and nothing would have said
 * a word about a third.
 */
const INDEX = readFileSync(join(__dirname, '..', '..', '..', 'index.ts'), 'utf8');

/** `app.get('/x'` / `app.post('/x'` — a route mounted straight on the app. */
const DIRECT_ROUTES = [...INDEX.matchAll(/^app\.(get|post|put|patch|delete)\('([^']+)'/gm)].map(
  (m) => m[2],
);

describe('the routes mounted directly on the app', () => {
  /**
   * The list itself is the assertion. A third entry here is a route outside
   * every router — and therefore outside `everyRouteIsBehindAuth` — so it has
   * to be looked at deliberately rather than appear.
   */
  it('are only the favicon redirect and the liveness probe', () => {
    expect(DIRECT_ROUTES).toEqual(['/favicon.ico', '/health']);
  });
});

describe('the liveness probe', () => {
  const route = INDEX.slice(INDEX.indexOf("app.get('/health'"));
  const handler = route.slice(0, route.indexOf('\n});'));

  it('is rate limited', () => {
    expect(handler).toContain('rateLimit({ windowMs: 60_000, max: 60 })');
  });

  it('answers in the shape every other endpoint answers in', () => {
    expect(handler).toContain('res.json({ success: true, data: { alive: true } });');
  });

  /**
   * The one that matters. Written as „nothing but these words" rather than a
   * list of things to avoid, because a deny-list is exactly how a version
   * string gets added to a probe: nobody thinks to add it to the list.
   */
  it('tells an anonymous caller nothing but that it is alive', () => {
    const answered = handler.match(/res\.json\((.*)\);/)?.[1];

    expect(answered).toBe('{ success: true, data: { alive: true } }');
  });
});
