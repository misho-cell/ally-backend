import { contactQuestionSection } from '../dailyContactQuestion';

/** 3500 (the tester's 47072): the day's question asked „💙 სად მუშაობს?". */
const update = (who: string): Parameters<typeof contactQuestionSection>[0] =>
  ({ kind: 'curiosity', task_id: null, payload: { who, missing_fact: 'employer' } }) as never;

describe('the day’s question asks about a person by name', () => {
  it('never about a label with no letter in it', () => {
    expect(contactQuestionSection(update('💙'))).toBe('');
    expect(contactQuestionSection(update('★ 7'))).toBe('');
  });

  it('still about a named contact', () => {
    expect(contactQuestionSection(update('ნინო ტესტური'))).toContain('ნინო ტესტური');
  });
});
