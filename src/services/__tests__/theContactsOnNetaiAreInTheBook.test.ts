jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../block.service', () => ({
  __esModule: true,
  getExcludedPhoneSet: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { getExcludedPhoneSet } from '../block.service';
import { normalizePhone } from '../phone';
import { ownersContactsOnNetai } from '../ownersMembers.service';
import {
  MEMBERS_IN_THE_BOOK_PREFIX,
  continuationCoversAnswer,
  membersInTheBookNudge,
  onlyTheMembersPart,
} from '../replyGuards';

/**
 * #960, the tester's 1145 (37787, 37895, 37878): the run never listed the
 * owner's contacts on Netai, so the rule had nothing to remember. They are
 * read from his phonebook.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;

describe('the owner’s contacts on Netai, from his phonebook', () => {
  it('are named by his own label, never by number, and an excluded one is left out', async () => {
    (getExcludedPhoneSet as jest.Mock).mockResolvedValueOnce(
      new Set([normalizePhone('995500000009')]),
    );
    mockQuery.mockResolvedValueOnce({
      rows: [
        { phone: '995500000001', name: ' ნინო ექიმი ' },
        { phone: '995500000009', name: 'გია' },
        { phone: '995500000003', name: null },
      ],
      rowCount: 3,
    } as never);
    await expect(ownersContactsOnNetai('501', 5)).resolves.toEqual(['ნინო ექიმი']);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('ua."contactId" = $1::int AND u.id <> $1::int');
    expect(String(sql)).toContain('LIMIT $3::int');
    expect(params).toEqual(['501', ['active', 'trialing', 'past_due'], 5]);
  });
});

describe('the note that names them', () => {
  it('names them, says the people route comes before the web and an invitation', () => {
    const note = membersInTheBookNudge(['ნინო ექიმი', 'გია']);
    expect(note.startsWith(MEMBERS_IN_THE_BOOK_PREFIX)).toBe(true);
    expect(note).toContain('ნინო ექიმი, გია.');
    expect(note).toContain('ვებსა და მოწვევამდე');
    expect(note).toContain('მოწვევა მხოლოდ მფლობელის თხოვნით');
  });

  it('is kept out of the owner’s history like every other model-only note', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'return MODEL_ONLY_NUDGES.has(content) || content.startsWith(MEMBERS_IN_THE_BOOK_PREFIX);',
    );
    expect(chat).not.toContain('MODEL_ONLY_NUDGES.has(m.content)');
    expect(chat).not.toContain('MODEL_ONLY_NUDGES.has(msg.content)');
  });

  it('is asked in a goal run whose searches listed none of them, only when the reply skipped them', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      "(runModes.get(runId) === 'task_step' || toolNamesUsed.includes('set_task_brief')) &&\n    !runMembersFound.has(runId) &&",
    );
    expect(chat).toContain('? membersInTheBookNudge(bookMembersSkipped)');
    expect(chat).toContain('bookMembersSkipped.length > 0 ||');
  });
});

/** The tester's 1149 (38113, 38110): the corrected turn replaced the first answer and lost its finds. */
describe('the turn after the members note', () => {
  it('asks for an addition only, in one round, without profiles or other searches', () => {
    const note = membersInTheBookNudge(['ნინო ექიმი']);
    expect(note).toContain('შენი წინა პასუხი რჩება');
    expect(note).toContain('დაწერე მხოლოდ დამატება');
    expect(note).toContain('ერთ რაუნდში იპოვე search_contact_by_name-ით');
    expect(note).toContain('სხვა ძებნა, პროფილი ან კონტაქტების სია აღარ გჭირდება');
    expect(note).not.toContain('თავიდან დაწერე');
  });

  it('follows the first answer instead of replacing it', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'guardNudge === MEMBERS_SKIPPED_NUDGE || guardNudge.startsWith(MEMBERS_IN_THE_BOOK_PREFIX);',
    );
    expect(chat).toContain('(addedTo && continuationCoversAnswer(announcement, continuationText))');
  });
});

describe('continuationCoversAnswer', () => {
  const answer =
    'შენს კონტაქტებში ორი სანტექნიკოსია: გელა სანტექნიკი და ზურა სანტექნიკი. ' +
    'საჯაროდ ნაპოვნია ბექა, ვაკე და საბურთალო.';

  it('is true when the turn wrote the first answer out again', () => {
    const rewrite = `${answer} ასევე ვკითხავ გიორგი ბერიძეს.`;
    expect(continuationCoversAnswer(answer, rewrite)).toBe(true);
  });

  it('is false for an addition that names only the members', () => {
    expect(continuationCoversAnswer(answer, 'ვკითხავ გიორგი ბერიძეს და მარიამ წიკლაურს.')).toBe(
      false,
    );
  });

  it('is false for an empty first answer', () => {
    expect(continuationCoversAnswer('', 'ვკითხავ გიორგის.')).toBe(false);
  });
});

/** The tester's 1150 (38316): the promise note took the turn and the members were never offered. */
describe('a promise and skipped members in one reply', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('reads the phonebook even when the reply also promised', () => {
    expect(chat).toContain(
      '!answeredWithoutSearching\n      ? await membersInTheBookSkipped(userId, finalText, toolNamesUsed)',
    );
  });

  it('asks about the members first', () => {
    const chain = chat.slice(chat.indexOf('const guardNudge = claimedASendThatDidNotHappen'));
    expect(chain.indexOf('? membersInTheBookNudge(bookMembersSkipped)')).toBeLessThan(
      chain.indexOf(': PROMISED_ACTION_NUDGE'),
    );
  });
});

/** The tester's 37795 (38319): the turn after the members note wrote the answer again. */
describe('the addition after the first answer', () => {
  const namesVano = (p: string): boolean => p.includes('ვანო');

  it('keeps the paragraphs that name a member, and the question after them', () => {
    const turn =
      'ამ ეტაპზე ოთხივე კომპანიაზე პირდაპირი კავშირი ვერ გამოჩნდა.\n\n' +
      'შენს ნაცნობებში ვანო ხელოსანი შეიძლება იცნობდეს.\n\nამ გეგმას მივყვე?';
    expect(onlyTheMembersPart(turn, namesVano)).toBe(
      'შენს ნაცნობებში ვანო ხელოსანი შეიძლება იცნობდეს.\n\nამ გეგმას მივყვე?',
    );
  });

  it('stands as written when it names none of them', () => {
    const turn = 'არცერთი არ გამოდგება — ისინი ამ სფეროში არ მუშაობენ.';
    expect(onlyTheMembersPart(turn, namesVano)).toBe(turn);
  });
});
