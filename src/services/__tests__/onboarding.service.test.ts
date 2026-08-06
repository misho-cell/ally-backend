jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { isOnboardingUser, ONBOARDING_WINDOW_DAYS } from '../onboarding.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

beforeEach(() => jest.clearAllMocks());

describe('isOnboardingUser', () => {
  it('true for a young account with no completed import', async () => {
    mockQuery.mockResolvedValue(rows([{ young: true, has_import: false }]) as never);

    expect(await isOnboardingUser('501')).toBe(true);
    expect(mockQuery.mock.calls[0][1]).toEqual(['501', ONBOARDING_WINDOW_DAYS]);
  });

  it('false once the first import completed — even inside the window', async () => {
    mockQuery.mockResolvedValue(rows([{ young: true, has_import: true }]) as never);

    expect(await isOnboardingUser('501')).toBe(false);
  });

  it('false after the window — even with no import (never a permanent state)', async () => {
    mockQuery.mockResolvedValue(rows([{ young: false, has_import: false }]) as never);

    expect(await isOnboardingUser('501')).toBe(false);
  });

  it('false for a missing user row', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    expect(await isOnboardingUser('999')).toBe(false);
  });

  it('fails safe to false on a DB error', async () => {
    mockQuery.mockRejectedValue(new Error('down'));

    expect(await isOnboardingUser('501')).toBe(false);
  });
});
