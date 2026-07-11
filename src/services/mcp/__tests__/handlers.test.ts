jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../../tools/searchByTag', () => ({ searchByTag: jest.fn(), __esModule: true }));
jest.mock('../../tools/searchContactByName', () => ({
  searchContactByName: jest.fn(),
  __esModule: true,
}));
jest.mock('../../tools/searchByInsight', () => ({ searchByInsight: jest.fn(), __esModule: true }));
jest.mock('../../tools/searchSecondDegree', () => ({
  searchSecondDegree: jest.fn(),
  __esModule: true,
}));
jest.mock('../../tools/getContactCount', () => ({ getContactCount: jest.fn(), __esModule: true }));
jest.mock('../../tools/getContactFullProfile', () => ({
  getContactFullProfile: jest.fn(),
  // Mirrors the real predicate; requireActual would drag in the Anthropic
  // config, which demands an API key at import time.
  isDisplayableTag: (tag: string): boolean =>
    tag.length >= 2 && !/^\d+$/.test(tag) && /\p{L}/u.test(tag),
  __esModule: true,
}));
jest.mock('../../tools/requestIntroduction', () => ({
  requestIntroduction: jest.fn(),
  __esModule: true,
}));
jest.mock('../../tools/respondToIntroduction', () => ({
  respondToIntroduction: jest.fn(),
  __esModule: true,
}));
jest.mock('../../introduction.service', () => ({
  getPendingRequestsForMediator: jest.fn(),
  getRecentResponsesForRequester: jest.fn(),
  __esModule: true,
}));
jest.mock('../../moderation.service', () => ({ isReplySafe: jest.fn(), __esModule: true }));
jest.mock('../../contactFacts.service', () => ({
  FACT_FIELD_TYPES: ['occupation', 'employer', 'city', 'industry'],
  normalizeFieldType: (raw: string): string | null => {
    const s = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    return s && s.length <= 40 && /\p{L}/u.test(s) ? s : null;
  },
  submitContactFact: jest.fn(),
  getVisibleFacts: jest.fn(),
  __esModule: true,
}));
jest.mock('../../block.service', () => ({
  blockContact: jest.fn(),
  unblockContact: jest.fn(),
  getBlockedByUser: jest.fn(),
  getExcludedPhoneSet: jest.fn().mockResolvedValue(new Set<string>()),
  __esModule: true,
}));
jest.mock('../../graphAnalytics.service', () => ({
  getTopConnectors: jest.fn(),
  getGroupConnectors: jest.fn(),
  __esModule: true,
}));

import { query } from '../../../db/postgres/client';
import { searchByTag } from '../../tools/searchByTag';
import { searchContactByName } from '../../tools/searchContactByName';
import { searchByInsight } from '../../tools/searchByInsight';
import { searchSecondDegree } from '../../tools/searchSecondDegree';
import { getContactCount } from '../../tools/getContactCount';
import { getContactFullProfile } from '../../tools/getContactFullProfile';
import { requestIntroduction } from '../../tools/requestIntroduction';
import { respondToIntroduction } from '../../tools/respondToIntroduction';
import {
  getPendingRequestsForMediator,
  getRecentResponsesForRequester,
} from '../../introduction.service';
import { isReplySafe } from '../../moderation.service';
import { encodeContactRef } from '../contactRef';
import { containsPhoneLike } from '../privacy';
import {
  mcpCheckInbox,
  mcpGetContactProfile,
  mcpGetNetworkStats,
  mcpRequestIntroduction,
  mcpBlockContact,
  mcpGetContactFacts,
  mcpGetGroupConnectors,
  mcpGetTopConnectors,
  mcpListBlocked,
  mcpRespondToRequest,
  mcpSaveContactFact,
  mcpSearchByInsight,
  mcpSearchContacts,
  mcpSearchSecondDegree,
  mcpUnblockContact,
} from '../handlers';
import { getVisibleFacts, submitContactFact } from '../../contactFacts.service';
import {
  blockContact,
  getBlockedByUser,
  getExcludedPhoneSet,
  unblockContact,
} from '../../block.service';
import { normalizePhone } from '../../phone';

