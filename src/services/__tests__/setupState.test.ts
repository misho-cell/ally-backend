jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../connectorState.service', () => ({
  __esModule: true,
  connectorState: jest.fn(() => Promise.resolve({ connected: true, last_seen_at: null })),
}));
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn(() => Promise.resolve()),
}));
jest.mock('../threads.service', () => ({
  __esModule: true,
  userLanguage: jest.fn(() => Promise.resolve('ka')),
}));

import { query } from '../../db/postgres/client';
import {
  doneCount,
  Gadget,
  isDeviceId,
  recordStep,
  setupFunnel,
  setupState,
  SetupStep,
  StepStatus,
} from '../setupState.service';
import {
  sendTestPush,
  TEST_PUSH_ON,
  TestPushOutcome,
  testPushText,
} from '../setupTestPush.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => mockQuery.mockReset());

const NONE = {
  [SetupStep.Install]: false,
  [SetupStep.Notifications]: false,
  [SetupStep.Contacts]: false,
  [SetupStep.Freshness]: false,
  [SetupStep.Connector]: false,
};

/** 1882 / the frontend's 06:30Z item 10: the setup list per person and gadget. */
describe('the setup list', () => {
  it('counts a step done when the server sees it or any gadget said Done', () => {
    const devices = [
      {
        device_id: 'a',
        gadget: Gadget.Iphone,
        steps: { install: StepStatus.Done },
        updated_at: '',
      },
      { device_id: 'b', gadget: Gadget.Mac, steps: { install: StepStatus.Failed }, updated_at: '' },
    ];
    expect(doneCount({ ...NONE, [SetupStep.Contacts]: true }, devices)).toBe(2);
    expect(doneCount(NONE, [])).toBe(0);
  });

  it('reads the server’s own ticks and groups each gadget’s steps', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ contacts: true, freshness: false, notifications: true }],
      } as never)
      .mockResolvedValueOnce({
        rows: [
          { device_id: 'ph1', gadget: 'iphone', step: 'install', status: 'done', updated_at: 't2' },
          {
            device_id: 'ph1',
            gadget: 'iphone',
            step: 'freshness',
            status: 'later',
            updated_at: 't1',
          },
        ],
      } as never);

    const state = await setupState(171);

    expect(state.server).toEqual({
      install: false,
      notifications: true,
      contacts: true,
      freshness: false,
      connector: true,
    });
    expect(state.devices).toEqual([
      {
        device_id: 'ph1',
        gadget: 'iphone',
        steps: { install: 'done', freshness: 'later' },
        updated_at: 't2',
      },
    ]);
    expect(state.done_count).toBe(4);
    expect(state.total).toBe(5);
  });

  it('writes one row per person, gadget and step, as bound parameters', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    await recordStep(171, 'ph1', Gadget.Android, SetupStep.Contacts, StepStatus.Failed);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ON CONFLICT (user_id, device_id, step)');
    expect(params).toEqual([171, 'ph1', 'android', 'contacts', 'failed']);
  });

  it('takes only short plain device ids', () => {
    expect(isDeviceId('a1_B-2')).toBe(true);
    expect(isDeviceId('')).toBe(false);
    expect(isDeviceId('x'.repeat(65))).toBe(false);
    expect(isDeviceId("1'; DROP")).toBe(false);
  });

  it('counts people per gadget and step for the admin funnel', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    await setupFunnel();
    expect(String(mockQuery.mock.calls[0][0])).toContain('GROUP BY gadget, step');
  });
});

describe('the test notification', () => {
  it('is on, on Misho’s yes to its text (BI, §126); no subscription sends nothing', async () => {
    expect(TEST_PUSH_ON).toBe(true);
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await expect(sendTestPush(171)).resolves.toBe(TestPushOutcome.NoSubscription);
  });

  it('sends once to a person with a subscription', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ one: 1 }] } as never);
    await expect(sendTestPush(171)).resolves.toBe(TestPushOutcome.Sent);
  });

  it('has its line in every language', () => {
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      expect(testPushText(language).length).toBeGreaterThan(0);
    }
  });
});
