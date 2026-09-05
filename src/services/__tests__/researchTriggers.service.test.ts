import { LabelSignals } from '../labelReader.service';
import {
  planResearch,
  RESEARCH_TRIGGERS,
  triggerFor,
  TriggerLedger,
} from '../researchTriggers.service';

function signals(over: Partial<LabelSignals> = {}): LabelSignals {
  return {
    org_set: [],
    org_count: 0,
    org_detail: [],
    savers: 5,
    distinct_labels: 3,
    runs_it: false,
    in_big_organisation: false,
    several_directions: false,
    profession_with_clients: false,
    startup_hint: false,
    axel_hint: false,
    trade_only: false,
    name_only: false,
    ...over,
  };
}

describe('which row of the table a person falls on', () => {
  it('the roster comes first — membership is a door of its own', () => {
    expect(triggerFor(signals({ axel_hint: true, org_set: ['axel'], org_count: 1 }))).toBe(
      'axel_hint',
    );
  });

  it('„runs it" beats „one company word" — the register is pointed at the company', () => {
    expect(triggerFor(signals({ runs_it: true, org_set: ['datamind'], org_count: 1 }))).toBe(
      'runs_it',
    );
  });

  it('several directions is the hustler, before any single-word rule', () => {
    expect(
      triggerFor(
        signals({ several_directions: true, org_set: ['ally', 'arci', 'ggi'], org_count: 3 }),
      ),
    ).toBe('several_company_words');
  });

  it('a big company word asks about the seat, not the firm', () => {
    expect(triggerFor(signals({ in_big_organisation: true, org_set: ['tbc'], org_count: 1 }))).toBe(
      'big_company_word',
    );
  });

  it('a trade decides only once nothing else has', () => {
    expect(triggerFor(signals({ trade_only: true }))).toBe('trade_only');
    // …and never when the crowd also agreed on a company word.
    expect(triggerFor(signals({ trade_only: true, org_set: ['wissol'], org_count: 1 }))).toBe(
      'one_company_word',
    );
  });

  it('a bare name a crowd holds is still worth looking up', () => {
    expect(triggerFor(signals({ savers: 44 }))).toBe('name_only_but_known');
    expect(triggerFor(signals({ savers: 4 }))).toBe('nothing_to_go_on');
  });
});

describe('what the engine is told to look up', () => {
  it('„runs it" searches the COMPANY in the register, then the man on the web', () => {
    const plan = planResearch(
      '+995500000001',
      'Vaxo Burchuladze',
      signals({ runs_it: true, org_set: ['datamind'], org_count: 1 }),
    );

    expect(plan.steps).toEqual([
      { source: 'register', query: 'datamind' },
      { source: 'web', query: 'Vaxo Burchuladze datamind' },
    ]);
    expect(plan.points_at_target).toBe(1);
  });

  // D111: "no registered company needed". An empty register must never park a
  // startuper as NOT YET, so no register step is even planned.
  it('a startuper is never sent to the register', () => {
    const plan = planResearch(
      '+995500000002',
      'Salome Kvirkvelidze',
      signals({ startup_hint: true, org_set: ['deepdive'], org_count: 1 }),
    );

    expect(plan.steps.every((s) => s.source !== 'register')).toBe(true);
    expect(plan.points_at_target).toBe(6);
  });

  it('a big company word asks only for the title', () => {
    const plan = planResearch(
      '+995500000003',
      'Levan Borchkhadze',
      signals({ in_big_organisation: true, org_set: ['tbc'], org_count: 1 }),
    );

    expect(plan.steps.map((s) => s.source)).toEqual(['linkedin', 'web']);
    // No verdict: the label cannot give a seat, so the plan points at nobody
    // until something comes back.
    expect(plan.points_at_target).toBeNull();
  });

  it('„axel" goes to the roster and nowhere else', () => {
    const plan = planResearch(
      '+995500000004',
      'Jaba Kikvidze',
      signals({ axel_hint: true, org_set: ['axel'], org_count: 1 }),
    );

    expect(plan.steps).toEqual([{ source: 'roster', query: 'Jaba Kikvidze' }]);
    expect(plan.points_at_target).toBe(9);
  });

  it('the hustler is searched in the register once per direction', () => {
    const plan = planResearch(
      '+995500000005',
      'Tornike Abuladze',
      signals({ several_directions: true, org_set: ['ally', 'arci', 'ggi'], org_count: 3 }),
    );

    expect(plan.steps.filter((s) => s.source === 'register').map((s) => s.query)).toEqual([
      'ally',
      'arci',
      'ggi',
    ]);
    expect(plan.points_at_target).toBe(7);
  });

  it('a trade and a bare name are researched not at all — parked, not dropped', () => {
    expect(planResearch('+9955000006', 'ზურა', signals({ trade_only: true })).steps).toEqual([]);
    expect(planResearch('+9955000007', 'ნინო', signals({ savers: 2 })).steps).toEqual([]);
  });

  // Without a name there is nothing to type, and a company search would
  // attribute whatever it found to a stranger.
  it('plans nothing when the crowd has no name for the number', () => {
    const plan = planResearch(
      '+995500000008',
      '   ',
      signals({ runs_it: true, org_set: ['datamind'], org_count: 1 }),
    );

    expect(plan.steps).toEqual([]);
    expect(plan.trigger).toBe('runs_it');
  });
});

describe('the ledger', () => {
  it('names every rule and counts what each one caught', () => {
    const ledger = new TriggerLedger();
    ledger.record(
      planResearch('+1', 'A B', signals({ runs_it: true, org_set: ['x'], org_count: 1 })),
    );
    ledger.record(planResearch('+2', 'C D', signals({ trade_only: true })));

    const report = ledger.report();
    expect(report.map((r) => r.trigger)).toEqual([...RESEARCH_TRIGGERS]);
    expect(report.find((r) => r.trigger === 'runs_it')).toEqual({
      trigger: 'runs_it',
      enabled: true,
      matched: 1,
      planned: 1,
    });
    // A trade matched a rule and was correctly sent nowhere.
    expect(report.find((r) => r.trigger === 'trade_only')).toEqual({
      trigger: 'trade_only',
      enabled: true,
      matched: 1,
      planned: 0,
    });
  });

  it('a rule switched off still counts, and stops sending anyone', () => {
    process.env.RESEARCH_TRIGGERS_OFF = 'runs_it';
    try {
      const ledger = new TriggerLedger();
      const plan = ledger.record(
        planResearch('+1', 'A B', signals({ runs_it: true, org_set: ['x'], org_count: 1 })),
      );

      expect(plan.steps).toEqual([]);
      expect(ledger.report().find((r) => r.trigger === 'runs_it')).toEqual({
        trigger: 'runs_it',
        enabled: false,
        matched: 1,
        planned: 0,
      });
    } finally {
      delete process.env.RESEARCH_TRIGGERS_OFF;
    }
  });
});
