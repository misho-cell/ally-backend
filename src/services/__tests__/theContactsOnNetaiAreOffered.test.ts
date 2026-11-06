import { readFileSync } from 'fs';
import { join } from 'path';
import {
  factChangeThatCounts,
  factCheckIsDue,
  lookupOfNamedPeople,
  replyOffersAMember,
  skippedThese,
} from '../chat.service';
import { FactChange } from '../factKeeping';
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

/**
 * The tester's prompt check (5 Nov, C3): probe 80785 proposed a plan that named
 * a member, the word reading missed the name, and the note forced a second
 * message. A proposed plan is where the members were weighed.
 */
describe('a run that proposed a plan', () => {
  it('gets no members note, whatever the reply’s words', () => {
    const reply = 'გეგმა მზადაა: ჯერ ერთ ადამიანს ვკითხავ, მერე მეორეს.';
    expect(skippedThese(['ნინო ბერიძე'], reply, ['propose_task_plan'])).toBe(false);
  });
});

describe('the guard', () => {
  it('remembers who came back on Netai from the run’s own searches', () => {
    expect(chat).toContain('noteMembersFound(runId, rows);');
    expect(chat).toContain("if (r.is_member !== true || typeof r.phone !== 'string'");
  });

  it('asks once, only when none was asked or offered, and never for a short question back', () => {
    const reply = 'ვებზე ვიპოვე ორი კლინიკა და ერთი ექიმი, რომელიც ამ საქმეს კარგად იცნობს.';
    expect(skippedThese(['ნინო ბერიძე'], reply, ['search_second_degree'])).toBe(true);
    expect(skippedThese(['ნინო ბერიძე'], reply, ['ask_contact'])).toBe(false);
    expect(skippedThese(['ნინო ბერიძე'], reply, ['request_introduction'])).toBe(false);
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

/** The tester's battery (6 Nov, C8): a lookup of one named contact offers nobody. */
describe('a run that only looked people up by name', () => {
  it('is a lookup, and gets no members note', () => {
    expect(lookupOfNamedPeople(['search_contact_by_name'])).toBe(true);
    expect(lookupOfNamedPeople(['search_contact_by_name', 'search_second_degree'])).toBe(false);
    expect(lookupOfNamedPeople(['search_by_tag'])).toBe(false);
    expect(chat).toContain('!lookupOfNamedPeople(toolNamesUsed) &&');
  });
});

/**
 * The tester's battery (6 Nov, C5) and ops' daily check (6 Nov 18:45Z): „for
 * somebody else" misread first-person words and refused real people's questions.
 */
describe('the fact check', () => {
  const beneficiary = { change: FactChange.Beneficiary, word: 'დამირეკე' };
  const time = { change: FactChange.Time, word: 'შარშან' };

  it('no longer counts „for somebody else", anywhere', () => {
    expect(factChangeThatCounts(beneficiary)).toBeNull();
  });

  it('still counts a changed time or detail', () => {
    expect(factChangeThatCounts(time)).toBe(time);
    expect(factChangeThatCounts(null)).toBeNull();
  });

  it('holds a question to one person back once per run, then lets the rewrite go', () => {
    expect(factCheckIsDue('run-1', '+995 555 00 01 11')).toBe(true);
    expect(chat).toContain('if (factCheckIsDue(runId, askPhone)) {');
    expect(chat).toContain('noteFactHeld(runId, askPhone);');
    expect(chat).toContain('forgetFactHolds(runId);');
    expect(factCheckIsDue(undefined, 'x')).toBe(true);
  });
});
