import { readFileSync } from 'fs';
import { join } from 'path';
import {
  INTRODUCTION_OUTSIDE_THE_PLAN,
  INTRODUCTION_WAITS_FOR_THE_YES,
  introductionWaitsLine,
} from '../introYesGate';
import { APPROVE_PLAN_DESCRIPTION } from '../chat.service';

/**
 * Autonomy stage 1, K9 (the audit in docs/prompt_stage3/K9_REFUSALS.md): under an
 * approved plan a refusal gives the plan's next step, not „ask the owner and wait".
 * Without a plan the old text stands.
 */
const source = (file: string): string => readFileSync(join(__dirname, '..', file), 'utf8');

describe('B5: an introduction outside the approved plan', () => {
  it('goes on with the plan and asks once beside it', () => {
    expect(introductionWaitsLine(true)).toBe(INTRODUCTION_OUTSIDE_THE_PLAN);
    expect(INTRODUCTION_OUTSIDE_THE_PLAN).toContain('Go on with the plan’s next step now');
  });

  it('keeps asking first when there is no approved plan', () => {
    expect(introductionWaitsLine(false)).toBe(INTRODUCTION_WAITS_FOR_THE_YES);
  });

  it('is told from the goal’s own plan', () => {
    const chat = source('chat.service.ts');
    const at = chat.indexOf('error: introductionWaitsLine(');
    expect(at).toBeGreaterThan(0);
    expect(chat.slice(at, at + 200)).toContain(
      'goalForIntro?.plan && goalForIntro.plan_approved_at',
    );
  });
});

describe('B1: the goal section under an approved plan', () => {
  it('says the plan is the consent, and keeps ask-first only without one', () => {
    const chat = source('chat.service.ts');
    const at = chat.indexOf('const autonomyLine =');
    const line = chat.slice(at, at + 700);
    expect(line).toContain('plan?.approved_at');
    expect(line).toContain('მისი ნაბიჯები და წესები უკვე თანხმობაა');
    expect(line).toContain('ჯერ-კითხვა');
  });
});

describe('B2: what approving a plan means', () => {
  it('covers every step and rule, the on_named introduction included', () => {
    expect(APPROVE_PLAN_DESCRIPTION).toContain('every step of the plan and every rule');
    expect(APPROVE_PLAN_DESCRIPTION).toContain('on_named');
  });
});

describe('B4: a person outside the plan list', () => {
  it('asks for the introduction through whoever named them, or goes on with the plan', () => {
    const asks = source('taskAsks.service.ts');
    const at = asks.indexOf("reason: 'outside_plan',");
    const text = asks.slice(at, at + 700);
    expect(text).toContain('request_introduction');
    expect(text).toContain('გეგმის შემდეგი ნაბიჯი');
    expect(text).not.toContain('დაელოდე „კი"-ს და მხოლოდ მერე მისწერე');
  });
});

describe('B7–B9: introduction refusals under an approved plan', () => {
  const intro = source('tools/requestIntroduction.ts');

  it('branch on the approved plan the request came from', () => {
    expect(intro).toContain('planApproved?: boolean;');
    expect(intro.match(/context\.planApproved/gu)?.length).toBe(3);
    expect(source('chat.service.ts')).toContain(
      'planApproved: Boolean(goalForIntro?.plan && goalForIntro.plan_approved_at),',
    );
  });
});
