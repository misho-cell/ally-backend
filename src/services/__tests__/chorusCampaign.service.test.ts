jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../targetScoring.service', () => ({
  __esModule: true,
  buildTargetList: jest.fn(),
  // The ask says the name the network knows today (ticket 9 task 13.6); an
  // empty map means "nothing fresher than the stored label".
  bestPersonLabels: jest.fn().mockResolvedValue(new Map<string, string>()),
}));
jest.mock('../threads.service', () => ({
  __esModule: true,
  createThread: jest.fn().mockResolvedValue({
    id: 77,
    type: 'campaign_invite',
    title: 'x',
    is_task: true,
    status: 'needs_you',
    status_line: 'პასუხს ელოდება',
  }),
  saveThreadMessage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../sse.service', () => ({ __esModule: true, emitThreadCreated: jest.fn() }));
jest.mock('../threadStatus.service', () => ({ __esModule: true, setThreadStatus: jest.fn() }));
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../pendingUpdates.service', () => ({
  __esModule: true,
  queueFollowUp: jest.fn().mockResolvedValue({ id: 1 }),
}));

import { query } from '../../db/postgres/client';
import { buildTargetList, bestPersonLabels } from '../targetScoring.service';
import { setThreadStatus } from '../threadStatus.service';
import { queueFollowUp } from '../pendingUpdates.service';
import { createThread, saveThreadMessage } from '../threads.service';
import {
  currentGlobalDial,
  openDueCampaigns,
  sendDueCampaignAsks,
  closeStaleCampaigns,
  recordCampaignResponse,
  sweepStaleParticipants,
  attributeCampaignJoin,
  techniqueHowFor,
} from '../chorusCampaign.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockBuildTargetList = buildTargetList as jest.MockedFunction<typeof buildTargetList>;
const mockCreateThread = createThread as jest.MockedFunction<typeof createThread>;
const mockSaveMessage = saveThreadMessage as jest.MockedFunction<typeof saveThreadMessage>;

function rows(data: unknown[], rowCount = data.length): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('currentGlobalDial', () => {
  it('defaults to the starting dial when no campaign has ever closed', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    expect(await currentGlobalDial()).toBe(8);
  });

  it('steps UP when most recent closed campaigns failed', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("status != 'open'"))
        return Promise.resolve(
          rows([
            { status: 'closed_exhausted' },
            { status: 'closed_exhausted' },
            { status: 'closed_joined' },
          ]) as never,
        );
      if (sql.includes('ORDER BY opened_at DESC LIMIT 1'))
        return Promise.resolve(rows([{ ask_count_dial: 8 }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    expect(await currentGlobalDial()).toBe(9);
  });

  it('steps DOWN when most recent closed campaigns succeeded', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("status != 'open'"))
        return Promise.resolve(
          rows([
            { status: 'closed_joined' },
            { status: 'closed_joined' },
            { status: 'closed_exhausted' },
          ]) as never,
        );
      if (sql.includes('ORDER BY opened_at DESC LIMIT 1'))
        return Promise.resolve(rows([{ ask_count_dial: 8 }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    expect(await currentGlobalDial()).toBe(7);
  });

  it('never steps below the starting-range floor or above the explicit ceiling', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("status != 'open'"))
        return Promise.resolve(rows([{ status: 'closed_joined' }]) as never);
      if (sql.includes('ORDER BY opened_at DESC LIMIT 1'))
        return Promise.resolve(rows([{ ask_count_dial: 6 }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    expect(await currentGlobalDial()).toBe(6);
  });
});

describe('openDueCampaigns', () => {
  function routeOpenQueries(opts: {
    cooldown?: string[];
    dial?: number;
    campaignId?: number;
    inviters?: { user_id: number; strength: number | null }[];
  }): void {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("status != 'open'")) return Promise.resolve(rows([]) as never);
      if (sql.includes('ORDER BY opened_at DESC LIMIT 1'))
        return Promise.resolve(rows([]) as never);
      if (sql.includes('target_phone = ANY'))
        return Promise.resolve(
          rows((opts.cooldown ?? []).map((target_phone) => ({ target_phone }))) as never,
        );
      if (sql.includes('INSERT INTO invite_campaigns'))
        return Promise.resolve(rows([{ id: opts.campaignId ?? 501 }]) as never);
      if (sql.includes('contact_relationship_scores crs'))
        return Promise.resolve(rows(opts.inviters ?? []) as never);
      if (sql.includes('INSERT INTO invite_campaign_participants'))
        return Promise.resolve(rows([]) as never);
      return Promise.resolve(rows([]) as never);
    });
  }

  it('opens nothing when T7 has no targets', async () => {
    mockBuildTargetList.mockResolvedValue([]);
    routeOpenQueries({});

    expect(await openDueCampaigns(30)).toEqual({ opened: 0 });
  });

  it('skips a target still in its 90-day cooldown', async () => {
    mockBuildTargetList.mockResolvedValue([
      { phone: '+995500000001', label: 'x', city: null, score: 0.5, parts: {} as never },
    ]);
    routeOpenQueries({ cooldown: ['+995500000001'] });

    expect(await openDueCampaigns(30)).toEqual({ opened: 0 });
    const inserts = mockQuery.mock.calls.filter(([sql]) =>
      (sql as string).includes('INSERT INTO invite_campaigns'),
    );
    expect(inserts).toHaveLength(0);
  });

  it('opens a fresh target and schedules its inviter candidates', async () => {
    mockBuildTargetList.mockResolvedValue([
      {
        phone: '+995500000002',
        label: 'electrician',
        city: 'თბილისი',
        score: 0.7,
        parts: {} as never,
      },
    ]);
    routeOpenQueries({
      campaignId: 900,
      inviters: [
        { user_id: 10, strength: 0.9 },
        { user_id: 11, strength: 0.4 },
      ],
    });

    const out = await openDueCampaigns(30);

    expect(out).toEqual({ opened: 1 });
    const participantInserts = mockQuery.mock.calls.filter(([sql]) =>
      (sql as string).includes('INSERT INTO invite_campaign_participants'),
    );
    expect(participantInserts).toHaveLength(2);
    expect(participantInserts[0][1]).toEqual([900, 10, 1]); // first inviter, day-1 offset
    expect(participantInserts[1][1]).toEqual([900, 11, 4]); // second inviter, day-4 offset
  });
});

