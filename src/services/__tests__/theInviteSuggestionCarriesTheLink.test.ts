jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { inviteLinkLine } from '../chorusCampaign.service';

/** #8087 (founder 27 Oct, 67882): the invite suggestion carries the inviter's own link. */
describe('the invite suggestion', () => {
  it('ends with the inviter’s own link, ready to send', () => {
    const line = inviteLinkLine('https://www.netai.guru/join?ref=ABC123');
    expect(line).toContain('https://www.netai.guru/join?ref=ABC123');
    expect(line.startsWith('\n\n')).toBe(true);
  });

  it('adds nothing when the link is not ready', () => {
    expect(inviteLinkLine(undefined)).toBe('');
  });
});