const mockExcludedSet = getExcludedPhoneSet as jest.MockedFunction<typeof getExcludedPhoneSet>;
import { getGroupConnectors, getTopConnectors } from '../../graphAnalytics.service';

const USER = '7';
const PHONE = '+995599123456';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSearchByTag = searchByTag as jest.MockedFunction<typeof searchByTag>;
const mockSearchByName = searchContactByName as jest.MockedFunction<typeof searchContactByName>;
const mockSearchByInsight = searchByInsight as jest.MockedFunction<typeof searchByInsight>;
const mockSecondDegree = searchSecondDegree as jest.MockedFunction<typeof searchSecondDegree>;
const mockContactCount = getContactCount as jest.MockedFunction<typeof getContactCount>;
const mockFullProfile = getContactFullProfile as jest.MockedFunction<typeof getContactFullProfile>;
const mockRequestIntro = requestIntroduction as jest.MockedFunction<typeof requestIntroduction>;
const mockRespondIntro = respondToIntroduction as jest.MockedFunction<typeof respondToIntroduction>;
const mockPending = getPendingRequestsForMediator as jest.MockedFunction<
  typeof getPendingRequestsForMediator
>;
const mockAnswered = getRecentResponsesForRequester as jest.MockedFunction<
  typeof getRecentResponsesForRequester
>;
const mockIsSafe = isReplySafe as jest.MockedFunction<typeof isReplySafe>;
const mockSubmitFact = submitContactFact as jest.MockedFunction<typeof submitContactFact>;
const mockGetFacts = getVisibleFacts as jest.MockedFunction<typeof getVisibleFacts>;
const mockBlock = blockContact as jest.MockedFunction<typeof blockContact>;
const mockUnblock = unblockContact as jest.MockedFunction<typeof unblockContact>;
const mockGetBlocked = getBlockedByUser as jest.MockedFunction<typeof getBlockedByUser>;
const mockTopConnectors = getTopConnectors as jest.MockedFunction<typeof getTopConnectors>;
const mockGroupConnectors = getGroupConnectors as jest.MockedFunction<typeof getGroupConnectors>;

function searchRow(index: number): Record<string, unknown> {
  return {
    phone: `+9955990000${String(index).padStart(2, '0')}`,
    name: `Contact ${index}`,
    tags: ['ceo'],
    employer: 'TBC',
    jobPosition: null,
    city: 'Tbilisi',
  };
}

