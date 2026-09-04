jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import {
  getCampaignInviteContext,
  buildCampaignInviteSection,
  CampaignInviteContext,
} from '../campaignInvite.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

function routeInviteQueries(opts: {
  participant?: Record<string, unknown> | null;
  facts?: string[];
  holders?: number;
  savedAs?: string | null;
  colour?: string | null;
}): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('FROM invite_campaign_participants p'))
      return Promise.resolve(
        rows(
          opts.participant === null
            ? []
            : [
                {
                  participant_id: 7,
                  campaign_id: 265,
                  state: 'asked',
                  target_phone: '+995599111111',
                  target_label: 'Luka Iashvili',
                  city: 'თბილისი',
                  ...opts.participant,
                },
              ],
        ) as never,
      );
    if (sql.includes('FROM contact_facts'))
      return Promise.resolve(rows((opts.facts ?? []).map((value) => ({ value }))) as never);
    if (sql.includes('COUNT(DISTINCT "contactId")'))
      return Promise.resolve(rows([{ holders: String(opts.holders ?? 0) }]) as never);
    return Promise.resolve(
      rows([{ saved_as: opts.savedAs ?? null, colour: opts.colour ?? null }]) as never,
    );
  });
}

beforeEach(() => jest.clearAllMocks());

describe('getCampaignInviteContext (ticket 9 task 13.7)', () => {
  it('carries who the target is, how many hold them, and the tie to this user', async () => {
    routeInviteQueries({
      facts: ['role: CEO @ Maxin.ai'],
      holders: 38,
      savedAs: 'Maiko Gumbaridze',
      colour: 'allies',
    });

    const ctx = await getCampaignInviteContext(11749, '501');

    expect(ctx?.campaign_id).toBe(265);
    expect(ctx?.target_facts).toEqual(['role: CEO @ Maxin.ai']);
    expect(ctx?.phonebooks).toBe(38);
    expect(ctx?.saved_as).toBe('Maiko Gumbaridze');
    expect(ctx?.relationship_colour).toBe('allies');
  });

  it('is scoped to the inviter — a thread belongs to exactly one participant', async () => {
    routeInviteQueries({});

    await getCampaignInviteContext(11749, '501');

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('p.inviter_user_id = $2::int');
    expect(params).toEqual([11749, '501']);
  });

  it('returns null for a thread with no campaign ask behind it', async () => {
    routeInviteQueries({ participant: null });

    expect(await getCampaignInviteContext(9999, '501')).toBeNull();
  });
});

describe('buildCampaignInviteSection — the two questions get real answers', () => {
  const base: CampaignInviteContext = {
    participant_id: 7,
    campaign_id: 265,
    state: 'asked',
    target_label: 'Livingstoni Maiko',
    target_facts: ['role: CEO @ Maxin.ai', 'employer: Maxin.ai'],
    phonebooks: 38,
    saved_as: 'Maiko Gumbaridze',
    relationship_colour: 'allies',
    city: 'თბილისი',
  };

  it('names the person, the crowd and the tie — „who is this?" and „why me?"', () => {
    const text = buildCampaignInviteSection(base);

    expect(text).toContain('Livingstoni Maiko');
    // Somebody else's label is not the user's own word for them.
    expect(text).toContain('Maiko Gumbaridze');
    expect(text).toContain('CEO @ Maxin.ai');
    expect(text).toContain('38');
    expect(text).toContain('მწვანე');
  });

  it('binds „კი" to the tool AND to the link, in the same reply', () => {
    const text = buildCampaignInviteSection(base);

    expect(text).toContain('respond_to_invite_campaign(response="agreed")');
    expect(text).toContain('get_invite_link');
  });

  it('tells the run that a bare „არა" is an answer, not a puzzle', () => {
    // Live: „არა" came back as „რაზე „არა"? რა გაქვს მხედველობაში?"
    const text = buildCampaignInviteSection(base);

    expect(text).toContain('respond_to_invite_campaign(response="declined")');
    expect(text).toContain('რაზე არა?');
  });

  it('never invents a record it does not have', () => {
    const text = buildCampaignInviteSection({ ...base, target_facts: [], saved_as: null });

    expect(text).toContain('არ გვაქვს');
    expect(text).toContain('ნუ გამოიგონებ');
  });

  it('says plainly when the colour of the tie is unrecorded', () => {
    const text = buildCampaignInviteSection({ ...base, relationship_colour: null });

    expect(text).toContain('ფერი არ არის ჩაწერილი');
  });
});
