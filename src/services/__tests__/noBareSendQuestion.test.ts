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

  it('does not take a question back to the owner for the plan’s question', () => {
    expect(endsOnOwnQuestion('რომელ ქალაქში ხარ?', AGREED)).toBe(false);
    expect(endsOnOwnQuestion('Shall I write to Lika about Ninutsa?', 'Shall I start?')).toBe(true);
  });

  it('no longer tells the model to end on the bare question word for word', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).not.toContain('end with this one, word for word');
    expect(chat).not.toContain('გეგმა ამ კითხვით დაასრულე');
  });
});
