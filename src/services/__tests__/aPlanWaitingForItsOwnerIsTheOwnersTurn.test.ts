import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 4984 (Giorgi, G-029): goal 13634 waited on its owner's yes since 5 Oct and
 * sat under „ვმუშაობ". A plan proposed and not approved, or an unanswered
 * question to the owner, is the owner's turn.
 */
const source = readFileSync(join(__dirname, '..', 'threads.service.ts'), 'utf8');

describe('a goal waiting on its owner', () => {
  it('reads needs_you when its plan waits for approval or a question to the owner is open', () => {
    expect(source).toContain(
      '(k.plan_proposed IS NOT NULL AND k.plan IS NULL) OR k.pending_question IS NOT NULL',
    );
    expect(source).toMatch(
      /WHEN \$\{HAS_PAUSED_GOAL\} THEN 'needs_you'\s+WHEN \$\{WAITS_ON_ITS_OWNER\} THEN 'needs_you'/u,
    );
  });

  it('only for an open goal, and never while a run is working on it', () => {
    expect(source).toContain("t.status <> 'working' AND EXISTS (");
    expect(source).toContain("WHERE k.thread_id = t.id AND k.status = 'open'");
  });

  it('keeps the owner-facing line a needs_you thread already had; drops a stale one', () => {
    expect(source).toContain("WHEN ${WAITS_ON_ITS_OWNER} AND t.status <> 'needs_you' THEN NULL");
  });
});
