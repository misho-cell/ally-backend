jest.mock('../relayChain', () => ({
  __esModule: true,
  MAX_RELAYS_IN_A_CHAIN: 4,
  relaysBefore: jest.fn().mockResolvedValue(2),
}));
jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../taskAsks.service', () => ({
  createRelayAsk: jest.fn(),
  sendApprovedAskAnswer: jest.fn(),
}));
jest.mock('../threads.service', () => ({
  saveThreadMessage: jest.fn(),
  userLanguage: jest.fn().mockResolvedValue('en'),
}));
jest.mock('../instructedAsk', () => ({
  oneContactNamed: jest.fn(),
  ownersLabel: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { offerReferral, ReferralTap } from '../askReferral.service';
import { settleReferralTap } from '../askReferralSettle.service';
import {
  ASKER_AS_THE_READER_SAVED_THEM,
  QUESTION_IS_FOR_AS_THE_READER_KNOWS_THEM,
} from '../savedNameSql';

const mockQuery = query as jest.Mock;

/**
 * 5347, the tester's 63861: at the third and fourth links the pass-on card read
 * „ask X for <the link before>", and the owner's answer card named a link the
 * owner never saved by the seat's account name.
 */
describe('a question passed on down a chain', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('is for the goal’s owner, however far it travelled', () => {
    const [firstHand, relayed] = QUESTION_IS_FOR_AS_THE_READER_KNOWS_THEM.split('ELSE COALESCE');
    expect(firstHand).toContain('ta.parent_ask_id IS NULL');
    expect(firstHand).toContain(ASKER_AS_THE_READER_SAVED_THEM);
    expect(relayed).toContain('FROM tasks go_t WHERE go_t.id = ta.task_id');
    expect(relayed).toContain('"contactId" = ta.from_user_id');
  });

  it('names the owner on the pass-on card', async () => {
    await offerReferral('8', 40, 'not me, but ask Eka Beridze', 'en');
    expect(String(mockQuery.mock.calls[0][0])).toContain(QUESTION_IS_FOR_AS_THE_READER_KNOWS_THEM);
  });

  it('names the owner in the question the next link reads', async () => {
    await settleReferralTap('8', 40, ReferralTap.Named, 'en');
    expect(String(mockQuery.mock.calls[0][0])).toContain(QUESTION_IS_FOR_AS_THE_READER_KNOWS_THEM);
  });

  it('shows the owner a link they never saved under the label the link before saved', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toMatch(
      /savedLabelSql\('t\.user_id::int', 'p\.to_user_id'\)\},\s+\$\{savedLabelSql\('p\.from_user_id', 'p\.to_user_id'\)\}/,
    );
  });
});
