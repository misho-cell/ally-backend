jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import {
  isTypedLater,
  laterConfirmLine,
  laterDayChoices,
  laterDaysOf,
  LATER_UNTIL_SQL,
} from '../laterChoices';
import { setLaterDays } from '../taskAsks.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/** #1686 (A3): „later" gets a day, and the ask comes back once on it. */
describe('the three days', () => {
  it('are offered in the reader’s language and read back in any', () => {
    expect(laterDayChoices('ka')).toEqual(['ხვალ', '3 დღეში', 'მომავალ კვირას']);
    expect(laterDayChoices('en')).toEqual(['Tomorrow', 'In 3 days', 'Next week']);
    expect(laterDaysOf('ხვალ')).toBe(1);
    expect(laterDaysOf('In 3 days')).toBe(3);
    expect(laterDaysOf('На следующей неделе')).toBe(7);
    expect(laterDaysOf('maybe next week')).toBeNull();
  });

  it('come back at 09:30 Tbilisi time on the day', () => {
    expect(LATER_UNTIL_SQL('$2')).toContain("TIME '09:30'");
    expect(LATER_UNTIL_SQL('$2')).toContain("AT TIME ZONE 'Asia/Tbilisi'");
  });
});

describe('a typed later', () => {
  it('counts as the button when it is only the word', () => {
    expect(isTypedLater('მოგვიანებით')).toBe(true);
    expect(isTypedLater('მოგვიანებით გიპასუხებ')).toBe(true);
    expect(isTypedLater('later')).toBe(true);
    expect(isTypedLater('Позже')).toBe(true);
  });

  it('does not count when a sentence merely mentions later', () => {
    expect(isTypedLater('I know a dentist, I will send the number later today')).toBe(false);
    expect(isTypedLater('ნინოს ვიცნობ, მოგვიანებით ნომერს მოგწერ')).toBe(false);
  });
});

describe('the reader’s line', () => {
  it('names the day the question comes back', () => {
    const until = new Date('2026-10-09T05:30:00Z');
    expect(laterConfirmLine('ka', until)).toBe(
      'კარგი — ამ კითხვას 9 ოქტომბერს (პარასკევი) შეგახსენებ.',
    );
    expect(laterConfirmLine('en', until)).toContain('Friday 9 October');
  });
});

describe('setting the day', () => {
  it('moves the latest open ask on the thread, and its one reminder with it', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ later_until: new Date('2026-10-09T05:30:00Z') }],
    } as never);
    await expect(setLaterDays(41, 3)).resolves.toEqual(new Date('2026-10-09T05:30:00Z'));
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('reminded_at = NULL');
    expect(String(sql)).toContain("status = 'sent'");
    expect(params).toEqual([41, 3]);
  });

  it('is wired: a later gets the three buttons, a picked day gets the line', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('? [...laterDayChoices(language)]');
    expect(chat).toContain(
      'effectiveFinal = await withLaterLine(effectiveFinal, threadId, language, userMessage);',
    );
    expect(chat).toContain('void setLaterDays(threadId, laterDays)');
  });
});
