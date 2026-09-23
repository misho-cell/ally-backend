jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../../taskStore.service', () => ({
  __esModule: true,
  createTask: jest.fn(),
  findOpenTaskNamedIn: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { createTask, findOpenTaskNamedIn } from '../../taskStore.service';
import { goalNamedIn } from '../../goalMention';
import { mcpCreateTask } from '../handlers';

const named = findOpenTaskNamedIn as jest.MockedFunction<typeof findOpenTaskNamedIn>;
const made = createTask as jest.MockedFunction<typeof createTask>;

/**
 * ROW 242 — ASKING FOR THE SAME THING TWICE OPENED A SECOND GOAL, AND NEITHER
 * OF THEM POINTED AT THE OTHER.
 *
 * The seat reproduced it in forty-three seconds on Test 2: the same sentence
 * typed into two fresh chats, two goals, 9439 and 9472.
 *
 * MEASURED OVER THE WHOLE HISTORY before building — pairs of goals one owner
 * opened under the identical title, real people separated from fictional seats
 * by the `test_seats` list rather than by an id range:
 *
 *     real accounts     5 pairs BOTH STILL OPEN, on 3 people
 *     fictional seats  67 pairs both open, on 6 seats
 *
 * and the oldest real pair is five days apart, which is the case that matters:
 * not a double-tap, but the same need stated again next week by somebody who
 * cannot see that the first one is still running.
 */
beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-for-refs';
});
beforeEach(() => {
  jest.clearAllMocks();
  named.mockResolvedValue(null);
  made.mockResolvedValue({ id: 9472 });
});

function goal(title: string, id = 9439): never {
  return { id, title, status: 'open' } as never;
}

/**
 * THE MATCHER IS THE ONE THAT ALREADY EXISTED, AND THE REASON IS THIS BOARD.
 *
 * Every meaningful word of the existing title must appear in the new request.
 * Read against account 160584's real open goals, that strictness is the whole
 * safety margin: four photographer goals and two DJ goals that any „same
 * subject" judgement would have merged are six different requests, and the
 * word that distinguishes them is the city.
 */
describe('what counts as the same request, on the real board', () => {
  it('the seat’s own pair: the identical sentence names the goal it opened', () => {
    const match = goalNamedIn('I need a good carpenter for kitchen shelves. Ask my contacts.', [
      goal('I need a good carpenter for kitchen shelves'),
    ]);

    expect(match?.id).toBe(9439);
  });

  it.each([
    ['მჭირდება კარგი ფოტოგრაფი თბილისში', 'ქუთაისში ფოტოგრაფი მჭირდება'],
    ['კახეთში დიჯეის პოვნა', 'თბილისში კარგი დიჯეის პოვნა'],
    ['ქორწილის ფოტოგრაფი მჭირდება ბათუმში', 'პროფესიონალი ფოტოგრაფის პოვნა'],
  ])('a different city is a different request: %s is not %s', (asked, open) => {
    expect(goalNamedIn(asked, [goal(open)])).toBeNull();
  });

  /**
   * AND TWO CANDIDATES NAME NOTHING. That is the matcher's own old rule and it
   * is what kept the duplicate alive: by the time this ran, the second goal
   * existed, both matched, and an ambiguity answers null.
   */
  it('names nothing when two open goals would both match', () => {
    const title = 'I need a good carpenter for kitchen shelves';

    expect(goalNamedIn(title, [goal(title, 9439), goal(title, 9472)])).toBeNull();
  });
});

