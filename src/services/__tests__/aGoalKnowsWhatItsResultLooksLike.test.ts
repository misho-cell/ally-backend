jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  __esModule: true,
  default: { end: jest.fn() },
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { resultLineSection } from '../chat.service';
import { createTask, solvedLineFromOwnerWords } from '../taskStore.service';

/**
 * #7822 (Misho's yes, 28 Oct, after the tester's audit 77586): the goal's result
 * is the plan's solved_when, and the plan's routes are its checkpoints. Until a
 * plan exists, every goal carries the owner's own words as its result line.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => jest.clearAllMocks());

describe('the result line before a plan (#7822)', () => {
  it('is the owner’s words: the description when there is one, else the title', () => {
    expect(solvedLineFromOwnerWords('ნოტარიუსი', 'ნოტარიუსი ქუთაისში ხვალისთვის')).toBe(
      'ნოტარიუსი ქუთაისში ხვალისთვის',
    );
    expect(solvedLineFromOwnerWords('გიორგი ხატიაშვილის გაცნობა', null)).toBe(
      'გიორგი ხატიაშვილის გაცნობა',
    );
  });

  it('is written with every goal, whichever path opens it', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 41 }], rowCount: 1 } as never);
    await createTask('7', 'ნოტარიუსი', null, 'solve');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('result_shape');
    expect(params).toContain('ნოტარიუსი');
  });

  it('is shown to the run only while there is no plan', () => {
    expect(resultLineSection({ result_shape: 'ნოტარიუსი' }, false)).toContain('ნოტარიუსი');
    expect(resultLineSection({ result_shape: 'ნოტარიუსი' }, true)).toBe('');
    expect(resultLineSection({}, false)).toBe('');
  });
});

describe('set_task_brief is working memory again (#7822)', () => {
  it('takes no result fields and points the result at the plan', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const start = chat.indexOf("name: 'set_task_brief'");
    const tool = chat.slice(start, chat.indexOf('required:', start));
    expect(tool).not.toContain('result_kind');
    expect(tool).not.toContain('checkpoints:');
    expect(tool).toContain('solved_when (propose_task_plan)');
  });
});

describe('the tool texts agree with the rules (Misho’s yes, 28 Oct; tester audit A1, A3, A7)', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const toolText = (name: string): string => {
    const start = chat.indexOf(`name: '${name}'`);
    return chat.slice(start, chat.indexOf('input_schema', start));
  };

  it('finish_task asks in words, with no buttons and no repeated card', () => {
    expect(toolText('finish_task')).not.toContain('buttons: „');
    expect(toolText('finish_task')).not.toContain('show the owner what was achieved');
    expect(toolText('finish_task')).toContain('there are');
  });

  it('find_warm_path sends the first bridge an introduction, not a question', () => {
    expect(toolText('find_warm_path')).toContain('goes through request_introduction');
    expect(toolText('find_warm_path')).not.toContain('write to them with ask_contact');
  });
});
