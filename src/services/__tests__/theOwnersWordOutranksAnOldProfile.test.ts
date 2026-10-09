import { readFileSync } from 'fs';
import { join } from 'path';
import { applyFacts, ContactFactFields } from '../tools/factEnrichment';
import { normalizePhone } from '../phone';

/**
 * 4226 (the founder's account, 9 Oct; D742): a contact with an old Ally account
 * showed his old employer and job however the owner corrected them.
 */
const row = {
  phone: '+995 000 000 001',
  employer: 'Old Bank',
  jobPosition: 'Teller',
  city: null as string | null,
};

function facts(own: boolean): Map<string, ContactFactFields> {
  return new Map([
    [
      normalizePhone(row.phone),
      {
        employer: 'New Studio',
        jobPosition: 'Designer',
        city: null,
        industry: null,
        dates: { employer: '2026-10-09', jobPosition: '2026-10-09' },
        own: own ? { employer: true, jobPosition: true } : {},
      },
    ],
  ]);
}

describe('the owner’s own word about his contact', () => {
  it('wins over the contact’s old profile', () => {
    const shown = applyFacts(row, facts(true));
    expect(shown.employer).toBe('New Studio');
    expect(shown.jobPosition).toBe('Designer');
    expect(shown.facts_as_of).toEqual({ employer: '2026-10-09', jobPosition: '2026-10-09' });
  });

  it('a fact somebody else made public still only fills an empty field', () => {
    const shown = applyFacts(row, facts(false));
    expect(shown.employer).toBe('Old Bank');
    expect(shown.jobPosition).toBe('Teller');
    expect(shown.facts_as_of).toBeUndefined();
  });

  it('a value saved over a retracted one is shown again', () => {
    const service = readFileSync(join(__dirname, '..', 'contactFacts.service.ts'), 'utf8');
    const upsert = service.slice(
      service.indexOf('ON CONFLICT (neo4j_contact_id, submitted_by_user_id, field_type)'),
    );
    expect(upsert.slice(0, 600)).toContain('retracted_at = NULL');
  });
});
