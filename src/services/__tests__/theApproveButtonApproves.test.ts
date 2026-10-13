jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));
jest.mock('../taskStore.service', () => ({
  __esModule: true,
  ...jest.requireActual('../taskStore.service'),
  getOpenTaskByThread: jest.fn(),
}));
jest.mock('../taskPlans.service', () => ({
  __esModule: true,
  ...jest.requireActual('../taskPlans.service'),
  approveTaskPlan: jest.fn(),
}));
jest.mock('../taskEngine.service', () => ({
  __esModule: true,
  DAY_ONE_WINDOW_MS: 60 * 60 * 1000,
  startDayOne: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { getOpenTaskByThread } from '../taskStore.service';
import { approveTaskPlan } from '../taskPlans.service';
import { startDayOne } from '../taskEngine.service';
import {
  answerApproveTap,
  APPROVE_LINE_ON,
  APPROVED_STARTING_LINE,
  approvePlanOnTap,
  isApproveTap,
} from '../chat.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockGoal = getOpenTaskByThread as jest.MockedFunction<typeof getOpenTaskByThread>;
const mockApprove = approveTaskPlan as jest.MockedFunction<typeof approveTaskPlan>;
const mockDayOne = startDayOne as jest.MockedFunction<typeof startDayOne>;

const NOW = new Date().toISOString();
const EARLIER = new Date(Date.now() - 20_000).toISOString();

/** The thread as planConsentOnScreen reads it: the plan card, then the owner's tap. */
function screen(card: string[], ownerSaid: string): void {
  mockQuery.mockImplementation((sql: string) => {
    if (String(sql).includes("role = 'assistant'"))
      return Promise.resolve({
        rows: [{ created_at: EARLIER, choices: card }],
        rowCount: 1,
      } as never);
    return Promise.resolve({
      rows: [{ created_at: NOW, content: ownerSaid }],
      rowCount: 1,
    } as never);
  });
}

/**
 * Row 323, goal 11155: „I approve" tapped at 06:36:36, the model asked again,
 * and twelve calls were refused before the plan was approved. The button now
 * approves, under the same gate approve_task_plan uses.
 */
describe('the approve button approves the plan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGoal.mockResolvedValue({ id: 11155 } as never);
    mockApprove.mockResolvedValue({
      ok: true,
      value: { version: 2, summary: 'Plan v2', alreadyInForce: false },
    } as never);
  });

  it('recognises only the button texts, in every language', () => {
    for (const label of ['I approve', 'ვამტკიცებ', 'Подтверждаю', 'Lo apruebo', 'დამტკიცებულია'])
      expect(isApproveTap(label)).toBe(true);
    for (const typed of ['yes', 'კი', 'I approve, but ask Nino first', 'ok go'])
      expect(isApproveTap(typed)).toBe(false);
  });

  it("approves and starts day one on the seat's exact case", async () => {
    screen(['I approve', 'Change it'], 'I approve');
    const note = await approvePlanOnTap('172732', 26700, 'I approve', 'run-1');
    expect(mockApprove).toHaveBeenCalledWith('172732', 11155, 'chat', expect.any(String));
    expect(mockDayOne).toHaveBeenCalledWith(11155);
    expect(note).toMatch(/Do NOT call approve_task_plan, do NOT ask again/);
    expect(note).toMatch(/D119/);
  });

  it("does nothing for a typed yes — that stays the model's, under the gate", async () => {
    screen(['I approve', 'Change it'], 'yes');
    expect(await approvePlanOnTap('172732', 26700, 'yes', 'run-1')).toBeNull();
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it('does nothing when no plan card is on screen', async () => {
    screen(['Solved', 'Not yet'], 'I approve');
    expect(await approvePlanOnTap('172732', 26700, 'I approve', 'run-1')).toBeNull();
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it('does nothing without an open goal on the thread', async () => {
    mockGoal.mockResolvedValue(null);
    screen(['I approve', 'Change it'], 'I approve');
    expect(await approvePlanOnTap('172732', 26700, 'I approve', 'run-1')).toBeNull();
  });

  it('starts no second day one for a plan already in force', async () => {
    screen(['I approve', 'Change it'], 'I approve');
    mockApprove.mockResolvedValue({
      ok: true,
      value: { version: 2, summary: 'Plan v2', alreadyInForce: true },
    } as never);
    expect(await approvePlanOnTap('172732', 26700, 'I approve', 'run-1')).toBeNull();
    expect(mockDayOne).not.toHaveBeenCalled();
  });
});

/**
 * The tester's 964 (thread 29014): after the tap, this run said „I'll come back
 * when they answer" and day one said it again after the sends. The tap's line
 * only confirms the start.
 */
describe('the tap’s own line does not repeat day one’s', () => {
  const source = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const note = source.slice(source.indexOf('const APPROVED_BY_TAP_NOTE'));

  it('confirms the start and leaves the waiting line to day one', () => {
    expect(note.slice(0, 900)).toContain('you are starting now');
    expect(note.slice(0, 900)).toContain('Do NOT say you are waiting');
    expect(note.slice(0, 900)).not.toContain('will come back as soon as someone answers');
  });
});

/** 3070 (b), Misho's yes word for word (§140): the tap is answered without a model run. */
describe('the approve tap answers itself', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGoal.mockResolvedValue({ id: 11155 } as never);
    mockApprove.mockResolvedValue({
      ok: true,
      value: { version: 2, summary: 'Plan v2', alreadyInForce: false },
    } as never);
  });

  it('is on, with the four approved lines', () => {
    expect(APPROVE_LINE_ON).toBe(true);
    expect(APPROVED_STARTING_LINE).toEqual({
      ka: 'დამტკიცდა. ვიწყებ ახლავე.',
      en: "Approved. I'm starting now.",
      ru: 'Принято. Начинаю.',
      es: 'Aprobado. Empiezo ahora.',
    });
  });

  it('approves, starts day one and replies with the line in the conversation’s language', async () => {
    screen(['I approve', 'Change it'], 'I approve');
    const out = await answerApproveTap('172732', 26700, 'I approve', 'run-2', undefined);
    expect(mockDayOne).toHaveBeenCalledWith(11155);
    expect(out).not.toBeNull();
    expect(out?.reply).toBe(APPROVED_STARTING_LINE[out?.language ?? 'ka']);
    expect(out?.requestCreated).toBe(false);
  });

  it('leaves everything to the run for a typed yes, or when nothing was approved', async () => {
    screen(['I approve', 'Change it'], 'yes');
    expect(await answerApproveTap('172732', 26700, 'yes', 'run-3', undefined)).toBeNull();
    mockApprove.mockResolvedValue({
      ok: true,
      value: {
        version: 2,
        summary: 'Plan v2',
        alreadyInForce: true,
        approvedAt: '2026-01-01T00:00:00Z',
      },
    } as never);
    screen(['I approve', 'Change it'], 'I approve');
    expect(await answerApproveTap('172732', 26700, 'I approve', 'run-4', undefined)).toBeNull();
  });

  it('is tried before the prompt is built, so no model runs for the tap', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const early = chat.indexOf(
      'await answerApproveTap(userId, threadId, userMessage, runId, intent)',
    );
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(chat.indexOf('const systemPrompt = joinSystemPrompt('));
  });
});
