jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../userProfile.service', () => ({
  __esModule: true,
  getUserProfile: jest.fn(),
  setUserProfileField: jest.fn(),
}));

import { query } from '../../db/postgres/client';
import { getUserProfile, setUserProfileField } from '../userProfile.service';
import {
  getOnboardingStatus,
  markOnboardingSkipped,
  ONBOARDING_SKIPPED_KEY,
} from '../onboarding.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockGetProfile = getUserProfile as jest.MockedFunction<typeof getUserProfile>;
const mockSetField = setUserProfileField as jest.MockedFunction<typeof setUserProfileField>;

function accountRow(ageDays: number, contacts: number): { rows: unknown[]; rowCount: number } {
  return { rows: [{ age_days: ageDays, contacts: String(contacts) }], rowCount: 1 };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetProfile.mockResolvedValue({});
  mockSetField.mockResolvedValue(undefined);
});

// The client was going to infer this from "does any thread exist", which is
// wrong in both directions — hence one server-side answer, the same one the
// prompt mode is chosen by.
describe('getOnboardingStatus', () => {
  it('a young account with no contacts is still onboarding', async () => {
    mockQuery.mockResolvedValue(accountRow(2, 0) as never);

    const out = await getOnboardingStatus('1');

    expect(out.is_onboarding).toBe(true);
    expect(out.contacts_imported).toBe(false);
    expect(out.skipped_at).toBeNull();
  });

  it('an import ends onboarding however young the account is', async () => {
    mockQuery.mockResolvedValue(accountRow(1, 412) as never);

    const out = await getOnboardingStatus('1');

    expect(out.is_onboarding).toBe(false);
    expect(out.contacts_imported).toBe(true);
    expect(out.contacts_count).toBe(412);
  });

  it('the window ends onboarding even with no import', async () => {
    mockQuery.mockResolvedValue(accountRow(30, 0) as never);

    expect((await getOnboardingStatus('1')).is_onboarding).toBe(false);
  });

  it('reports a recorded skip', async () => {
    mockQuery.mockResolvedValue(accountRow(2, 0) as never);
    mockGetProfile.mockResolvedValue({ [ONBOARDING_SKIPPED_KEY]: '2026-09-02T08:00:00.000Z' });

    const out = await getOnboardingStatus('1');

    expect(out.skipped_at).toBe('2026-09-02T08:00:00.000Z');
    // Skipping does not by itself end onboarding — that rule belongs to the
    // prompt team, and this field only reports what the person chose.
    expect(out.is_onboarding).toBe(true);
  });
});

describe('markOnboardingSkipped', () => {
  it('records the choice once and keeps the first timestamp', async () => {
    mockQuery.mockResolvedValue(accountRow(2, 0) as never);

    await markOnboardingSkipped('1');
    expect(mockSetField).toHaveBeenCalledWith('1', ONBOARDING_SKIPPED_KEY, expect.any(String));

    mockSetField.mockClear();
    mockGetProfile.mockResolvedValue({ [ONBOARDING_SKIPPED_KEY]: '2026-09-01T00:00:00.000Z' });
    const out = await markOnboardingSkipped('1');

    expect(mockSetField).not.toHaveBeenCalled();
    expect(out.skipped_at).toBe('2026-09-01T00:00:00.000Z');
  });
});