beforeAll(() => {
  process.env.MCP_REF_SECRET = 'test-secret-for-contact-refs';
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('mcpSearchContacts', () => {
  it('replaces phones with contact_refs and leaks nothing phone-like', async () => {
    mockSearchByTag.mockResolvedValue({
      found: true,
      count: 2,
      results: [searchRow(1), searchRow(2)],
    });

    const result = await mcpSearchContacts(USER, { tag: 'ceo' });

    expect(result.found).toBe(true);
    expect(result.total).toBe(2);
    const rows = result.results as Record<string, unknown>[];
    expect(rows[0].contact_ref).toBe(encodeContactRef(USER, '+995599000001'));
    expect(rows[0].phone).toBeUndefined();
    expect(containsPhoneLike(result)).toBe(false);
  });

  it('routes name searches to searchContactByName', async () => {
    mockSearchByName.mockResolvedValue({ found: true, count: 1, results: [searchRow(1)] });

    const result = await mcpSearchContacts(USER, { name: 'Gio' });

    expect(mockSearchByName).toHaveBeenCalledWith(USER, 'Gio');
    expect(result.found).toBe(true);
  });

  it('truncates to 8 rows and tells Claude the real total', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => searchRow(i));
    mockSearchByTag.mockResolvedValue({ found: true, count: 12, results: rows });

    const result = await mcpSearchContacts(USER, { tag: 'ceo' });

    expect((result.results as unknown[]).length).toBe(8);
    expect(result.note).toContain('top 8 of 12');
  });

  it('surfaces the real total, not the capped page (ISSUE 5)', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => searchRow(i));
    mockSearchByTag.mockResolvedValue({ found: true, count: 20, total: 52, results: rows });

    const result = await mcpSearchContacts(USER, { tag: 'axel' });

    expect(result.total).toBe(52);
    expect((result.results as unknown[]).length).toBe(8);
    expect(result.note).toContain('of 52');
  });

  it('dedupes the same person appearing under several phones (ISSUE 6)', async () => {
    const dupe = (i: number): Record<string, unknown> => ({
      ...searchRow(i),
      name: 'Guntars Cauna',
    });
    mockSearchByTag.mockResolvedValue({
      found: true,
      count: 5,
      total: 5,
      results: [dupe(1), dupe(2), dupe(3), searchRow(4), searchRow(5)],
    });

    const result = await mcpSearchContacts(USER, { tag: 'developer' });

    const names = (result.results as Record<string, unknown>[]).map((r) => r.name);
    expect(names.filter((n) => n === 'Guntars Cauna')).toHaveLength(1);
    // The three collapsed slots free up for the two distinct people.
    expect(names).toContain('Contact 4');
    expect(names).toContain('Contact 5');
  });

  it('flags fuzzy (approximate) matches instead of a truncation note', async () => {
    mockSearchByTag.mockResolvedValue({
      found: true,
      count: 1,
      total: 1,
      fuzzy: true,
      results: [searchRow(1)],
    });

    const result = await mcpSearchContacts(USER, { tag: 'livigstone' });

    expect(String(result.note)).toContain('confirm by the aggregated tags');
  });

  it('returns the empty-result guidance on no matches and on missing args', async () => {
    mockSearchByTag.mockResolvedValue({ found: false, query: 'x' });
    const empty = await mcpSearchContacts(USER, { tag: 'x' });
    expect(empty.found).toBe(false);
    expect(empty.note).toContain('get_network_stats');

    const noArgs = await mcpSearchContacts(USER, {});
    expect(noArgs.error).toBeDefined();
  });

  it('insight empty note never points the caller back at insight search', async () => {
    mockSearchByInsight.mockResolvedValue({ found: false, query: 'x' });
    const empty = await mcpSearchByInsight(USER, { query: 'who invests' });
    expect(empty.found).toBe(false);
    expect(String(empty.note)).not.toContain('try search_by_insight');
  });
});

describe('mcpSearchSecondDegree', () => {
  it('drops internal identifiers but keeps via names', async () => {
    mockSecondDegree.mockResolvedValue({
      found: true,
      count: 1,
      results: [
        {
          phone: PHONE,
          name: 'Nino',
          employer: null,
          jobPosition: null,
          via: ['Tazo'],
          target_user_id: 42,
        },
      ],
    });

    const result = await mcpSearchSecondDegree(USER, { query: 'lawyer' });

    const row = (result.results as Record<string, unknown>[])[0];
    expect(row.via).toEqual(['Tazo']);
    expect(row.target_user_id).toBeUndefined();
    expect(row.contact_ref).toBe(encodeContactRef(USER, PHONE));
    expect(containsPhoneLike(result)).toBe(false);
  });
});

describe('mcpGetNetworkStats', () => {
  it('returns contact count and displayable top tags', async () => {
    mockContactCount.mockResolvedValue({ count: 812 });
    mockQuery.mockResolvedValue({
      rows: [
        { tag: 'ceo', contacts: 14 },
        { tag: '123', contacts: 9 },
      ],
      rowCount: 2,
    } as never);

    const result = await mcpGetNetworkStats(USER);

    expect(result.contact_count).toBe(812);
    expect(result.top_tags).toEqual([{ tag: 'ceo', contacts: 14 }]);
  });
});

