import type { FitSignal } from '../targetScoring.service';
import { REACH_PLUS_CAP, doorsFor, inGeorgia, plusesFor, tierFor } from '../targetTiers';
import type { PlusInputs } from '../targetTiers';

const NO_FIT: FitSignal = { level: 'not_yet', source: 'none', evidence: [] };
const SMALL_REACH = 1;
const MID_REACH = 12;
const OVER_CAP_REACH = REACH_PLUS_CAP + 40;

function inputs(over: Partial<PlusInputs>): PlusInputs {
  return {
    fit: NO_FIT,
    label: 'გიორგი',
    factValues: undefined,
    reach: SMALL_REACH,
    inviter: null,
    approvedByFounder: false,
    ...over,
  };
}

function codes(over: Partial<PlusInputs>): string[] {
  return plusesFor(inputs(over)).map((p) => p.code);
}

describe('inGeorgia (door G3)', () => {
  it('is unknown, not failed, when there is no city fact', () => {
    expect(inGeorgia(null)).toBeNull();
    expect(inGeorgia('  ')).toBeNull();
  });

  it('reads a Georgian town in either script', () => {
    expect(inGeorgia('Batumi')).toBe(true);
    expect(inGeorgia('თბილისი')).toBe(true);
    expect(inGeorgia('Georgia (moved back from LA)')).toBe(true);
  });

  it('reads a place outside Georgia as outside', () => {
    expect(inGeorgia('Berlin')).toBe(false);
  });
});

describe('plusesFor', () => {
  it('gives nothing to a row with nothing readable', () => {
    expect(codes({})).toEqual([]);
  });

  it('marks the founder’s own yes first', () => {
    expect(codes({ approvedByFounder: true })[0]).toBe('F');
  });

  it('reads a role or company word in the label as R1', () => {
    expect(codes({ label: 'გიორგი დამფუძნებელი' })).toContain('R1');
  });

  it('reads a senior manager on the facts as R9 and quotes the fact', () => {
    const pluses = plusesFor(inputs({ factValues: ['title: General Manager at Acme'] }));
    const r9 = pluses.find((p) => p.code === 'R9');
    expect(r9?.note).toContain('General Manager');
  });

  it('reads a membership fact as M', () => {
    expect(codes({ factValues: ['member_of: Rotary Tbilisi'] })).toContain('M');
  });

  it('counts phonebooks from three up and caps them, asking for a web check', () => {
    expect(codes({ reach: SMALL_REACH })).not.toContain('R10');
    const mid = plusesFor(inputs({ reach: MID_REACH })).find((p) => p.code === 'R10');
    expect(mid?.note).toBe(`held by ${MID_REACH} phonebooks`);
    const over = plusesFor(inputs({ reach: OVER_CAP_REACH })).find((p) => p.code === 'R10');
    expect(over?.note).toContain(`counted as ${REACH_PLUS_CAP}`);
  });

  it('marks a warm inviter as R11', () => {
    expect(codes({ inviter: { user_id: 5, warmth: 0.8, colour: null } })).toContain('R11');
  });
});

describe('tierFor', () => {
  it('is BEST on a strong fit or the founder’s yes', () => {
    expect(tierFor('strong', false)).toBe('BEST');
    expect(tierFor('not_yet', true)).toBe('BEST');
  });

  it('is GOOD on a moderate or weak fit', () => {
    expect(tierFor('moderate', false)).toBe('GOOD');
    expect(tierFor('weak', false)).toBe('GOOD');
  });

  it('parks a row with nothing readable as NOT_YET', () => {
    expect(tierFor('not_yet', false)).toBe('NOT_YET');
  });
});

describe('doorsFor', () => {
  it('carries G3 from the city and G5 from the fit', () => {
    expect(doorsFor('Kutaisi', 'weak')).toEqual({ in_georgia: true, findable: true });
    expect(doorsFor(null, 'not_yet')).toEqual({ in_georgia: null, findable: false });
  });
});
