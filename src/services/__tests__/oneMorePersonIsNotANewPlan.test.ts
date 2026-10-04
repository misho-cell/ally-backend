import { readFileSync } from 'fs';
import { join } from 'path';
import { peopleAddedToPlan } from '../chat.service';
import { TaskPlan } from '../taskPlans.service';

/**
 * The tester's 1137 (36989, D625): after the plan was approved the owner wrote
 * „კიდევ ერთ ადამიანსაც ჰკითხე: მაკა მასწავლებელს" and got a second plan card
 * naming Zaza and Maka. What the line adds is one person.
 */
const inForce = {
  solved_when: 'x',
  routes: [],
  people_to_involve: [{ name: 'ზაზა ხელოსანი', phone: 'p-zaza' }],
  never_contact: [],
} as unknown as TaskPlan;

describe('the people a revised plan adds', () => {
  it('is only the new person when the approved one is kept', () => {
    const plan = {
      people_to_involve: [
        { name: 'ზაზა ხელოსანი', phone: 'p-zaza' },
        { name: 'მაკა მასწავლებელი', phone: 'p-maka' },
      ],
    };
    expect(peopleAddedToPlan(plan, inForce)).toHaveLength(1);
  });

  it('counts everyone when no plan is in force', () => {
    const plan = {
      people_to_involve: [
        { name: 'a', phone: 'p-a' },
        { name: 'b', phone: 'p-b' },
      ],
    };
    expect(peopleAddedToPlan(plan, null)).toHaveLength(2);
  });

  it('is nothing for a plan that is not one', () => {
    expect(peopleAddedToPlan(null, inForce)).toEqual([]);
  });

  it('is what the owner-instruction refusal reads, beside the plan in force', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('if (peopleAddedToPlan(plan, inForce).length !== 1) return false;');
    expect(chat).toContain('(planTask?.plan ?? null) as TaskPlan | null,');
  });
});
