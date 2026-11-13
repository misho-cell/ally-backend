jest.mock('../../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: jest.fn() } },
}));
jest.mock('../../costLedger.service', () => ({
  __esModule: true,
  recordClaudeUsage: jest.fn().mockResolvedValue(undefined),
}));

import { readFileSync } from 'fs';
import { join } from 'path';

import anthropic from '../../../config/anthropic';
import { wordAlternatives } from '../../farCircles.service';
import {
  forgetMeanings,
  MAX_MEANINGS_PER_WORD,
  MEANINGS_KEPT_MS,
  meaningsFromModel,
  searchMeanings,
} from '../searchMeanings';
import { buildMeaningWordGroups, NO_MEANINGS, withMeanings } from '../transliterate';

const mockCreate = anthropic.messages.create as unknown as jest.Mock;
const OWNER = '186272';

function replies(text: string): void {
  mockCreate.mockResolvedValue({ content: [{ type: 'text', text }], usage: {} });
}

/**
 * Misho, 13 Nov (meaning search, at every level): „გაყიდვები" never found
 * „sales", nor „freelance sales" a „business development" label. Each word
 * of a search is now searched with its other words of the same meaning.
 */
describe('a word’s meanings, read by the small model', () => {
  beforeEach(() => {
    forgetMeanings();
    mockCreate.mockReset();
  });

  it('are kept per word, in lower case, single words only, without the word itself', () => {
    const meanings = meaningsFromModel(
      '{"meanings": {"Sales": ["გაყიდვები", "продажи", "sales", "business development", ""]}}',
    );
    expect(meanings.get('sales')).toEqual(['გაყიდვები', 'продажи']);
  });

  it('are capped per word', () => {
    const many = JSON.stringify({ meanings: { sales: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'] } });
    expect(meaningsFromModel(many).get('sales')).toHaveLength(MAX_MEANINGS_PER_WORD);
  });

  it('are none when the reply is not JSON of that shape', () => {
    expect(meaningsFromModel('no')).toBe(NO_MEANINGS);
    expect(meaningsFromModel('{"meanings": ["sales"]}')).toBe(NO_MEANINGS);
  });

  it('are asked once per search and then remembered', async () => {
    replies('{"meanings": {"sales": ["გაყიდვები"]}}');

    await searchMeanings(OWNER, 'Sales', undefined, 1000);
    const again = await searchMeanings(OWNER, 'sales ', undefined, 2000);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(again.get('sales')).toEqual(['გაყიდვები']);
  });

  it('are asked again after a day', async () => {
    replies('{"meanings": {"sales": ["გაყიდვები"]}}');

    await searchMeanings(OWNER, 'sales', undefined, 0);
    await searchMeanings(OWNER, 'sales', undefined, MEANINGS_KEPT_MS + 1);

    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('are none, and not remembered, when the model fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('overloaded'));
    expect(await searchMeanings(OWNER, 'sales', undefined, 0)).toBe(NO_MEANINGS);

    replies('{"meanings": {"sales": ["გაყიდვები"]}}');
    expect((await searchMeanings(OWNER, 'sales', undefined, 1)).get('sales')).toEqual([
      'გაყიდვები',
    ]);
  });

  it('are never asked for an empty search', async () => {
    expect(await searchMeanings(OWNER, '  ')).toBe(NO_MEANINGS);
    expect(await searchMeanings(OWNER, undefined)).toBe(NO_MEANINGS);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('the own and second circles', () => {
  it('search each word or any of its meanings, as one group per word', () => {
    const meanings = new Map([['sales', ['გაყიდვები', 'продажи']]]);
    const [group] = buildMeaningWordGroups('sales', meanings);
    expect(group[0]).toBe('sales');
    expect(group).toEqual(expect.arrayContaining(['გაყიდვ', 'продажи']));
    expect(buildMeaningWordGroups('freelance sales', meanings)).toHaveLength(2);
  });

  it('keep each meaning’s first spelling ahead of the word’s other spellings, so a cap keeps it', () => {
    expect(withMeanings(['sales', 'სალეს'], [['გაყიდვ', 'gaqidv'], ['продажи']])).toEqual([
      'sales',
      'გაყიდვ',
      'продажи',
      'სალეს',
      'gaqidv',
    ]);
  });

  it('search the words as typed when there are no meanings', () => {
    expect(buildMeaningWordGroups('sales')).toEqual(buildMeaningWordGroups('sales', NO_MEANINGS));
  });
});

describe('the far circles and the needs search', () => {
  it('match each word or any of its meanings, every word of the search', () => {
    const meanings = new Map([['investor', ['ინვესტორი', 'инвестор']]]);
    const [pattern] = wordAlternatives('investor', meanings);
    // „ინვესტორი" is „investor" in the database's own form: compared once.
    expect(pattern.split('|')).toEqual(['investor', 'инвестор']);
    expect(wordAlternatives('investor app', meanings)).toHaveLength(2);
  });

  it('never let a meaning carry a regular-expression character', () => {
    const [pattern] = wordAlternatives('sales', new Map([['sales', ['c++']]]));
    expect(pattern).not.toMatch(/(^|[^\\])\+/u);
  });
});

describe('meaning search in the chat', () => {
  const chat = readFileSync(join(__dirname, '..', '..', 'chat.service.ts'), 'utf8');

  it('runs in the chat for the needs search only; every circle gets it in the full research', () => {
    // Two answers (13 Nov): measured on live, the meanings took the quick searches past their timeouts.
    expect(chat).toContain("await searchMeanings(userId, input['need'], runId),");
    const tag = chat.slice(chat.indexOf("case 'search_by_tag': {"));
    expect(tag.slice(0, tag.indexOf("case 'search_by_insight'"))).not.toContain('searchMeanings');
    const second = chat.slice(chat.indexOf("case 'search_second_degree': {"));
    expect(second.slice(0, second.indexOf("case 'search_contacts_by_country'"))).not.toContain(
      'searchMeanings',
    );
  });

  it('never runs for a name search', () => {
    const at = chat.indexOf("case 'search_contact_by_name'");
    const nameCase = chat.slice(at, chat.indexOf("case 'search_by_tag'", at));
    expect(nameCase).not.toContain('searchMeanings');
  });
});
