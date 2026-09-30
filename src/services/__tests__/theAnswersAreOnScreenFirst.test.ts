jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../threads.service', () => ({
  __esModule: true,
  saveServerLine: jest.fn(),
  threadLanguage: jest.fn(),
}));
jest.mock('../sse.service', () => ({ __esModule: true, emitMessageAppended: jest.fn() }));
jest.mock('../askTranslation.service', () => ({ __esModule: true, relayedForReader: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { saveServerLine, threadLanguage } from '../threads.service';
import { emitMessageAppended } from '../sse.service';
import { relayedForReader } from '../askTranslation.service';
import { buildAnswerCard, CardAnswer, showAnswersToOwner } from '../answerCard.service';
import { buildShownAnswersWakeEvent, buildShownRelayAnswerWakeEvent } from '../taskAsks.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSave = saveServerLine as jest.MockedFunction<typeof saveServerLine>;
const mockLanguage = threadLanguage as jest.MockedFunction<typeof threadLanguage>;
const mockEmit = emitMessageAppended as jest.MockedFunction<typeof emitMessageAppended>;
const mockRelay = relayedForReader as jest.MockedFunction<typeof relayedForReader>;

const TARGET = { threadId: 26700, ownerId: 171937 };
const OWN_WORDS: CardAnswer = {
  askId: 5481,
  answer: 'კი, ვიცნობ ერთს: ბახვა გამოგონილი.',
  fromName: 'Netai Test 50',
  verbatim: true,
};
const REWORDED: CardAnswer = {
  askId: 5482,
  answer: 'ნინო იცნობს ბუღალტერს',
  fromName: 'Netai Test 54',
  verbatim: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLanguage.mockResolvedValue('ka');
  mockRelay.mockImplementation(async (text) => ({ text, skipped: 'same_language' }));
  mockSave.mockImplementation(async (_t, _u, content) => ({ id: 90001, content }));
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
});

/**
 * ROW 322(a) — the owner waited a whole model turn (59 s on goal 11155) for
 * words somebody had already sent. The server now shows them first.
 */
describe('the card', () => {
  it('puts a person’s own words in quotes and a reworded answer without', async () => {
    const card = await buildAnswerCard([OWN_WORDS, REWORDED], 'ka');
    expect(card).toContain('მოვიდა პასუხები:');
    expect(card).toContain(`Netai Test 50: „${OWN_WORDS.answer}"`);
    expect(card).toContain(`Netai Test 54: ${REWORDED.answer}`);
    expect(card).not.toContain(`„${REWORDED.answer}"`);
  });

  it('never quotes a translation, and keeps their original beside it', async () => {
    mockRelay.mockResolvedValue({ text: 'Yes, I know one.', original: OWN_WORDS.answer });
    const card = await buildAnswerCard([OWN_WORDS], 'en');
    expect(card).toContain('An answer came in:');
    expect(card).toContain('Netai Test 50: Yes, I know one.');
    expect(card).toContain(`(„${OWN_WORDS.answer}")`);
    expect(card).not.toContain('„Yes, I know one."');
  });

  /** A relayed answer (D254) names the bridge on the card, without inflecting either name. */
  it('names the bridge when the answer came through one', async () => {
    const card = await buildAnswerCard([{ ...OWN_WORDS, viaName: 'Levan' }], 'ka');
    expect(card).toContain(`Netai Test 50 (შუამავალი: Levan): „${OWN_WORDS.answer}"`);
    const english = await buildAnswerCard([{ ...REWORDED, viaName: 'Levan' }], 'en');
    expect(english).toContain('Netai Test 54 (via Levan):');
  });

  it('names an unnamed answerer in the owner’s language', async () => {
    const card = await buildAnswerCard([{ ...REWORDED, fromName: null }], 'en');
    expect(card).toContain('Someone you asked:');
  });
});

describe('showing it', () => {
  it('writes it, pushes it live under the stored row’s id, and marks the answers shown', async () => {
    const shown = await showAnswersToOwner(TARGET, [OWN_WORDS, REWORDED]);

    expect(shown).toBe(true);
    expect(mockSave).toHaveBeenCalledWith(TARGET.threadId, TARGET.ownerId, expect.any(String));
    expect(mockEmit).toHaveBeenCalledWith(
      String(TARGET.ownerId),
      TARGET.threadId,
      expect.any(String),
      expect.objectContaining({ messageId: '90001', kind: 'answers' }),
    );
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('answer_shown_at = COALESCE(answer_shown_at, NOW())');
    expect(params).toEqual([[5481, 5482]]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('writes nothing when every owed answer was shown already', async () => {
    expect(await showAnswersToOwner(TARGET, [])).toBe(true);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('falls back to the old delivery when the card could not be written', async () => {
    mockSave.mockRejectedValue(new Error('timeout'));
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await showAnswersToOwner(TARGET, [OWN_WORDS])).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('counts a written card as shown even when the mark fails', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await showAnswersToOwner(TARGET, [OWN_WORDS])).toBe(true);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('the reply that follows the card', () => {
  const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');

  it('is told the answers are on screen and must not be read out again', () => {
    const event = buildShownAnswersWakeEvent([
      { answer: OWN_WORDS.answer, fromName: 'Netai Test 50', verbatim: true },
    ]);
    expect(event).toContain(OWN_WORDS.answer);
    expect(event).toContain('უკვე აჩვენა');
    expect(event).toContain('არ ჩამოთვალო');
    expect(event).toContain('ერთი წინადადებით');
    expect(event).toContain('ჯერ არ უპასუხია, თუ მისი პასუხი ბარათზეა');
  });

  /** 903: the older rule's „tell exactly who agreed and with whom" is a retelling under a card. */
  it('does not carry the rule that asks for who agreed with whom', () => {
    const event = buildShownAnswersWakeEvent([
      { answer: 'კი, ვიცნობ, ნინო ბერიძე.', fromName: 'Netai Test 64', verbatim: true },
    ]);
    expect(event).not.toContain('მფლობელს ზუსტად ეს უთხარი');
    expect(event).toContain('ბარათზე უკვე წერია, ნუ გაიმეორებ');
    expect(event).toContain('request_introduction');
  });

  it('tells a relayed answer’s run the card is there, and keeps the bridge in the event', () => {
    const event = buildShownRelayAnswerWakeEvent('Nino', 'Levan');
    expect(event).toContain('უკვე აჩვენა');
    expect(event).toContain('პასუხის სიტყვები არ გაიმეორო');
    expect(event).toContain('მეშვეობით');
  });

  it('shows a relayed answer before its run, and drops the quote guarantee then', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    const relayWake = asks.slice(asks.indexOf('await showRelayedAnswer(captured'));
    expect(relayWake.slice(0, 400)).toContain('buildShownRelayAnswerWakeEvent(captured.fromName');
  });

  /** A quote guarantee under the card would print the answer a second time. */
  it('carries no quote guarantee when the card is on screen', () => {
    const deliver = engine.slice(engine.indexOf('async function deliverOwedAnswers'));
    expect(deliver.slice(0, 1200)).toContain(
      'await wakeTask(taskId, buildShownAnswersWakeEvent(arrived))',
    );
  });

  it('shows only the answers no earlier attempt has shown', () => {
    const onScreen = engine.slice(engine.indexOf('async function answersAreOnScreen'));
    expect(onScreen.slice(0, 900)).toContain('ask.shown !== true');
  });
});
