jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  default: { end: jest.fn() },
}));

import { eligibilityRefusalLine } from '../auth.service';

/** The frontend's 10:50Z (#5611): a refused eligibility carries its own line. */
describe('the eligibility answer’s line', () => {
  it('carries each #5611 line word for word', () => {
    expect(eligibilityRefusalLine(false, 'invite_link_full')).toBe(
      'ამ მოწვევის ბმულით უკვე შემოვიდა იმდენი ადამიანი, რამდენსაც ის იღებს.',
    );
    expect(eligibilityRefusalLine(false, 'invite_link_expired')).toBe(
      'ამ მოწვევის ბმულს ვადა გაუვიდა.',
    );
    expect(eligibilityRefusalLine(false, 'not_in_inviter_contacts')).toContain(
      'მომწვევს შენი ნომერი აქვს შენახული',
    );
  });

  it('carries no line when the number may join, or when no reason was given', () => {
    expect(eligibilityRefusalLine(true, undefined)).toBeUndefined();
    expect(eligibilityRefusalLine(false, undefined)).toBeUndefined();
  });
});
