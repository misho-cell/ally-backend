jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../threads.service', () => ({
  saveThreadMessage: jest.fn().mockResolvedValue(undefined),
  userLanguage: jest.fn().mockResolvedValue('ka'),
}));
jest.mock('../notification.service', () => ({
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query as _query } from '../../db/postgres/client';
import { saveThreadMessage as _save } from '../threads.service';
import { sendPushNotification as _push } from '../notification.service';
import { offerHelperThanks, settleThanksTap } from '../helperThanks.service';
import { againChoices, thankChoices, thanksTapOf, ThanksTap } from '../helperThanksCards';

/** 1692 part 1 (A9): „helped" → thank them? → one line to the helper; then a private „ask again?". */
const mockQuery = _query as jest.Mock;
const mockSave = _save as jest.Mock;
const mockPush = _push as jest.Mock;
const rows = (r: unknown[]): { rows: unknown[] } => ({ rows: r });
const WAITING = {
  id: 4,
  helper_user_id: 77,
  helper_thread_id: 900,
  helper_name: 'ზურაბი',
  asker_name: 'ნინო',
};

beforeEach(() => jest.clearAllMocks());

describe('the thank-you card', () => {
  it('reads only its own buttons, in every language', () => {
    expect(thanksTapOf(thankChoices('ka')[0])).toBe(ThanksTap.Thank);
    expect(thanksTapOf(thankChoices('en')[1])).toBe(ThanksTap.DoNotThank);
    expect(thanksTapOf(againChoices('ru')[0])).toBe(ThanksTap.AgainYes);
    expect(thanksTapOf(againChoices('es')[1])).toBe(ThanksTap.AgainNo);
    expect(thanksTapOf('კი')).toBeNull();
  });

  it('is offered once per answered ask, in the asker’s goal conversation', async () => {
    mockQuery
      .mockResolvedValueOnce(
        rows([{ task_id: 3, helper_user_id: 77, card_thread_id: 55, helper_name: 'ზურაბი' }]),
      )
      .mockResolvedValueOnce(rows([{ id: 4 }]));
    expect(await offerHelperThanks('42', 17000)).toBe(true);
    expect(mockSave).toHaveBeenCalledWith(
      55,
      42,
      'assistant',
      'ზურაბს მადლობა გადავუხადო შენი სახელით?',
      'message',
      null,
      thankChoices('ka'),
    );

    mockQuery
      .mockResolvedValueOnce(
        rows([{ task_id: 3, helper_user_id: 77, card_thread_id: 55, helper_name: 'ზურაბი' }]),
      )
      .mockResolvedValueOnce(rows([]));
    mockSave.mockClear();
    expect(await offerHelperThanks('42', 17000)).toBe(false);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('on yes, sends the helper one fixed line and rings once, then asks „again?"', async () => {
    mockQuery.mockResolvedValueOnce(rows([WAITING])).mockResolvedValue(rows([]));
    const reply = await settleThanksTap('42', 55, ThanksTap.Thank, 'ka');
    expect(mockSave).toHaveBeenCalledWith(
      900,
      77,
      'assistant',
      'ნინო გიხდის მადლობას დახმარებისთვის.',
    );
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(reply?.text).toContain('გადავეცი ზურაბს.');
    expect(reply?.choices).toEqual(againChoices('ka'));
    const update = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("SET state = 'decided'"),
    );
    expect(update?.[1]).toEqual([4, 'thanks_only', true]);
  });

  it('on no, sends nothing to the helper and still asks „again?"', async () => {
    mockQuery.mockResolvedValueOnce(rows([WAITING])).mockResolvedValue(rows([]));
    const reply = await settleThanksTap('42', 55, ThanksTap.DoNotThank, 'ka');
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(reply?.choices).toEqual(againChoices('ka'));
  });

  it('stores „would you ask again?" and says nothing more', async () => {
    mockQuery.mockResolvedValueOnce(rows([WAITING])).mockResolvedValue(rows([]));
    expect((await settleThanksTap('42', 55, ThanksTap.AgainNo, 'ka'))?.text).toBe('კარგი.');
    const update = mockQuery.mock.calls.find(([sql]) => String(sql).includes('ask_again = $2'));
    expect(update?.[1]).toEqual([4, false]);
  });

  it('is not the server’s when no card waits here', async () => {
    mockQuery.mockResolvedValue(rows([]));
    expect(await settleThanksTap('42', 55, ThanksTap.Thank, 'ka')).toBeNull();
  });

  it('is offered from a „helped" debrief and never fails it', () => {
    const debrief = readFileSync(join(__dirname, '..', 'debrief.service.ts'), 'utf8');
    expect(debrief).toContain('await offerHelperThanks(userId, refId).catch(');
  });
});
