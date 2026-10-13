jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query as _query } from '../../db/postgres/client';
import {
  isNoteworthyFact,
  NEED_RECALL_KIND,
  NEED_RECALL_ON,
  recallCard,
  recallGoesApart,
  needThisFactMeets,
  noteSavedFact,
  recallChoices,
  recallLine,
  takeSavedFact,
} from '../needRecall';
import { renderPendingMessage } from '../pendingMessages';

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

  it('is ON since Misho’s yes on the exact text (12 Oct)', () => {
    expect(NEED_RECALL_ON).toBe(true);
    noteSavedFact('r1', '+1', 'note', 'has a warehouse');
    expect(takeSavedFact('r1')).toEqual({ phone: '+1', value: 'has a warehouse' });
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

/**
 * T4890 (the founder, 13 Oct, thread 51037): the reply asked its own question and
 * the recall was put under it with two buttons — two questions, and the buttons
 * answered the recall. Such a recall goes out as its own message.
 */
describe('a recall next to a reply that asks its own question', () => {
  const RECALLED = { needName: 'გია საცდელი', need: 'საწყობი', helperName: 'ნიკა საცდელი' };
  const ASKS =
    'ნიკას კომპანია ალმათიშია.\n\nჰკითხე: ალმათიში ვის მირჩევ იმ საკითხისთვის, რაც შენ გჭირდება?';

  it('goes apart when the reply asks something and does not speak of the person in need', () => {
    expect(recallGoesApart(ASKS, RECALLED)).toBe(true);
  });

  it('stays in the reply when the reply asks nothing, or already names the person in need', () => {
    expect(recallGoesApart('ნიკას საწყობი აქვს გასაქირავებლად.', RECALLED)).toBe(false);
    expect(recallGoesApart('ეს გია საცდელის საჭიროებას ემთხვევა. გინდა, გაგაცნო?', RECALLED)).toBe(
      false,
    );
  });

  it('is its own card: the same line and the same two buttons', () => {
    const card = recallCard(RECALLED, 'ka');
    expect(card.text).toBe(recallLine('ka', RECALLED));
    expect(card.choices).toEqual(recallChoices('ka'));
    const rendered = renderPendingMessage(
      { kind: NEED_RECALL_KIND, task_id: null, payload: { ...card } },
      'ka',
    );
    expect(rendered?.text).toBe(card.text);
    expect(rendered?.choices).toEqual(card.choices);
  });

  it('is wired so the reply keeps its own question and buttons', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('recalled !== null && recallGoesApart(finalText, recalled)');
    expect(chat).toContain('new Set([FACT_CONFIRM_KIND, NEED_RECALL_KIND])');
  });
});
