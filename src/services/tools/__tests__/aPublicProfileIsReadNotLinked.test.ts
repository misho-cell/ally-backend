import { readFileSync } from 'fs';
import { join } from 'path';
import {
  PUBLIC_PROFILE_NOTE,
  profileEvidence,
  profilePage,
  profileUrlIn,
  withPublicProfile,
} from '../publicProfileRead';

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
        note: PUBLIC_PROFILE_NOTE,
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

/** CH (4720, the tester's 56073): no date and once a bare link. Misho's yes, §139. */
describe('the note that rides with the page', () => {
  it('is Misho’s sentence word for word', () => {
    expect(PUBLIC_PROFILE_NOTE).toBe(
      'When you use public_profile, say where it is from and the day it was read (e.g. „LinkedIn, read 13 Oct"); never a bare link.',
    );
  });
});

describe("the page read is the run's evidence (4720, the EN seat)", () => {
  it('is the page text, so the officeholder gate keeps the name it carries', () => {
    const page = { url: PROFILE, read_on: '2026-10-13', content: 'Jane Doe — CEO', note: 'n' };
    expect(profileEvidence({ ...found, public_profile: page })).toBe('Jane Doe — CEO');
  });

  it('is nothing when no page was read: snippets alone are never evidence (D151)', () => {
    expect(profileEvidence(found)).toBeNull();
    expect(profileEvidence({ public_profile: { url: PROFILE } })).toBeNull();
    expect(profileEvidence(null)).toBeNull();
  });

  it('is recorded from the web_search turn', () => {
    const chat = readFileSync(join(__dirname, '..', '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain("recordRunEvidence(runId, profileEvidence(raw) ?? '');");
  });
});