describe('mcpGetContactProfile', () => {
  it('rejects an invented contact_ref', async () => {
    const result = await mcpGetContactProfile(USER, { contact_ref: 'c_fake' });
    expect(result.error).toContain('contact_ref');
    expect(mockFullProfile).not.toHaveBeenCalled();
  });

  it('returns the profile without any phone', async () => {
    mockFullProfile.mockResolvedValue({
      phone: PHONE,
      tags: [{ tag: 'ceo', contributor_count: 3, total_weight: 8 }],
      insights: { summary: `works at TBC, call ${PHONE}` },
      facts_and_ask: { facts: [], ask: null } as never,
    });

    const ref = encodeContactRef(USER, PHONE);
    const result = await mcpGetContactProfile(USER, { contact_ref: ref });

    expect(mockFullProfile).toHaveBeenCalledWith(USER, PHONE);
    expect(result.contact_ref).toBe(ref);
    expect(containsPhoneLike(result)).toBe(false);
  });

  it('returns unavailable (never the profile) for a blocked/deceased contact', async () => {
    mockExcludedSet.mockResolvedValueOnce(new Set([normalizePhone(PHONE)]));
    const ref = encodeContactRef(USER, PHONE);

    const result = await mcpGetContactProfile(USER, { contact_ref: ref });

    expect(result.error).toContain('unavailable');
    expect(mockFullProfile).not.toHaveBeenCalled();
  });
});

describe('mcpRequestIntroduction', () => {
  const args = {
    mediator_name: 'Tazo',
    target_name: 'Nino',
    message: 'გამარჯობა, ნინოს გაცნობა მინდა',
  };

  function setIntroCount(count: number): void {
    mockQuery.mockResolvedValue({ rows: [{ count: String(count) }], rowCount: 1 } as never);
  }

  it('blocks after the daily limit', async () => {
    setIntroCount(10);
    const result = await mcpRequestIntroduction(USER, args);
    expect(result.success).toBe(false);
    expect(result.note).toContain('Daily limit');
    expect(mockRequestIntro).not.toHaveBeenCalled();
  });

  it('blocks a message that fails moderation', async () => {
    setIntroCount(0);
    mockIsSafe.mockResolvedValue(false);
    const result = await mcpRequestIntroduction(USER, args);
    expect(result.success).toBe(false);
    expect(result.error).toContain('moderation');
    expect(mockRequestIntro).not.toHaveBeenCalled();
  });

  it('passes a decoded mediator_ref as the mediator phone', async () => {
    setIntroCount(0);
    mockIsSafe.mockResolvedValue(true);
    mockRequestIntro.mockResolvedValue({ success: true, request_id: 5, push_sent: true });

    const ref = encodeContactRef(USER, PHONE);
    const result = await mcpRequestIntroduction(USER, { ...args, mediator_ref: ref });

    expect(mockRequestIntro).toHaveBeenCalledWith(
      USER,
      'Tazo',
      'Nino',
      args.message,
      PHONE,
      undefined,
      undefined,
      'intro',
    );
    expect(result.note).toContain('Introduction request sent');
  });

  it('maps disambiguation candidates to refs, never phones', async () => {
    setIntroCount(0);
    mockIsSafe.mockResolvedValue(true);
    mockRequestIntro.mockResolvedValue({
      needs_disambiguation: true,
      candidates: [
        { phone: '+995599000001', name: 'Tazo K.' },
        { phone: '+995599000002', name: 'Tazo M.' },
      ],
    });

    const result = await mcpRequestIntroduction(USER, args);

    const candidates = result.candidates as Record<string, unknown>[];
    expect(candidates[0].mediator_ref).toBe(encodeContactRef(USER, '+995599000001'));
    expect(containsPhoneLike(result)).toBe(false);
  });

  it('rejects a foreign mediator_ref', async () => {
    setIntroCount(0);
    mockIsSafe.mockResolvedValue(true);
    const foreignRef = encodeContactRef('999', PHONE);

    const result = await mcpRequestIntroduction(USER, { ...args, mediator_ref: foreignRef });

    expect(result.success).toBe(false);
    expect(mockRequestIntro).not.toHaveBeenCalled();
  });
});