describe('sendDueCampaignAsks', () => {
  it('sends every due ask: creates a needs_you thread and advances state to asked', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('p.scheduled_ask_at <= NOW()'))
        return Promise.resolve(
          rows([{ id: 1, inviter_user_id: 10, target_label: 'electrician' }]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });

    const sent = await sendDueCampaignAsks(50);

    expect(sent).toBe(1);
    expect(mockCreateThread).toHaveBeenCalledWith(
      '10',
      'campaign_invite',
      expect.stringContaining('electrician'),
      undefined,
      { isTask: true, status: 'needs_you', statusLine: 'პასუხს ელოდება' },
    );
    expect(mockSaveMessage).toHaveBeenCalled();
    const updates = mockQuery.mock.calls.filter(([sql]) =>
      (sql as string).includes("state = 'asked'"),
    );
    expect(updates).toHaveLength(1);
    // D50: Chorus stamps its own technique tag at send time. The default
    // config claims only what the fixed message truthfully does — it names
    // the person (how=5); when/reason default to 0 = explicit NONE (a
    // scheduled ask has no conversational moment; no reason unless the env
    // says the message carries one) — ticket 8 task 5.
    // HOW is the variant actually sent, not the env default (ticket 9 task 22):
    // participant 1 gets the second of the four phrasings.
    expect(updates[0][1]).toEqual([1, 77, 0, 6, 0]);
    // T9's one list: the ask ALSO becomes a typed chorus_ask pending update,
    // released immediately, so any conversation the inviter opens sees it.
    expect(queueFollowUp).toHaveBeenCalledWith(
      '10',
      null,
      'chorus_ask',
      expect.objectContaining({ who: 'electrician', thread_id: 77 }),
      0,
    );
  });

  it('does nothing when nothing is due', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    expect(await sendDueCampaignAsks(50)).toBe(0);
    expect(mockCreateThread).not.toHaveBeenCalled();
    expect(queueFollowUp).not.toHaveBeenCalled();
  });
});

