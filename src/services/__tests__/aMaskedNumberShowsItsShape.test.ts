import { readFileSync } from 'fs';
import { join } from 'path';
import { maskedNumberShapes, numberShapes } from '../chat.service';
import { ALLOW_CLOSE, ALLOW_OPEN } from '../privacyScrub';

/**
 * The tester's 964 (Rustavi, run ae3e19f6): „12 allowed, 2 masked" and nothing
 * about why. The log now prints each number's FORM, every digit as 9 — never
 * a value (D149) — so the next mismatch names itself.
 */
describe('a number is logged by its shape only', () => {
  it('writes every digit as 9', () => {
    expect(numberShapes(['+995 341 28 07 49'])).toEqual(['+999 999 99 99 99']);
  });

  it('lists the masked runs outside the allowed spans, and never an allowed one', () => {
    const reply = `ტელ: ${ALLOW_OPEN}+995 341 28 07 49${ALLOW_CLOSE} და 0341 28 07 49, N17/65`;
    expect(maskedNumberShapes(reply)).toEqual(['9999 99 99 99']);
  });

  it('carries no digit at all', () => {
    const shapes = maskedNumberShapes('ტელ: +995 599 12 34 56 და 599123456');
    expect(shapes.join('')).not.toMatch(/[0-8]/);
  });
});

/**
 * 279 (a), the tester's 964: a typed „ჰკითხე X-ს…" → create_task, then
 * propose_task_plan for that one person with ვამტკიცებ / შევცვალოთ.
 */
describe('a plan for the one person the owner just instructed is refused', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const handler = chat.slice(chat.indexOf("case 'propose_task_plan': {"));

  it('is checked first in propose_task_plan', () => {
    const check = handler.indexOf('ownerJustInstructedThePlansOnePerson(');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(handler.indexOf('planNamesPeople('));
    expect(handler.slice(check, check + 300)).toContain('error: NO_PLAN_FOR_AN_INSTRUCTION');
  });

  it('only for a plan of exactly one person, an instruction, naming an own contact', () => {
    const fn = chat.slice(chat.indexOf('async function ownerJustInstructedThePlansOnePerson'));
    const body = fn.slice(0, 900);
    expect(body).toContain('peopleAddedToPlan(plan, inForce).length !== 1');
    expect(body).toContain('looksLikeContactInstruction(said)');
    expect(body).toContain('messageNamesOwnContact(userId, said)');
  });

  it('sends the run to the grant and the ask', () => {
    const text = chat.slice(chat.indexOf('const NO_PLAN_FOR_AN_INSTRUCTION'));
    expect(text.slice(0, 500)).toContain(
      'grant_task_permission (confirmed: true), then ask_contact',
    );
  });
});
