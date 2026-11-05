jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { planReplyText, withClosingQuestion } from '../chat.service';
import { forgetServerTexts, loadServerTexts } from '../serverTextBlocks';

/**
 * #8680 (Tornike, 4 Nov, the tester's 82572): with the two plan blocks
 * switched off, the server still wrote „… ეს მოვაგვარო. დავიწყო?". A block the
 * team switched off adds no fixed text; an unwritten block keeps the code's.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const rows = (r: unknown[]): never => ({ rows: r, rowCount: r.length }) as never;

const OWN =
  'ნიკას ასისტენტს მივწერ და ვთხოვ, რომ ბანკში ვინმეს გაგაცნოს — მივწერო ნიკას ასისტენტს?';
const PLAN = {
  text: 'ნიკას ასისტენტს დაველაპარაკები და შევეცდები, ეს მოვაგვარო.',
  names: ['ნიკა'],
};

async function blocks(enabled: boolean | null): Promise<void> {
  forgetServerTexts();
  mockQuery.mockResolvedValue(rows(enabled === null ? [] : [{ content: 'x', enabled }]));
  await loadServerTexts();
}

beforeEach(() => mockQuery.mockReset());

describe('a plan whose blocks the team switched off', () => {
  it('ends on the assistant’s own sentence, with no „დავიწყო?" added', async () => {
    await blocks(false);
    expect(withClosingQuestion('ნიკას ასისტენტს მივწერ.', 'ka')).toBe('ნიკას ასისტენტს მივწერ.');
  });

  it('keeps the assistant’s sentence and adds none of the server’s', async () => {
    await blocks(false);
    expect(planReplyText(OWN, PLAN, 'ka')).toBe(OWN);
  });

  it('keeps the server’s sentence when the assistant’s names nobody the plan asks', async () => {
    await blocks(false);
    const text = planReplyText('ვეცდები დაგეხმარო.', PLAN, 'ka');
    expect(text).toContain(PLAN.text);
    expect(text).not.toContain('დავიწყო?');
  });
});

describe('a plan whose blocks are not written', () => {
  it('still ends on the code’s „დავიწყო?"', async () => {
    await blocks(null);
    expect(withClosingQuestion('ნიკას ასისტენტს დაველაპარაკები.', 'ka')).toContain('დავიწყო?');
  });

  it('English plans are untouched by the Georgian blocks', async () => {
    await blocks(false);
    expect(withClosingQuestion('I will talk to Nika’s assistant.', 'en')).toContain(
      'Shall I start?',
    );
  });
});