describe('recordCampaignResponse', () => {
  function routeRespondQueries(opts: {
    participant?: { id: number; state: string; campaign_id: number } | null;
    remaining?: number;
  }): void {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('WHERE thread_id = $1 AND inviter_user_id'))
        return Promise.resolve(rows(opts.participant ? [opts.participant] : []) as never);
      if (sql.includes("state IN ('pending', 'asked', 'agreed', 'told')"))
        return Promise.resolve(rows([{ count: String(opts.remaining ?? 0) }]) as never);
      return Promise.resolve(rows([]) as never);
    });
  }

  it('records a legal transition (asked -> agreed)', async () => {
    routeRespondQueries({ participant: { id: 5, state: 'asked', campaign_id: 900 } });

    const out = await recordCampaignResponse(77, '10', 'agreed');

    expect(out).toEqual({ recorded: true });
    // No technique reported — every group stays as stamped (COALESCE keeps).
    const update = mockQuery.mock.calls.find(([sql]) => (sql as string).includes('state = $2'));
    expect(update?.[1]).toEqual([5, 'agreed', null, null, null]);
  });

  it("D50: the assistant's reported technique overrides the stamp; out-of-range values fall to unknown, never guessed into range", async () => {
    routeRespondQueries({ participant: { id: 5, state: 'asked', campaign_id: 900 } });

    const out = await recordCampaignResponse(77, '10', 'agreed', {
      when: 2,
      how: 99, // out of range -> null -> stamped value kept
      reason: 9,
    });

    expect(out).toEqual({ recorded: true });
    const update = mockQuery.mock.calls.find(([sql]) => (sql as string).includes('state = $2'));
    expect(update?.[1]).toEqual([5, 'agreed', 2, null, 9]);
  });

  it('refuses an illegal transition (pending -> told)', async () => {
    routeRespondQueries({ participant: { id: 5, state: 'pending', campaign_id: 900 } });

    const out = await recordCampaignResponse(77, '10', 'told');

    expect(out.recorded).toBe(false);
    expect(out.error).toContain('pending');
  });

  it('reports no live ask when the thread matches no participant', async () => {
    routeRespondQueries({ participant: null });

    const out = await recordCampaignResponse(77, '10', 'agreed');

    expect(out).toEqual({ recorded: false, error: 'This thread has no live campaign ask.' });
  });

  it('closes the campaign once a decline leaves nothing outstanding', async () => {
    routeRespondQueries({ participant: { id: 5, state: 'asked', campaign_id: 900 }, remaining: 0 });

    await recordCampaignResponse(77, '10', 'declined');

    const closeCalls = mockQuery.mock.calls.filter(([sql]) =>
      (sql as string).includes('closed_declined_all'),
    );
    expect(closeCalls).toHaveLength(1);
    expect(closeCalls[0][1]).toEqual([900]);
  });

  it('leaves the campaign open when other participants are still outstanding', async () => {
    routeRespondQueries({ participant: { id: 5, state: 'asked', campaign_id: 900 }, remaining: 2 });

    await recordCampaignResponse(77, '10', 'declined');

    const closeCalls = mockQuery.mock.calls.filter(([sql]) =>
      (sql as string).includes('closed_declined_all'),
    );
    expect(closeCalls).toHaveLength(0);
  });
});

describe('sweepStaleParticipants', () => {
  it('times out silent asked participants and closes exhausted campaigns', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("state = 'asked' AND asked_at <"))
        return Promise.resolve(rows([{ campaign_id: 900 }]) as never);
      if (sql.includes("state IN ('pending', 'asked', 'agreed', 'told')"))
        return Promise.resolve(rows([{ count: '0' }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    const out = await sweepStaleParticipants();

    expect(out).toEqual({ timedOut: 1, closed: 0 });
    const closeCalls = mockQuery.mock.calls.filter(([sql]) =>
      (sql as string).includes('closed_declined_all'),
    );
    expect(closeCalls).toHaveLength(1);
  });

  it('closes empty and over-age campaigns — a campaign can always END (ticket 8 task 6)', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("state = 'asked' AND asked_at <")) return Promise.resolve(rows([]) as never);
      if (sql.includes('closed_no_inviters'))
        return Promise.resolve({ rows: [], rowCount: 44 } as never);
      if (sql.includes('closed_expired'))
        return Promise.resolve({ rows: [], rowCount: 2 } as never);
      return Promise.resolve(rows([]) as never);
    });

    const out = await sweepStaleParticipants();

    expect(out).toEqual({ timedOut: 0, closed: 46 });
  });
});

