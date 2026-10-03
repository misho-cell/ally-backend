import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Tester 1075, conversation 31787: the owner typed „ask Maka too". The plan
 * wall refused Maka as outside the approved plan and sent the model to
 * propose a plan; the plan tool refused, saying the owner's instruction IS
 * the permission (D316); the loop ran three times and the owner was told a
 * question was going out that never left.
 *
 * The plan wall now takes the same D316 answer the permission wall already
 * did. What must not loosen: the never-contact list still refuses first,
 * whatever the owner typed, and only an unambiguous match on the owner's own
 * phonebook label counts as naming somebody.
 */
const code = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

describe('the owner naming someone passes the plan wall', () => {
  it('asks the D316 question before refusing a person outside the plan', () => {
    const wall = code.indexOf("reason: 'outside_plan'");
    const question = code.lastIndexOf('ownerNamedThemOutsidePlan(threadId', wall);

    expect(question).toBeGreaterThan(-1);
    expect(wall - question).toBeLessThan(200);
  });

  it('still refuses the never-contact list before anything the owner typed', () => {
    const never = code.indexOf("reason: 'never_contact'");
    const exception = code.indexOf('ownerNamedThemOutsidePlan(threadId');

    expect(never).toBeGreaterThan(-1);
    expect(never).toBeLessThan(exception);
  });

  it('uses the one matcher the permission wall uses, not a second one', () => {
    const helper = code.slice(code.indexOf('async function ownerNamedThemOutsidePlan'));

    expect(helper.slice(0, 600)).toContain('ownerJustNamedPerson(');
    expect(code).toContain('ownerJustNamedPerson({');
  });
});
