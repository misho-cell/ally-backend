import { readFileSync } from 'fs';
import { join } from 'path';
import {
  toUpdateRef,
  parseUpdateRef,
  UPDATE_REF_PREFIX,
} from '../../../services/pendingUpdates.service';

/**
 * Row 73's third part, and the identifier trap it must not repeat.
 *
 * `POST /requests/:ref/:action` takes a UUID while `check_my_inbox` hands back
 * `req_<id>` — two identifiers under one name. Feeding either to the other is
 * a 400, it has blocked the tester's seat since the beginning, and it cost a
 * whole route (`GET /requests`) to work around. The updates screen gets ONE
 * ref, defined once and imported by both surfaces.
 */
describe('one ref, defined once', () => {
  it('round-trips', () => {
    expect(parseUpdateRef(toUpdateRef(42))).toBe(42);
  });

  it.each(['', 'upd_', 'upd_0', 'upd_-1', 'upd_abc', 'upd_1.5', '42', 'req_42'])(
    'refuses %s rather than guessing',
    (ref) => {
      expect(parseUpdateRef(ref)).toBeNull();
    },
  );

  /** A NaN reaching a query is how an id becomes „every row". */
  it('never returns a NaN', () => {
    expect(Number.isNaN(parseUpdateRef('upd_x') as number)).toBe(false);
  });

  it('both surfaces import it rather than spelling it out', () => {
    const code = (relative: string): string =>
      readFileSync(join(__dirname, '..', '..', '..', relative), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
    for (const file of ['services/mcp/handlers.ts', 'api/routes/updates.routes.ts']) {
      const source = code(file);
      expect(source).toContain('parseUpdateRef');
      // Nobody re-declares the prefix — that is how two refs are born.
      expect(source).not.toContain(`= '${UPDATE_REF_PREFIX}'`);
    }
  });
});

/**
 * The screen must not become a quieter version of the bug it exists for. Row
 * 73 turned out to be that a row is marked seen the moment it is DISPLAYED, so
 * „later" was not late — it was impossible. A list endpoint that showed
 * updates without spending them would recreate that in reverse.
 */
describe('the list spends what it shows, like the assistant does', () => {
  const source = readFileSync(join(__dirname, '..', 'updates.routes.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  it('uses getPendingUpdates, not a read-only peek of its own', () => {
    expect(source).toContain('getPendingUpdates(userId)');
  });

  /** Releasing marks rows seen, so the held count has to be taken after it. */
  it('counts what is held AFTER releasing what is due', () => {
    expect(source.indexOf('getPendingUpdates(userId)')).toBeLessThan(
      source.indexOf('countHeldUpdates(userId)'),
    );
  });

  it('gives the screen the seen rows too, so a reload is not a blank page', () => {
    expect(source).toContain('listSeenUpdates(userId)');
  });

  it('answers a ref that is not the caller’s with 404, never a false yes', () => {
    expect(source).toContain('if (!moved)');
    expect(source).toContain('status(404)');
  });
});

/**
 * ⚠️ THE SAME CARD IN BOTH LISTS OF ONE REPLY — found by the tester on 26
 * September, reading a snoozed row that had come back due and asking whether
 * appearing in `seen` as well was expected.
 *
 * It was not a snooze bug and it was not new. `due` is read first because
 * releasing marks rows seen; `seen` is read after, so every row just released
 * is already in it. Every due row has been in both lists since the endpoint
 * was written, and a screen that draws both draws each new card twice.
 *
 * The rows belong in `seen` on the NEXT read — that is what `seen` is for, a
 * reload is not a blank page. Only in the reply that is showing them as due
 * are they not also history.
 */
describe('a card is due or it is history, not both in one reply', () => {
  const source = readFileSync(join(__dirname, '..', 'updates.routes.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  it('subtracts what is due from what is seen', () => {
    expect(source).toContain('const dueNow = new Set(due.map((u) => u.id));');
    expect(source).toContain('seen.filter((u) => !dueNow.has(u.id))');
  });

  /** By id — a ref is a rendering of an id and comparing renderings is how they drift. */
  it('compares ids, not refs', () => {
    expect(source).not.toMatch(/dueNow\.has\(toUpdateRef/);
  });

  /** `held` is still counted after the release, which is a different agreement. */
  it('leaves the held count where it was', () => {
    expect(source).toMatch(/listSeenUpdates\(userId\), countHeldUpdates\(userId\)/);
  });
});
