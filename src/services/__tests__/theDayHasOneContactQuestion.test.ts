jest.mock('../curiosityQueue.service', () => ({ maybeCuriosityUpdate: jest.fn() }));
jest.mock('../../db/postgres/client', () => ({ query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { CuriosityUpdate, maybeCuriosityUpdate } from '../curiosityQueue.service';
import {
  asksAboutTheOwner,
  contactQuestionMayRun,
  contactQuestionSection,
  dailyContactQuestionSection,
  nameStem,
  pendingAnswerSection,
  speaksOfADeath,
} from '../dailyContactQuestion';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockDue = maybeCuriosityUpdate as jest.MockedFunction<typeof maybeCuriosityUpdate>;

/** #2181 (D708): the day's one contact question, asked in the owner's own run. */
function due(who: unknown, fact: string): CuriosityUpdate {
  return {
    kind: 'curiosity',
    task_id: null,
    phone: 'p-1',
    payload: { who, missing_fact: fact },
  };
}

const OWN_RUN = { ownerPresent: true, regularThread: true, goalBound: false, preview: false };

describe('theDayHasOneContactQuestion', () => {
  it('asks by name in the owner’s own run, without the number', () => {
    const section = contactQuestionSection(due('ნინო', 'employer'));
    expect(section).toContain('„სხვათა შორის, ნინო სად მუშაობს? თუ არ იცი, არა უშავს."');
    // 3202 (c), §103: no reason sentence about finding people any more.
    expect(section).not.toContain('უკეთ მოგიძებნი');
    expect(section).toContain('field_type: employer');
    expect(section).not.toContain('p-1');
  });

  it('asks nothing when there is no question due or no name', () => {
    expect(contactQuestionSection(null)).toBe('');
    expect(contactQuestionSection(due(null, 'city'))).toBe('');
    expect(contactQuestionSection(due('ნინო', 'unknown'))).toBe('');
  });

  it('runs only with the owner present, on a regular thread, outside a goal', () => {
    expect(contactQuestionMayRun(OWN_RUN)).toBe(true);
    expect(contactQuestionMayRun({ ...OWN_RUN, ownerPresent: false })).toBe(false);
    expect(contactQuestionMayRun({ ...OWN_RUN, regularThread: false })).toBe(false);
    expect(contactQuestionMayRun({ ...OWN_RUN, goalBound: true })).toBe(false);
    expect(contactQuestionMayRun({ ...OWN_RUN, preview: true })).toBe(false);
  });
});

describe('the owner’s own run carries the day’s question (§98.1)', () => {
  it('is wired into the prompt with the run’s presence', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join } = require('path') as typeof import('path');
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'const contactQuestion = await dailyContactQuestionSection(userId, threadId, {',
    );
    expect(chat).toContain('ownerPresent: !ownerAbsent,');
    expect(chat).toMatch(/firstAsk \+\s+contactQuestion \+/u);
  });
});

describe('the answer that comes a line later (2674)', () => {
  it('reminds the run which contact and which fact wait, never the owner’s profile', () => {
    const section = pendingAnswerSection({ id: 1, label: 'ნინო', missing_fact: 'city' });
    expect(section).toContain('ნინო — რომელ ქალაქში ცხოვრობს?');
    expect(section).toContain('field_type: city');
    expect(section).toContain('update_user_profile არა');
  });

  it('says nothing without a question or a name', () => {
    expect(pendingAnswerSection(null)).toBe('');
    expect(pendingAnswerSection({ id: 1, label: null, missing_fact: 'city' })).toBe('');
  });
});

/**
 * The tester's 45676: the question was logged when handed to the run, and two
 * runs of three ended on their own question instead — the day's one spent.
 */
describe('a question handed out but never asked is handed out again', () => {
  const PENDING = { id: 77, label: 'ზვიადი გამოგონილი', missing_fact: 'occupation' };

  beforeEach(() => {
    mockQuery.mockReset();
    mockDue.mockReset();
  });

  function rows(...r: unknown[]): never {
    return { rows: r, rowCount: r.length } as never;
  }

  it('re-arms the question when no reply since names the contact', async () => {
    mockDue.mockResolvedValueOnce(null).mockResolvedValueOnce(due('ზვიადი', 'occupation'));
    mockQuery
      .mockResolvedValueOnce(rows(PENDING))
      .mockResolvedValueOnce(rows({ unasked: true }))
      .mockResolvedValueOnce(rows());

    const section = await dailyContactQuestionSection('179648', 44255, OWN_RUN);

    expect(section).toContain('სხვათა შორის, ზვიადი რას საქმიანობს?');
    expect(mockQuery.mock.calls[1][1]).toEqual(['179648', 44255, 77, 'ზვიად']);
    expect(mockQuery.mock.calls[2]).toEqual([
      'DELETE FROM curiosity_surfacing_log WHERE id = $1',
      [77],
      expect.any(Number),
    ]);
  });

  it('keeps the reminder when the question was asked', async () => {
    mockDue.mockResolvedValue(null);
    mockQuery.mockResolvedValueOnce(rows(PENDING)).mockResolvedValueOnce(rows({ unasked: false }));

    const section = await dailyContactQuestionSection('179646', 44254, OWN_RUN);

    expect(section).toContain('დღეს ჰკითხე: ზვიადი გამოგონილი — რას საქმიანობს?');
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockDue).toHaveBeenCalledTimes(1);
  });

  it('reads nothing more when a question is due anyway', async () => {
    mockDue.mockResolvedValue(due('ნინო', 'city'));

    await dailyContactQuestionSection('501', 44254, OWN_RUN);

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('matches every case form of the first name', () => {
    expect(nameStem('ზვიადი გამოგონილი')).toBe('ზვიად');
    expect(nameStem('  Netai Test Lado N1 ')).toBe('Neta');
    expect(nameStem('გია')).toBe('გია');
    expect(nameStem('')).toBe('');
  });
});

/** 2938 (conv 44344): „რისი ცოდნა გინდა ჩემზე?" got the contact question instead. */
describe('a reply about the owner', () => {
  it('carries no contact question', () => {
    expect(asksAboutTheOwner('რისი ცოდნა გინდა ჩემზე?')).toBe(true);
    expect(asksAboutTheOwner('რა იცი ჩემ შესახებ?')).toBe(true);
    expect(asksAboutTheOwner('What do you need to know about me?')).toBe(true);
    expect(asksAboutTheOwner('კარგი იურისტი მჭირდება')).toBe(false);
    expect(contactQuestionMayRun({ ...OWN_RUN, ownerAsksAboutSelf: true })).toBe(false);
    expect(contactQuestionMayRun({ ...OWN_RUN, ownerAsksAboutSelf: false })).toBe(true);
  });

  it('is told the owner line by the run', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join } = require('path') as typeof import('path');
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('ownerAsksAboutSelf: asksAboutTheOwner(ownerLine),');
    expect(chat).toContain("ownerAbsent ? '' : userMessage,");
  });
});

describe('3434: never after a line about a death', () => {
  it.each(['დათო გარდაიცვალა. აღარ შემომთავაზო.', 'Nino passed away last week', 'Он умер'])(
    '%s',
    (line) => {
      expect(speaksOfADeath(line)).toBe(true);
      expect(
        contactQuestionMayRun({
          ownerPresent: true,
          regularThread: true,
          goalBound: false,
          preview: false,
          ownerSpeaksOfADeath: speaksOfADeath(line),
        }),
      ).toBe(false);
    },
  );

  it('an ordinary line still may', () => {
    expect(speaksOfADeath('მჭირდება იურისტი')).toBe(false);
  });
});
