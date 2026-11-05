jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { endsOnOwnQuestion, withClosingQuestion } from '../chat.service';

const AGREED = 'დავიწყო?';
const BODY = 'ლიკას ასისტენტს დაველაპარაკები, რომ ნინუცასთან დაგაკავშიროს.';
const OWN = 'ლიკას მივწერო, რომ ნინუცასთან დაგაკავშიროს?';

/** #8680 (Tornike, 4 Nov): no bare closing question — ask naming whom and what. */
describe('the plan asks in a sentence of its own (#8680)', () => {
  it('keeps the model’s own question and adds no bare one', () => {
    expect(withClosingQuestion(`${BODY}\n\n${OWN}`, 'ka')).toBe(`${BODY}\n\n${OWN}`);
  });

  it('drops a bare question that follows the model’s own', () => {
    expect(withClosingQuestion(`${BODY}\n\n${OWN}\n\n${AGREED}`, 'ka')).toBe(`${BODY}\n\n${OWN}`);
  });

  it('still ends on the agreed question when the model asked nothing of its own', () => {
    expect(withClosingQuestion(BODY, 'ka')).toBe(`${BODY}\n\n${AGREED}`);
  });

  it('takes any question of the model’s own as its ask — no verb list decides (#8779 c)', () => {
    expect(endsOnOwnQuestion('რომელ ქალაქში ხარ ახლა?', AGREED)).toBe(true);
    expect(endsOnOwnQuestion('Shall I write to Lika about Ninutsa?', 'Shall I start?')).toBe(true);
  });

  it('does not count the agreed question, a short one or a statement', () => {
    expect(endsOnOwnQuestion(AGREED, AGREED)).toBe(false);
    expect(endsOnOwnQuestion('გავუგზავნო?', AGREED)).toBe(false);
    expect(endsOnOwnQuestion(BODY, AGREED)).toBe(false);
  });

  it('no longer tells the model to end on the bare question word for word', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).not.toContain('end with this one, word for word');
    expect(chat).not.toContain('გეგმა ამ კითხვით დაასრულე');
  });
});