describe('mcpCheckInbox', () => {
  it('returns request_refs with the last-line note and scrubbed messages', async () => {
    mockPending.mockResolvedValue([
      {
        id: 12,
        target_name: 'Nino',
        message: `my number is ${PHONE}`,
        requester_name: 'Gio',
        created_at: '2026-07-03T10:00:00Z',
      },
    ]);
    mockAnswered.mockResolvedValue([]);

    const result = await mcpCheckInbox(USER);

    const waiting = result.waiting_for_me as Record<string, unknown>[];
    expect(waiting[0].request_ref).toBe('req_12');
    expect(waiting[0].message).toBe('my number is [hidden]');
    expect(result.note).toContain('1 unread');
    expect(containsPhoneLike(result)).toBe(false);
  });

  it('returns replies with full context (mediator, original reason, ask_type, timestamps)', async () => {
    mockPending.mockResolvedValue([]);
    mockAnswered.mockResolvedValue([
      {
        id: 20,
        target_name: 'Mari',
        status: 'accepted',
        mediator_response: 'happy to connect you',
        responded_at: '2026-07-08T12:00:00Z',
        mediator_name: 'Tazo',
        message: 'needs a lawyer for her startup',
        created_at: '2026-07-08T09:00:00Z',
        ask_type: 'intro',
      },
    ]);

    const result = await mcpCheckInbox(USER);
    const replies = result.replies_to_my_requests as Record<string, unknown>[];

    expect(replies[0].request_ref).toBe('req_20');
    expect(replies[0].from_mediator).toBe('Tazo');
    expect(replies[0].original_reason).toBe('needs a lawyer for her startup');
    expect(replies[0].ask_type).toBe('intro');
    expect(replies[0].about).toBe('Mari');
    expect(containsPhoneLike(result)).toBe(false);
  });

  it('omits the note when nothing is waiting', async () => {
    mockPending.mockResolvedValue([]);
    mockAnswered.mockResolvedValue([]);
    const result = await mcpCheckInbox(USER);
    expect(result.note).toBeUndefined();
  });
});

describe('mcpRespondToRequest', () => {
  it('rejects invented request_refs', async () => {
    expect(
      (await mcpRespondToRequest(USER, { request_ref: 'req_x', accept: true })).error,
    ).toBeDefined();
    expect(
      (await mcpRespondToRequest(USER, { request_ref: '12', accept: true })).error,
    ).toBeDefined();
    expect(mockRespondIntro).not.toHaveBeenCalled();
  });

  it('answers by parsed id', async () => {
    mockRespondIntro.mockResolvedValue({ success: true });
    const result = await mcpRespondToRequest(USER, {
      request_ref: 'req_12',
      accept: false,
      response: 'ახლა ვერ',
    });
    expect(mockRespondIntro).toHaveBeenCalledWith(USER, 12, false, 'ახლა ვერ');
    expect(result.success).toBe(true);
  });
});

describe('memory tools', () => {
  it('saves a fact by contact_ref and rejects an empty/invalid field type', async () => {
    mockSubmitFact.mockResolvedValue({ is_public: false, canonical_value: null });
    const ref = encodeContactRef(USER, PHONE);

    const ok = await mcpSaveContactFact(USER, {
      contact_ref: ref,
      field_type: 'employer',
      value: 'MKD Law',
    });
    expect(ok.saved).toBe(true);
    expect(mockSubmitFact).toHaveBeenCalledWith(USER, PHONE, 'employer', 'MKD Law');

    // field_type is free-form now, but must still be a real label — empty and
    // letterless inputs are rejected.
    const badField = await mcpSaveContactFact(USER, {
      contact_ref: ref,
      field_type: '   ',
      value: 'x',
    });
    expect(badField.saved).toBe(false);

    const badRef = await mcpSaveContactFact(USER, {
      contact_ref: 'c_fake',
      field_type: 'employer',
      value: 'x',
    });
    expect(badRef.saved).toBe(false);
    expect(mockSubmitFact).toHaveBeenCalledTimes(1);
  });

  it('accepts an arbitrary free-form key (rich profile — role, skill, …)', async () => {
    mockSubmitFact.mockResolvedValue({ is_public: false, canonical_value: null });
    const ref = encodeContactRef(USER, PHONE);

    const ok = await mcpSaveContactFact(USER, {
      contact_ref: ref,
      field_type: 'role',
      value: 'CEO @ Leavingstone',
    });

    expect(ok.saved).toBe(true);
    expect(mockSubmitFact).toHaveBeenCalledWith(USER, PHONE, 'role', 'CEO @ Leavingstone');
  });

  it('accepts a free-text note as a saveable field type', async () => {
    mockSubmitFact.mockResolvedValue({ is_public: false, canonical_value: null });
    const ref = encodeContactRef(USER, PHONE);

    const ok = await mcpSaveContactFact(USER, {
      contact_ref: ref,
      field_type: 'note',
      value: 'Approach via a warm intro — dislikes cold outreach.',
    });

    expect(ok.saved).toBe(true);
    expect(mockSubmitFact).toHaveBeenCalledWith(
      USER,
      PHONE,
      'note',
      'Approach via a warm intro — dislikes cold outreach.',
    );
  });

  it('recalls facts without leaking a phone', async () => {
    mockGetFacts.mockResolvedValue({
      facts: [{ field_type: 'employer', value: 'MKD Law', is_public: false }],
      ask_about: 'city',
    });
    const ref = encodeContactRef(USER, PHONE);

    const result = await mcpGetContactFacts(USER, { contact_ref: ref });

    expect(mockGetFacts).toHaveBeenCalledWith(USER, PHONE);
    expect(result.contact_ref).toBe(ref);
    expect(containsPhoneLike(result)).toBe(false);
  });
});