describe('the connector does not open the goal a second time', () => {
  it('names the goal that exists instead of creating one', async () => {
    named.mockResolvedValue(goal('I need a good carpenter for kitchen shelves'));

    const out = (await mcpCreateTask('171871', {
      title: 'I need a good carpenter for kitchen shelves',
    })) as { created: boolean; already_open?: { task_ref: string }; next?: string };

    expect(out.created).toBe(false);
    expect(out.already_open?.task_ref).toContain('9439');
    expect(made).not.toHaveBeenCalled();
  });

  /**
   * A REFUSAL THAT ONLY REFUSES LEAVES THE MODEL TO INVENT THE NEXT MOVE, and
   * what it invents here is the same goal under a slightly different title.
   * So the refusal carries the way through, and the way through works.
   */
  it('creates it when the user has said it is a different need', async () => {
    named.mockResolvedValue(goal('I need a good carpenter for kitchen shelves'));

    const out = (await mcpCreateTask('171871', {
      title: 'I need a good carpenter for kitchen shelves',
      separate: true,
    })) as { created: boolean };

    expect(out.created).toBe(true);
    expect(made).toHaveBeenCalled();
    expect(named).not.toHaveBeenCalled();
  });

  /** Failing OPEN: a goal that quietly does not appear is the worse outcome. */
  it('opens the goal when the lookup fails', async () => {
    named.mockRejectedValue(new Error('down'));

    const out = (await mcpCreateTask('171871', { title: 'ბუღალტერი მჭირდება' })) as {
      created: boolean;
    };

    expect(out.created).toBe(true);
    expect(made).toHaveBeenCalled();
  });
});

/**
 * ALL THREE WIRES THAT OPEN A GOAL, NAMED BY FILENAME.
 *
 * The pair the seat produced came through two of them — the app opening a goal
 * from a stated need, and the model calling the tool — and the connector is a
 * third that nobody would have found from the evidence, because no seat uses
 * it. A rule that lives in one service is a rule the other two never see.
 */
describe('every wire that opens a goal asks first', () => {
  const chat = readFileSync(join(__dirname, '..', '..', 'chat.service.ts'), 'utf8');
  const handlers = readFileSync(join(__dirname, '..', 'handlers.ts'), 'utf8');

  it('the app opening a goal from a stated need checks before creating', () => {
    const at = chat.indexOf('async function ensureGoalForRequest');
    const body = chat.slice(at, chat.indexOf('const { id } = await createTask(', at));

    expect(body).toContain('await findOpenTaskNamedIn(userId, userMessage)');
  });

  /**
   * AND THE SECOND HALF, WHICH THE SEAT'S REPRODUCTION EXPOSED AT 20:50.
   *
   * The wall held — „no second goal — this is goal 10000 again" is in the
   * container log, and goal 10000 is the only row on that account. But the run
   * in the second chat searched from scratch and asked the owner which city
   * their apartment was in, because NOTHING TOLD IT that this was the same
   * request arriving twice. A fact nobody states is a fact the model guesses.
   *
   * The server states it now, beside the goal's own data.
   */
  it('tells the run that the message is the same request again', () => {
    expect(chat).toContain('THE OWNER HAS JUST ASKED FOR THIS AGAIN');

    const at = chat.indexOf('const sameRequestAgain =');
    const clause = chat.slice(at, at + 900);
    // It names the goal, so the model cannot redirect to the wrong one.
    expect(clause).toContain('repeatedGoal.id');
    expect(clause).toContain('repeatedGoal.title');
    // And it leaves room for the reading where the owner wants something new.
    expect(clause).toContain('genuinely DIFFERENT');
  });

  /** Nothing is appended when the message is not a repeat. */
  it('says nothing on an ordinary message', () => {
    const at = chat.indexOf('const sameRequestAgain =');

    expect(chat.slice(at, at + 120)).toContain("repeatedGoal === null\n      ? ''");
  });

  it('the model’s own create_task call checks before creating', () => {
    const at = chat.indexOf("case 'create_task': {");
    const body = chat.slice(at, at + 4000);

    expect(body).toContain('already_open');
    expect(body).toContain("input['separate'] === true");
    expect(body).toContain('await findOpenTaskNamedIn(userId, title)');
  });

  it('the connector’s create_task checks before creating', () => {
    expect(handlers).toContain('args.separate === true ? null');
    expect(handlers).toContain('already_open');
  });

  /**
   * AND THE ESCAPE IS REACHABLE FROM BOTH. A refusal that names a parameter the
   * caller cannot pass is still a dead end — the schema has to carry it.
   */
  it('both tool schemas expose the way through', () => {
    const server = readFileSync(join(__dirname, '..', 'mcpServer.ts'), 'utf8');

    expect(server).toContain('separate: z.boolean().optional()');
    expect(
      chat.slice(chat.indexOf('const CREATE_TASK_TOOL'), chat.indexOf('const ASK_CONTACT_TOOL')),
    ).toContain('separate: {');
  });
});
