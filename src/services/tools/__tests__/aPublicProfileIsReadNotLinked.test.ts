import { profilePage, profileUrlIn, withPublicProfile } from '../publicProfileRead';

/**
 * 4720 (box 54881): the search found the person's public LinkedIn page and the
 * reply handed over the link. The server reads that one page (Misho's A, §134).
 */
const PROFILE = 'https://ge.linkedin.com/in/someone-401492b1';
const found = {
  results: [
    { title: 'A news page', url: 'https://news.ge/a' },
    { title: 'Someone — LinkedIn', url: PROFILE },
  ],
};
const NOW = new Date('2026-10-12T13:58:00Z');

describe('the profile among the results', () => {
  it('is the first public profile in the top three', () => {
    expect(profileUrlIn(found)).toBe(PROFILE);
  });

  it('is none for a company page, a profile further down, or no results', () => {
    expect(profileUrlIn({ results: [{ url: 'https://www.linkedin.com/company/tbc' }] })).toBeNull();
    const far = { results: [{ url: 'a' }, { url: 'b' }, { url: 'c' }, { url: PROFILE }] };
    expect(profileUrlIn(far)).toBeNull();
    expect(profileUrlIn({ error: 'unavailable' })).toBeNull();
  });
});

describe('withPublicProfile', () => {
  it('reads the page once and hands it over with where and when it was read', async () => {
    const read = jest.fn().mockResolvedValue({ content: 'Head of Sales at Wissol since 2023' });
    const cost = jest.fn().mockResolvedValue(undefined);
    await expect(withPublicProfile(found, read, cost, NOW)).resolves.toEqual({
      ...found,
      public_profile: {
        url: PROFILE,
        read_on: '2026-10-12',
        content: 'Head of Sales at Wissol since 2023',
      },
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(cost).toHaveBeenCalledTimes(1);
  });

  it('reads nothing and costs nothing when no profile is among the results', async () => {
    const read = jest.fn();
    const cost = jest.fn();
    const plain = { results: [{ url: 'https://news.ge/a' }] };
    await expect(withPublicProfile(plain, read, cost, NOW)).resolves.toBe(plain);
    expect(read).not.toHaveBeenCalled();
    expect(cost).not.toHaveBeenCalled();
  });

  it('leaves the result as it was when the read fails or is empty', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cost = jest.fn().mockResolvedValue(undefined);
    await expect(
      withPublicProfile(found, jest.fn().mockRejectedValue(new Error('timeout')), cost, NOW),
    ).resolves.toBe(found);
    await expect(
      withPublicProfile(found, jest.fn().mockResolvedValue({ error: 'blocked' }), cost, NOW),
    ).resolves.toBe(found);
  });

  it('keeps at most 6,000 characters of the page', () => {
    const page = profilePage(PROFILE, { content: 'x'.repeat(9_000) }, '2026-10-12');
    expect(page?.content).toHaveLength(6_000);
  });
});
