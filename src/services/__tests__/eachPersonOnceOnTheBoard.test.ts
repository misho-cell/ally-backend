import { oncePerPerson, RouteRole, RouteRow, RouteState } from '../routesBoard.service';

/** 4928, Giorgi's retest (13 Oct): one person showed three times on the routes board. */
const row = (askId: number, state: RouteState, at: string): RouteRow => ({
  ask_id: askId,
  kind: 'ask',
  person_name: 'ნინო',
  role: RouteRole.Addressee,
  state,
  summary: null,
  updated_at: at,
});

describe('each person once, latest state', () => {
  it('folds three rows for one person into one, where they first appeared, with the newest state', () => {
    const out = oncePerPerson([
      { personId: 7, route: row(1, RouteState.Declined, '2026-10-13T08:00:00.000Z') },
      {
        personId: 9,
        route: { ...row(2, RouteState.Waiting, '2026-10-13T09:00:00.000Z'), person_name: 'გელა' },
      },
      { personId: 7, route: row(3, RouteState.Waiting, '2026-10-13T10:00:00.000Z') },
      { personId: 7, route: row(4, RouteState.Answered, '2026-10-13T11:00:00.000Z') },
    ]);
    expect(out.map((r) => r.ask_id)).toEqual([4, 2]);
    expect(out[0].state).toBe(RouteState.Answered);
  });

  it('keeps a row with no person as it is', () => {
    const out = oncePerPerson([
      { personId: undefined, route: row(1, RouteState.Waiting, '2026-10-13T08:00:00.000Z') },
      { personId: undefined, route: row(2, RouteState.Waiting, '2026-10-13T08:00:00.000Z') },
    ]);
    expect(out).toHaveLength(2);
  });
});
