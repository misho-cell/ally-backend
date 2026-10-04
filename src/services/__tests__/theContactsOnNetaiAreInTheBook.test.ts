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
import { MEMBERS_IN_THE_BOOK_PREFIX, membersInTheBookNudge } from '../replyGuards';

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
      "runModes.get(runId) === 'task_step' &&\n    !runMembersFound.has(runId) &&",
    );
    expect(chat).toContain('? membersInTheBookNudge(bookMembersSkipped)');
    expect(chat).toContain('bookMembersSkipped.length > 0 ||');
  });
});
