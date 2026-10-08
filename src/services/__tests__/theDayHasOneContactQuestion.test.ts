jest.mock('../curiosityQueue.service', () => ({ maybeCuriosityUpdate: jest.fn() }));

import { CuriosityUpdate } from '../curiosityQueue.service';
import {
  contactQuestionMayRun,
  contactQuestionSection,
  pendingAnswerSection,
} from '../dailyContactQuestion';

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
    expect(section).toContain('ნინო — სად მუშაობს?');
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
    expect(chat).toContain('const contactQuestion = await dailyContactQuestionSection(userId, {');
    expect(chat).toContain('ownerPresent: !ownerAbsent,');
    expect(chat).toMatch(/firstAsk \+\s+contactQuestion \+/u);
  });
});

describe('the answer that comes a line later (2674)', () => {
  it('reminds the run which contact and which fact wait, never the owner’s profile', () => {
    const section = pendingAnswerSection({ label: 'ნინო', missing_fact: 'city' });
    expect(section).toContain('ნინო — რომელ ქალაქშია?');
    expect(section).toContain('field_type: city');
    expect(section).toContain('update_user_profile არა');
  });

  it('says nothing without a question or a name', () => {
    expect(pendingAnswerSection(null)).toBe('');
    expect(pendingAnswerSection({ label: null, missing_fact: 'city' })).toBe('');
  });
});
