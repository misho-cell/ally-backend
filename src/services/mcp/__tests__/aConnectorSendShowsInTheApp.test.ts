jest.mock('../../threads.service', () => ({
  __esModule: true,
  saveThreadMessage: jest.fn(),
  userLanguage: jest.fn(),
}));
jest.mock('../../taskAsks.service', () => ({ __esModule: true, sendApprovedAskAnswer: jest.fn() }));
jest.mock('../../whatsappMirror.service', () => ({
  __esModule: true,
  mirrorToWhatsapp: jest.fn(),
}));
jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../../db/postgres/client';
import { saveThreadMessage, userLanguage } from '../../threads.service';
import { sendApprovedAskAnswer } from '../../taskAsks.service';
import { mirrorToWhatsapp } from '../../whatsappMirror.service';
import { answerMemberQuestion } from '../answerMemberQuestion';
import { ConnectorAction, quotedForTrace, traceInApp, traceLine } from '../connectorTrace';

const mockSave = saveThreadMessage as jest.MockedFunction<typeof saveThreadMessage>;
const mockLanguage = userLanguage as jest.MockedFunction<typeof userLanguage>;
const mockSend = sendApprovedAskAnswer as jest.MockedFunction<typeof sendApprovedAskAnswer>;
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockMirror = mirrorToWhatsapp as jest.MockedFunction<typeof mirrorToWhatsapp>;

beforeEach(() => {
  jest.clearAllMocks();
  mockLanguage.mockResolvedValue('ka');
  mockSave.mockResolvedValue(undefined as never);
});

/**
 * #8911 (the founder, tester 82701): an answer, a decline and an ask went out
 * through ChatGPT and nothing showed in his app, so he redid them by hand.
 */
describe('#8911: a send through the connector leaves a line in the app', () => {
  it('writes the owner’s own answer into the question’s chat once it went', async () => {
    mockQuery.mockResolvedValue({ rows: [{ ask_thread_id: 55 }] } as never);
    mockSend.mockResolvedValue({ sent: true });

    await answerMemberQuestion('7', { ask_id: '9', answer: 'ვერ დაგეხმარები', confirmed: true });

    expect(mockSave).toHaveBeenCalledWith(
      55,
      7,
      'assistant',
      expect.stringContaining('«ვერ დაგეხმარები»'),
    );
  });

  it('writes nothing when nothing went', async () => {
    mockQuery.mockResolvedValue({ rows: [{ ask_thread_id: 55 }] } as never);
    mockSend.mockResolvedValue({ sent: false, error: 'held' });

    await answerMemberQuestion('7', { ask_id: '9', answer: 'კი', confirmed: true });

    expect(mockSave).not.toHaveBeenCalled();
  });

  it('names the person a goal’s question went to, in the owner’s language', () => {
    expect(traceLine(ConnectorAction.Asked, 'en', 'Do you know a plumber?', 'Nino')).toBe(
      'Through a connector (e.g. ChatGPT or Claude) you asked Nino about this goal: «Do you know a plumber?»',
    );
  });

  it('cuts a long text at a word', () => {
    const long = 'სიტყვა '.repeat(100);
    const quoted = quotedForTrace(long);
    expect(quoted.length).toBeLessThanOrEqual(401);
    expect(quoted.endsWith('სიტყვა…')).toBe(true);
  });

  it('never fails the send it records', async () => {
    mockSave.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(traceInApp('7', 55, ConnectorAction.Answered, 'კი')).resolves.toBeUndefined();
  });

  it('tells a goal with no chat in WhatsApp only', async () => {
    await traceInApp('7', null, ConnectorAction.Asked, 'q', 'Nino');
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockMirror).toHaveBeenCalledWith(7, expect.objectContaining({ title: '' }), false);
  });

  it('puts the same line in the owner’s WhatsApp, opening the chat it belongs to (82705)', async () => {
    await traceInApp('7', 55, ConnectorAction.Answered, 'კი');
    const line = mockSave.mock.calls[0][3];
    expect(mockMirror).toHaveBeenCalledWith(7, { title: '', body: line, url: '/chat/55' }, false);
  });

  it('says a question kept for later is kept', () => {
    expect(traceLine(ConnectorAction.AskHeld, 'en', 'Know a plumber?')).toContain(
      'is kept and will go later: «Know a plumber?»',
    );
  });

  it('says an introduction answer without any words of the owner’s', async () => {
    await traceInApp('7', null, ConnectorAction.IntroDeclined, '');
    expect(mockMirror.mock.calls[0][1].body).toBe(
      'კონექტორიდან (მაგ. ChatGPT ან Claude) გაცნობის თხოვნაზე უარი თქვი.',
    );
  });

  it('is wired into the connector’s ask and its introduction answer', () => {
    const handlers = readFileSync(join(__dirname, '..', 'handlers.ts'), 'utf8');
    expect(handlers).toContain("await traceInApp(userId, null, action, '');");
    expect(handlers).toMatch(
      /traceInApp\(userId, task\.thread_id, ConnectorAction\.Asked, question, outcome\.to_name\)/,
    );
  });
});
