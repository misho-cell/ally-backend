import { readFileSync } from 'fs';
import { join } from 'path';
import { replyOffersAMember } from '../chat.service';
import { MEMBERS_SKIPPED_NUDGE } from '../replyGuards';

/**
 * #960 (the tester's 1138/1142): the run's own search found the owner's
 * contacts on Netai, and the reply offered web leads or an invitation instead.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('a reply that offers a member found on Netai', () => {
  it('is recognised by the first name, with a Georgian case ending', () => {
    expect(replyOffersAMember('ნინოს ვკითხავ, იცნობს თუ არა პედიატრს.', ['ნინო ბერიძე'])).toBe(
      true,
    );
    expect(replyOffersAMember('I can ask Giorgi first.', ['Giorgi Abashidze'])).toBe(true);
  });

  it('is not one that names only web leads', () => {
    expect(replyOffersAMember('ვებზე ვიპოვე კლინიკა „მედი".', ['ნინო ბერიძე'])).toBe(false);
  });
});

describe('the guard', () => {
  it('remembers who came back on Netai from the run’s own searches', () => {
    expect(chat).toContain('noteMembersFound(runId, rows);');
    expect(chat).toContain("if (r.is_member !== true || typeof r.phone !== 'string'");
  });

  it('asks once, only when none was asked or offered, and never for a short question back', () => {
    expect(chat).toContain(
      "toolNamesUsed.some((t) => t === 'ask_contact' || t === 'request_introduction')",
    );
    expect(chat).toContain('trimmed.length < SHORT_QUESTION_BACK_CHARS');
    expect(chat).toContain('? MEMBERS_SKIPPED_NUDGE');
    expect(MEMBERS_SKIPPED_NUDGE).toContain('people_to_involve');
  });

  it('is never shown as the owner’s own words', () => {
    const set = chat.slice(chat.indexOf('export const MODEL_ONLY_NUDGES'));
    expect(set.slice(0, 400)).toContain('MEMBERS_SKIPPED_NUDGE,');
  });
});
