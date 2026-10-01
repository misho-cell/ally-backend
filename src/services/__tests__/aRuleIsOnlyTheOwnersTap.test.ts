jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../answerRules.service', () => ({ __esModule: true, saveAnswerRule: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { saveAnswerRule } from '../answerRules.service';
import { isSimilarRuleTap, saveSimilarRuleOnTap, SIMILAR_RULE_LABEL } from '../similarAnswerRule';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSave = saveAnswerRule as jest.MockedFunction<typeof saveAnswerRule>;

const rows = (list: readonly unknown[]): never => ({ rows: list, rowCount: list.length }) as never;

/**
 * Row 302 / D527, the tester's 958: rule 232 was written on the send itself,
 * with no button and no yes. The send never writes a rule now; only the
 * owner's tap on the one optional button does.
 */
describe('a standing answer rule is only ever the owner’s tap', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads the button in any language, and nothing typed', () => {
    expect(isSimilarRuleTap(SIMILAR_RULE_LABEL.ka)).toBe(true);
    expect(isSimilarRuleTap(` ${SIMILAR_RULE_LABEL.en} `)).toBe(true);
    expect(isSimilarRuleTap('კი, მადლობა')).toBe(false);
  });

  it('saves the rule from the thread’s answered ask on the tap', async () => {
    mockQuery.mockImplementation(((sql: string) =>
      Promise.resolve(
        String(sql).includes('FROM task_asks')
          ? rows([{ question: 'იცნობ კარგ ნოტარიუსს?', answer: 'კი, ნინო ბერიძეს.' }])
          : rows([]),
      )) as never);
    mockSave.mockResolvedValue({ ok: true, value: {} } as never);

    const told = await saveSimilarRuleOnTap('171937', 28879, SIMILAR_RULE_LABEL.ka);

    expect(mockSave).toHaveBeenCalledWith(
      '171937',
      'იცნობ კარგ ნოტარიუსს?',
      'იცნობ კარგ ნოტარიუსს?',
      'კი, ნინო ბერიძეს.',
    );
    expect(told).toContain('წესი შეინახა');
  });

  it('saves nothing twice', async () => {
    mockQuery.mockImplementation(((sql: string) =>
      Promise.resolve(
        String(sql).includes('FROM task_asks')
          ? rows([{ question: 'q', answer: 'a' }])
          : rows([{ id: 232 }]),
      )) as never);
    expect(await saveSimilarRuleOnTap('171937', 28879, SIMILAR_RULE_LABEL.ka)).toContain('უკვე');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('does nothing for a typed message, without reading the database', async () => {
    expect(await saveSimilarRuleOnTap('171937', 28879, 'მადლობა')).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('the send writes no rule, whatever the call carries', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const tool = chat.slice(chat.indexOf("case 'send_answer_to_asker': {"));
    const body = tool.slice(0, tool.indexOf("case 'list_answer_rules':"));
    expect(body).toContain('await sendApprovedAskAnswer(userId, threadId, answerText);');
    expect(body).not.toContain('remember_for_similar');
    expect(chat).toContain('await saveSimilarRuleOnTap(userId, threadId, userMessage)');
  });
});