describe('blocking tools', () => {
  it('blocks and unblocks by contact_ref', async () => {
    const ref = encodeContactRef(USER, PHONE);

    expect(await mcpBlockContact(USER, { contact_ref: ref })).toEqual({ blocked: true });
    expect(mockBlock).toHaveBeenCalledWith(USER, PHONE);

    expect(await mcpUnblockContact(USER, { contact_ref: ref })).toEqual({ unblocked: true });
    expect(mockUnblock).toHaveBeenCalledWith(USER, PHONE);
  });

  it('rejects a foreign/invented ref without touching the DB', async () => {
    const foreign = encodeContactRef('999', PHONE);
    expect((await mcpBlockContact(USER, { contact_ref: foreign })).blocked).toBe(false);
    expect(mockBlock).not.toHaveBeenCalled();
  });

  it('lists blocked contacts as name + fresh ref, never a phone', async () => {
    mockGetBlocked.mockResolvedValue([{ phone: PHONE, name: 'Spammer' }]);

    const result = await mcpListBlocked(USER);

    const list = result.blocked as Record<string, unknown>[];
    expect(list[0].name).toBe('Spammer');
    expect(list[0].contact_ref).toBe(encodeContactRef(USER, PHONE));
    expect(containsPhoneLike(result)).toBe(false);
  });
});

describe('graph tools', () => {
  it('top connectors: name + ref + reach, no phone leak', async () => {
    mockTopConnectors.mockResolvedValue({
      found: true,
      results: [{ name: 'Bridge Bob', phone: PHONE, score: 42 }],
    });

    const result = await mcpGetTopConnectors(USER, {});

    const row = (result.results as Record<string, unknown>[])[0];
    expect(row.name).toBe('Bridge Bob');
    expect(row.contact_ref).toBe(encodeContactRef(USER, PHONE));
    expect(row.reach).toBe(42);
    expect(row.phone).toBeUndefined();
    expect(containsPhoneLike(result)).toBe(false);
  });

  it('group connectors: requires a group_tag and passes member_links', async () => {
    expect((await mcpGetGroupConnectors(USER, { group_tag: '' })).error).toBeDefined();

    mockGroupConnectors.mockResolvedValue({
      found: true,
      results: [{ name: 'Gio', phone: PHONE, score: 7 }],
    });
    const result = await mcpGetGroupConnectors(USER, { group_tag: 'axel' });
    expect(mockGroupConnectors).toHaveBeenCalledWith(USER, 'axel', undefined);
    expect((result.results as Record<string, unknown>[])[0].member_links).toBe(7);
  });

  it('passes the empty reason through when no connectors', async () => {
    mockTopConnectors.mockResolvedValue({ found: false, reason: 'no_connectors' });
    const result = await mcpGetTopConnectors(USER, { limit: 5 });
    expect(result.found).toBe(false);
    expect(result.reason).toBe('no_connectors');
  });
});
