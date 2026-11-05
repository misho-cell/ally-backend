jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { birthdayFromNote } from '../birthdayLens.service';
import { GET_UPCOMING_BIRTHDAYS_TOOL, upcomingBirthdays } from '../birthdaysAsked';

/** 3269 (SE-039, ME-040): told birthdays were never told back. */
const mockQuery = query as jest.MockedFunction<typeof query>;

describe('a birthday told as a note', () => {
  it('is filed as a birthday', () => {
    expect(birthdayFromNote('note', 'დაბადების დღე: 13 ოქტომბერი')).toBe('13 ოქტომბერი');
    expect(birthdayFromNote('', 'Birthday — 20 Oct')).toBe('20 Oct');
  });

  it('anything else stays a note', () => {
    expect(birthdayFromNote('note', 'კარგი ელექტრიკოსია')).toBeNull();
    expect(birthdayFromNote('note', 'დაბადების დღე: არ ვიცი')).toBeNull();
    expect(birthdayFromNote('employer', 'დაბადების დღე: 13 ოქტომბერი')).toBeNull();
  });

  it('submitContactFact files it that way', () => {
    const facts = readFileSync(join(__dirname, '..', 'contactFacts.service.ts'), 'utf8');
    expect(facts).toContain('const birthday = birthdayFromNote(fieldTypeRaw, value);');
  });
});

describe('who has a birthday soon', () => {
  it('lists the told birthdays, soonest first, notes included', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-08T12:00:00Z'));
    mockQuery.mockResolvedValue({
      rows: [
        { phone: '+441174960069', name: 'ნინო გამოგონილი', value: 'დაბადების დღე: 20 ოქტომბერი' },
        { phone: '+441174960068', name: 'ლევან მოგონილაძე', value: '13 ოქტომბერი' },
        { phone: '+441174960070', name: 'გია ტესტური', value: '1 დეკემბერი' },
      ],
      rowCount: 3,
    } as never);
    await expect(upcomingBirthdays('180122', undefined)).resolves.toEqual([
      { name: 'ლევან მოგონილაძე', birthday: '13 ოქტომბერი', days_until: 5 },
      { name: 'ნინო გამოგონილი', birthday: '20 ოქტომბერი', days_until: 12 },
    ]);
    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain("cf.field_type = 'note'");
    jest.useRealTimers();
  });

  /** #8779 group 4: the question is the model's to read, with the connector's own tool. */
  it('is a tool of the app’s run, not a word list before it', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(GET_UPCOMING_BIRTHDAYS_TOOL.name).toBe('get_upcoming_birthdays');
    expect(chat).toContain('  GET_UPCOMING_BIRTHDAYS_TOOL,\n');
    expect(chat).toContain("case 'get_upcoming_birthdays':");
    expect(chat).not.toContain('asksForBirthdays');
  });
});
