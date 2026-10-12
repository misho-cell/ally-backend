jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query as _query } from '../../db/postgres/client';
import {
  isNoteworthyFact,
  NEED_RECALL_ON,
  needThisFactMeets,
  noteSavedFact,
  recallChoices,
  recallLine,
  takeSavedFact,
} from '../needRecall';

/** 2608 (ME-027): a new fact about Nika meets Gia's saved need — the reply recalls it and offers. */
const mockQuery = _query as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('a saved need is recalled when a new fact meets it (2608)', () => {
  it('the tester’s case: Nika has a warehouse to rent, Gia needs one', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ phone: '+995555000001', value: 'საწყობი სჭირდება', name: 'გია საცდელი' }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ alias: 'ნიკა საცდელი' }] });
    const recalled = await needThisFactMeets('7', '+995555000002', 'საწყობი აქვს გასაქირავებლად');
    expect(recalled).toEqual({
      needName: 'გია საცდელი',
      need: 'საწყობი სჭირდება',
      helperName: 'ნიკა საცდელი',
    });
    expect(recallLine('ka', recalled!)).toBe(
      'გახსოვს, გია საცდელს სჭირდება: „საწყობი სჭირდება“. ნიკა საცდელი შეიძლება დაეხმაროს — დავაკავშირო ისინი?',
    );
    expect(recallChoices('ka')).toEqual(['კი, დააკავშირე', 'არა, ჯერ არა']);
  });

  it('a fact of another field recalls nothing', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ phone: '+995555000001', value: 'საწყობი სჭირდება', name: 'გია' }],
    });
    await expect(needThisFactMeets('7', '+995555000002', 'ექიმია')).resolves.toBeNull();
  });

  it('only facts that are not needs, and not empty, can meet a need', () => {
    expect(isNoteworthyFact('need', 'warehouse')).toBe(false);
    expect(isNoteworthyFact('note', '  ')).toBe(false);
    expect(isNoteworthyFact('note', 'has a warehouse')).toBe(true);
  });

  it('is off until Misho’s yes on the text: nothing is noted, so nothing is read or added', () => {
    expect(NEED_RECALL_ON).toBe(false);
    noteSavedFact('r1', '+1', 'note', 'has a warehouse');
    expect(takeSavedFact('r1')).toBeNull();
  });

  it('the run offers it only when its reply has no buttons of its own; nothing is sent', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'if (!ownerAbsent && savedFact !== null && (choices === undefined || choices.length === 0)) {',
    );
    expect(chat).toContain('choices = recallChoices(runLang(runId));');
  });

  it('declines the name in Georgian and closes the quote the Georgian way', () => {
    const line = recallLine('ka', { needName: 'გია საცდელი', need: 'საწყობი', helperName: 'ნიკა' });
    expect(line).toContain('გახსოვს, გია საცდელს სჭირდება: „საწყობი“.');
    expect(line).not.toContain('-ს ');
  });
});
