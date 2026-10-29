jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { farFindLeftUnplanned } from '../chat.service';
import { farFindUnplannedNudge } from '../replyGuards';

/**
 * 5347, the tester's 63930 (56071, 56077): the walk found Zurab further out and
 * the reply only asked in prose „shall I ask Levan's assistant?" — no plan, no
 * card, nothing for the owner to tap.
 */
describe('somebody found further out', () => {
  const noPlan = { status: 'open' as const, plan: null, plan_proposed: null };
  const zurab = ['ზურაბ ქობულაძე'];

  it('sends the run back for a plan when nothing acted and the goal has none', () => {
    expect(farFindLeftUnplanned(zurab, ['search_second_degree', 'web_search'], noPlan)).toBe(true);
  });

  it('is left alone once the run proposed a plan or asked someone', () => {
    expect(farFindLeftUnplanned(zurab, ['find_warm_path', 'propose_task_plan'], noPlan)).toBe(
      false,
    );
    expect(farFindLeftUnplanned(zurab, ['ask_contact'], noPlan)).toBe(false);
  });

  it('is left alone when the goal already has a plan or is not open', () => {
    expect(farFindLeftUnplanned(zurab, [], { ...noPlan, plan_proposed: {} as never })).toBe(false);
    expect(farFindLeftUnplanned(zurab, [], { ...noPlan, status: 'paused' })).toBe(false);
  });

  it('needs somebody found', () => {
    expect(farFindLeftUnplanned([], [], noPlan)).toBe(false);
  });

  it('sends a quick answer with no goal back too, to open one first (64549)', () => {
    expect(farFindLeftUnplanned(zurab, ['search_second_degree'], null)).toBe(true);
    expect(farFindUnplannedNudge(zurab, true)).toContain('create_task');
    expect(farFindUnplannedNudge(zurab)).not.toContain('create_task');
  });

  it('names who was found and the tools that make the card', () => {
    const nudge = farFindUnplannedNudge(zurab);
    expect(nudge).toContain('ზურაბ ქობულაძე');
    expect(nudge).toContain('find_warm_path');
    expect(nudge).toContain('propose_task_plan');
  });

  it('asks in words, with no buttons, and lets namesakes be told apart first (#6304)', () => {
    const nudge = farFindUnplannedNudge(zurab);
    expect(nudge).toContain('present_choices არ გამოიძახო');
    expect(nudge).not.toContain('„ვამტკიცებ"');
    expect(nudge).toContain('რომელს გულისხმობს');
  });
});

describe('a quick answer with no goal', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { wantsSomethingDone } = require('../replyGuards') as typeof import('../replyGuards');

  it('is sent back only when the owner asked for something done', () => {
    expect(wantsSomethingDone('ზურაბ ქიმერიძის გაცნობა მინდა')).toBe(true);
    expect(wantsSomethingDone('მჭირდება ნოტარიუსი ქუთაისში')).toBe(true);
    expect(wantsSomethingDone('Please introduce me to Zurab')).toBe(true);
    expect(wantsSomethingDone('ვინ ვიცი თიბისიში?')).toBe(false);
    expect(wantsSomethingDone('who do I know at TBC?')).toBe(false);
  });
});

describe('the far-find note is the server’s, never the owner’s (tester 77502)', () => {
  it('is saved as an event, with the foreign-word note, whatever names or word it carries', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isModelOnlyNudge } = require('../chat.service') as typeof import('../chat.service');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { foreignWordNudge } = require('../buttonLetters') as typeof import('../buttonLetters');
    expect(isModelOnlyNudge(farFindUnplannedNudge(['გიორგი ხატიაშვილი'], true))).toBe(true);
    expect(isModelOnlyNudge(farFindUnplannedNudge(['ზურაბ ქობულაძე']))).toBe(true);
    expect(isModelOnlyNudge(foreignWordNudge('გამარ健ობა'))).toBe(true);
    expect(isModelOnlyNudge('ლიკას სთხოვე')).toBe(false);
  });
});

describe('a note the server adds during a run reads as the server’s (tester 77651)', () => {
  it('is framed in the run and kept bare in the trail', () => {
    const { readFileSync } = jest.requireActual<typeof import('fs')>('fs');
    const { join } = jest.requireActual<typeof import('path')>('path');
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('content: frameServerTurn(guardNudge),');
    expect(chat).toContain('pending.push(cliffhangerTurn, nudgeTurn);');
    expect(chat).toContain(
      "blocks.push({ type: 'text', text: String(frameServerTurn(SALVAGE_NUDGE)) });",
    );
  });
});

describe('a plan on an instruction is not a send (tester 77718, #6304)', () => {
  it('leaves the unsent guard on after „ლიკას სთხოვე", and off for an ordinary plan', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { actedByName } = require('../chat.service') as typeof import('../chat.service');
    expect(actedByName('propose_task_plan', 'ლიკას სთხოვე')).toBe(false);
    expect(actedByName('propose_task_plan', 'ნოტარიუსი მჭირდება ქუთაისში')).toBe(true);
    expect(actedByName('approve_task_plan', 'ლიკას სთხოვე')).toBe(true);
    expect(actedByName('ask_contact', 'ლიკას სთხოვე')).toBe(false);
  });
});
