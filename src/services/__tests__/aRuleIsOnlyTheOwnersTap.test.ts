jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../answerRules.service', () => ({ __esModule: true, saveAnswerRule: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { saveAnswerRule } from '../answerRules.service';
import {
  isSimilarRuleTap,
  saveSimilarRuleOnTap,
  SIMILAR_RULE_LABEL,
  withAnswerSentLine,
} from '../similarAnswerRule';

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

/** The tester's 962: the line after the send said only „თუ გსურს, შეგიძლია აირჩიო.". */
describe('the reply after the send says the answer went', () => {
  it('opens with the line when the reply does not say it', () => {
    expect(withAnswerSentLine('თუ გსურს, შეგიძლია აირჩიო.', 'ka')).toBe(
      'პასუხი გაიგზავნა. თუ გსურს, შეგიძლია აირჩიო.',
    );
    expect(withAnswerSentLine('', 'en')).toBe('Your answer was sent.');
  });

  it('adds nothing when the reply already says it went', () => {
    const said = 'პასუხი გავუგზავნე Netai Test 108-ს.';
    expect(withAnswerSentLine(said, 'ka')).toBe(said);
    expect(withAnswerSentLine('Sent it to Netai Test 108.', 'en')).toBe(
      'Sent it to Netai Test 108.',
    );
  });

  it('is applied to the final reply of a run whose answer went', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('if (sent.sent && runId) runAnswerSent.add(runId);');
    expect(chat).toContain(
      'if (runAnswerSent.has(runId)) effectiveFinal = withAnswerSentLine(effectiveFinal, language);',
    );
    const clear = chat.slice(chat.indexOf('function clearRunState'));
    expect(clear.slice(0, 1400)).toContain('runAnswerSent.delete(runId)');
  });
});
