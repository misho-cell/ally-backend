jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { birthdayFromNote } from '../birthdayLens.service';
import { asksForBirthdays, birthdaysAnswer, birthdaysSoon } from '../birthdaysAsked';

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
  it('knows the question, not a told birthday', () => {
    expect(asksForBirthdays('ვის აქვს მალე დაბადების დღე?')).toBe(true);
    expect(asksForBirthdays('Whose birthday is coming up soon? Any upcoming birthdays?')).toBe(
      true,
    );
    expect(asksForBirthdays('ლევან მოგონილაძის დაბადების დღე 13 ოქტომბერს არის.')).toBe(false);
  });

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
    const rows = await birthdaysSoon('180122');
    expect(birthdaysAnswer(rows, 'ka')).toBe(
      'მალე დაბადების დღე აქვთ:\n• ლევან მოგონილაძე — 13 ოქტომბერი (5 დღეში)\n• ნინო გამოგონილი — 20 ოქტომბერი (12 დღეში)',
    );
    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain("cf.field_type = 'note'");
    jest.useRealTimers();
  });

  it('says so when none falls in the next month', () => {
    expect(birthdaysAnswer([], 'ka')).toBe(
      'მომდევნო 30 დღეში შენახული დაბადების დღე არავისი მაქვს.',
    );
  });

  it('runs before the model, in the owner’s own conversation', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      "!ownerAbsent && thread.type === 'regular' && asksForBirthdays(userMessage)",
    );
  });
});
