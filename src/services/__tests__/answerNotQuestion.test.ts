import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ANSWER_NOT_QUESTION_ON,
  answersAQuestionWithAQuestion,
  endsAsAQuestion,
} from '../answerNotQuestion';

/** 4423 (box 51382): „მუდმივი მოვლა გჭირდება, არა ერთჯერადი სამუშაო?" went out as the answer. */
const HELPER_ASKED = 'მუდმივი მოვლა გჭირდებათ თუ ერთჯერადი?';
const ASKED_BACK = 'მუდმივი მოვლა გჭირდება, არა ერთჯერადი სამუშაო?';
const STATED = 'მუდმივი მოვლა სჭირდება, ერთჯერადი სამუშაო არა.';

describe('endsAsAQuestion', () => {
  it('reads the question mark past closing quotes and emoji', () => {
    expect(endsAsAQuestion(ASKED_BACK)).toBe(true);
    expect(endsAsAQuestion('„ასე გინდა?“ 🙂')).toBe(true);
    expect(endsAsAQuestion(STATED)).toBe(false);
    expect(endsAsAQuestion('რა? არა, ხვალ.')).toBe(false);
  });
});

describe('answersAQuestionWithAQuestion', () => {
  const base = { assistantOnly: true, helperAnswer: HELPER_ASKED, reply: ASKED_BACK };

  it('stops a question sent back to a helper who asked one, with no person in between', () => {
    expect(answersAQuestionWithAQuestion(base, true)).toBe(true);
  });

  it('lets a statement through', () => {
    expect(answersAQuestionWithAQuestion({ ...base, reply: STATED }, true)).toBe(false);
  });

  it('leaves a question alone when the helper did not ask one, or a person wrote', () => {
    expect(answersAQuestionWithAQuestion({ ...base, helperAnswer: 'ვიცნობ ერთს.' }, true)).toBe(
      false,
    );
    expect(answersAQuestionWithAQuestion({ ...base, helperAnswer: null }, true)).toBe(false);
    expect(answersAQuestionWithAQuestion({ ...base, assistantOnly: false }, true)).toBe(false);
  });

  it('is OFF until Misho approves the note (NIGHT_QUESTIONS BL)', () => {
    expect(ANSWER_NOT_QUESTION_ON).toBe(false);
    expect(answersAQuestionWithAQuestion(base)).toBe(false);
  });

  it('is checked in createAsk on the answered ask, after the round cap', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    const cap = asks.indexOf("reason: 'owner_must_answer'");
    const gate = asks.indexOf("reason: 'answer_is_a_question'");
    expect(cap).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(cap);
    expect(asks).toContain(
      "helperAnswer: live.rows[0]?.status === 'answered' ? (live.rows[0]?.answer ?? null) : null,",
    );
  });
});
