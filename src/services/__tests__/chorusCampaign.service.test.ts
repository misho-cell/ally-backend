jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../targetScoring.service', () => ({ __esModule: true, buildTargetList: jest.fn() }));
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
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../pendingUpdates.service', () => ({
  __esModule: true,
  queueFollowUp: jest.fn().mockResolvedValue({ id: 1 }),
}));

import { query } from '../../db/postgres/client';
import { buildTargetList } from '../targetScoring.service';
import { queueFollowUp } from '../pendingUpdates.service';
import { createThread, saveThreadMessage } from '../threads.service';
import {
  currentGlobalDial,
  openDueCampaigns,
  sendDueCampaignAsks,
  recordCampaignResponse,
  sweepStaleParticipants,
  attributeCampaignJoin,
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
    // the person (how=5); when/reason are unknown until the founder sets them.
    expect(updates[0][1]).toEqual([1, 77, null, 5, null]);
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

    expect(out).toEqual({ timedOut: 1 });
    const closeCalls = mockQuery.mock.calls.filter(([sql]) =>
      (sql as string).includes('closed_declined_all'),
    );
    expect(closeCalls).toHaveLength(1);
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