describe('attributeCampaignJoin', () => {
  it('does nothing without an inviter', async () => {
    await attributeCampaignJoin('+995500000003', null);

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('marks the matching participant joined and closes the campaign', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('regexp_replace(c.target_phone'))
        return Promise.resolve(rows([{ participant_id: 5, campaign_id: 900 }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    await attributeCampaignJoin('+995500000003', 10);

    const joinedCalls = mockQuery.mock.calls.filter(([sql]) =>
      (sql as string).includes("state = 'joined'"),
    );
    const closedCalls = mockQuery.mock.calls.filter(([sql]) =>
      (sql as string).includes('closed_joined'),
    );
    expect(joinedCalls).toHaveLength(1);
    expect(closedCalls).toHaveLength(1);
  });

  it('does nothing when no open campaign matches this inviter/target pair', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await attributeCampaignJoin('+995500000003', 10);

    const joinedCalls = mockQuery.mock.calls.filter(([sql]) =>
      (sql as string).includes("state = 'joined'"),
    );
    expect(joinedCalls).toHaveLength(0);
  });
});

describe('the ask phrasing varies (ticket 9 task 22)', () => {
  it('rotates evenly across all four HOW values, deterministically', () => {
    const seen = [0, 1, 2, 3, 4, 5, 6, 7].map((id) => techniqueHowFor(id));

    expect(seen).toEqual([5, 6, 7, 8, 5, 6, 7, 8]);
    // Same row, same message, every time — a test never fights a coin toss.
    expect(techniqueHowFor(42)).toBe(techniqueHowFor(42));
  });

  it('every variant carries the three-word reply protocol the parser depends on', async () => {
    const sent: string[] = [];
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM invite_campaign_participants p'))
        return Promise.resolve(
          // Four DIFFERENT inviters: one person gets one ask a week now
          // (task 13.2), so four rows for one user would be one message.
          rows([
            { id: 0, inviter_user_id: 9, target_label: 'ნინო' },
            { id: 1, inviter_user_id: 10, target_label: 'ნინო' },
            { id: 2, inviter_user_id: 11, target_label: 'ნინო' },
            { id: 3, inviter_user_id: 12, target_label: 'ნინო' },
          ]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });
    (saveThreadMessage as jest.Mock).mockImplementation(
      (_t: number, _u: number, _r: string, text: string) => {
        sent.push(text);
        return Promise.resolve(undefined);
      },
    );

    await sendDueCampaignAsks(10);

    expect(sent).toHaveLength(4);
    // Four different messages, and every one of them still tells the user the
    // exact three words the response parser understands.
    expect(new Set(sent).size).toBe(4);
    for (const text of sent) {
      expect(text).toContain('„კი"');
      expect(text).toContain('„არა"');
      expect(text).toContain('„უთხარი"');
    }
  });
});

describe('one invite ask per person per week (ticket 9 task 13.2)', () => {
  it('asks the database for it — a person cannot be scheduled twice by two campaigns', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await sendDueCampaignAsks(10);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('recent.inviter_user_id = p.inviter_user_id');
    expect(sql).toContain('recent.asked_at >');
    expect(params[1]).toBe(7);
  });

  it('sends ONE message when one tick holds several rows for the same person', async () => {
    // The six pushes of 1 September, in one minute: six campaigns, each
    // scheduling the founder without knowing about the others.
    const sent: number[] = [];
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM invite_campaign_participants p'))
        return Promise.resolve(
          rows([
            { id: 100, inviter_user_id: 501, target_label: 'ერთი' },
            { id: 101, inviter_user_id: 501, target_label: 'ორი' },
            { id: 102, inviter_user_id: 501, target_label: 'სამი' },
          ]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });
    (saveThreadMessage as jest.Mock).mockImplementation((_t: number, u: number) => {
      sent.push(u);
      return Promise.resolve(undefined);
    });

    const count = await sendDueCampaignAsks(10);

    expect(sent).toEqual([501]);
    expect(count).toBe(1);
  });
});

describe('the ask says the name the network knows today (ticket 9 task 13.6)', () => {
  it('prefers the fresh label over the one the campaign stored in August', async () => {
    const sent: string[] = [];
    (bestPersonLabels as jest.Mock).mockResolvedValue(
      new Map([['+995599111111', 'Ekaterine Bezhanishvili']]),
    );
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM invite_campaign_participants p'))
        return Promise.resolve(
          rows([
            {
              id: 5,
              inviter_user_id: 501,
              target_label: 'Kato',
              target_phone: '+995599111111',
            },
          ]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });
    (saveThreadMessage as jest.Mock).mockImplementation(
      (_t: number, _u: number, _r: string, text: string) => {
        sent.push(text);
        return Promise.resolve(undefined);
      },
    );

    await sendDueCampaignAsks(10);

    expect(sent[0]).toContain('Ekaterine Bezhanishvili');
    expect(sent[0]).not.toContain('Kato');
  });

  it('keeps the stored label when the crowd names nobody better', async () => {
    const sent: string[] = [];
    (bestPersonLabels as jest.Mock).mockResolvedValue(new Map());
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM invite_campaign_participants p'))
        return Promise.resolve(
          rows([
            { id: 6, inviter_user_id: 502, target_label: 'ნინო', target_phone: '+995599222222' },
          ]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });
    (saveThreadMessage as jest.Mock).mockImplementation(
      (_t: number, _u: number, _r: string, text: string) => {
        sent.push(text);
        return Promise.resolve(undefined);
      },
    );

    await sendDueCampaignAsks(10);

    expect(sent[0]).toContain('ნინო');
  });

  it('sends on the stored label rather than not at all when the refresh breaks', async () => {
    (bestPersonLabels as jest.Mock).mockRejectedValue(new Error('timeout'));
    const sent: string[] = [];
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM invite_campaign_participants p'))
        return Promise.resolve(
          rows([
            { id: 7, inviter_user_id: 503, target_label: 'გიორგი', target_phone: '+995599333333' },
          ]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });
    (saveThreadMessage as jest.Mock).mockImplementation(
      (_t: number, _u: number, _r: string, text: string) => {
        sent.push(text);
        return Promise.resolve(undefined);
      },
    );

    expect(await sendDueCampaignAsks(10)).toBe(1);
    expect(sent[0]).toContain('გიორგი');
  });
});

describe('closeStaleCampaigns — the filter reaches backwards once (ticket 9 task 13.6)', () => {
  const OPEN = [
    { id: 299, target_phone: '+995599000001', target_label: 'ახალგაზრდული ასოციაცია', asked: '1' },
    { id: 332, target_phone: '+995599000002', target_label: 'Nika Khazaradze', asked: '0' },
  ];

  function routeClose(): void {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM invite_campaigns c') && sql.includes("c.status = 'open'"))
        return Promise.resolve(rows(OPEN) as never);
      if (sql.includes('SELECT thread_id, inviter_user_id'))
        return Promise.resolve(rows([{ thread_id: 11762, inviter_user_id: 501 }]) as never);
      return Promise.resolve(rows([]) as never);
    });
    (buildTargetList as jest.Mock).mockResolvedValue([
      { phone: '+995599000002', label: 'Nika Khazaradze' },
    ]);
  }

  it('closes exactly the campaigns today’s list would not choose', async () => {
    routeClose();

    const out = await closeStaleCampaigns(30, false);

    expect(out.open_before).toBe(2);
    expect(out.still_chosen).toBe(1);
    expect(out.closed).toEqual([{ id: 299, target_label: 'ახალგაზრდული ასოციაცია', asked: 1 }]);
    const update = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("status = 'closed_stale_target'"),
    ) as [string, unknown[]];
    expect(update[1][0]).toEqual([299]);
  });

  it('writes nothing on a dry run, but reports the same list', async () => {
    routeClose();

    const out = await closeStaleCampaigns(30, true);

    expect(out.dry_run).toBe(true);
    expect(out.closed.map((c) => c.id)).toEqual([299]);
    expect(
      mockQuery.mock.calls.some(([sql]) => String(sql).includes("status = 'closed_stale_target'")),
    ).toBe(false);
  });

  it('takes the badge off a thread that has stopped waiting for its user', async () => {
    routeClose();

    await closeStaleCampaigns(30, false);

    expect(setThreadStatus).toHaveBeenCalledWith('501', 11762, 'done', {
      statusLine: null,
      isTask: true,
    });
  });

  it('leaves everything alone when every open campaign is still chosen', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM invite_campaigns c') && sql.includes("c.status = 'open'"))
        return Promise.resolve(rows([OPEN[1]]) as never);
      return Promise.resolve(rows([]) as never);
    });
    (buildTargetList as jest.Mock).mockResolvedValue([{ phone: '+995599000002' }]);

    const out = await closeStaleCampaigns(30, false);

    expect(out.closed).toEqual([]);
    expect(setThreadStatus).not.toHaveBeenCalled();
  });
});
