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
    // The tester's 1150 (38314): the web's notary shared the member's first name.
    expect(replyOffersAMember('ნოტარიუსები: თამარ ჩაფიძე, ქუთაისი.', ['თამარ ხუციშვილი'])).toBe(
      false,
    );
    expect(replyOffersAMember('თამარ ხუციშვილს ვკითხავ.', ['თამარ ხუციშვილი'])).toBe(true);
    expect(replyOffersAMember('თამარს ვკითხავ, იცნობს თუ არა.', ['თამარ ხუციშვილი'])).toBe(true);
    expect(replyOffersAMember('ნინოს ურჩევია ერთი ექიმი.', ['ნინო ბერიძე'])).toBe(true);
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
    // The tester's 1149 (38051): an addition after the first answer, not a rewrite.
    expect(MEMBERS_SKIPPED_NUDGE).toContain('შენი წინა პასუხი რჩება');
    expect(MEMBERS_SKIPPED_NUDGE).toContain('დაწერე მხოლოდ ეს დამატება');
    expect(MEMBERS_SKIPPED_NUDGE).not.toContain('თავიდან დაწერე');
  });

  it('is never shown as the owner’s own words', () => {
    const set = chat.slice(chat.indexOf('export const MODEL_ONLY_NUDGES'));
    expect(set.slice(0, 400)).toContain('MEMBERS_SKIPPED_NUDGE,');
  });
});

/** #1487 (39331): a member named only as a namesake of a web result was not offered. */
describe('a member set aside as a namesake', () => {
  it('is not counted as offered', () => {
    const reply =
      'ერთადერთი დამთხვევა თამარ ხუციშვილია, შენი კონტაქტი, მაგრამ ეს სახელის მხოლოდ ნაწილობრივი ' +
      'დამთხვევაა. ის სულ სხვა ადამიანია, არა ნოტარიუსი.';
    expect(replyOffersAMember(reply, ['თამარ ხუციშვილი'])).toBe(false);
  });

  it('is counted when another sentence offers her', () => {
    const reply = 'ის სულ სხვა ადამიანია. თამარ ხუციშვილს შეიძლება ვკითხოთ, ნოტარიუსს თუ იცნობს.';
    expect(replyOffersAMember(reply, ['თამარ ხუციშვილი'])).toBe(true);
  });
});
