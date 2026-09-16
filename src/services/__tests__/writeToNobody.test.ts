/**
 * Ticket 20 row 117 — a "write to nobody" goal still got a plan full of people.
 *
 * 16 September, account 501, three fresh needs each ending „არავის არ მისწერო,
 * მე თვითონ მივწერ/დავურეკ": goals 3532, 3535 and 3536. Every first plan listed
 * two to four people under people_to_involve. A yes would have written to them.
 *
 * The prompt team had already fixed their side (task_main v13, live 10:40) and
 * the plans kept naming people — because the SERVER was asking for names in two
 * places at once: the goal-saved event line („ვის ვკითხავთ სახელებით") and
 * propose_task_plan's own description („the people you will involve"). Neither
 * said what either means when the owner has said to write to nobody, so their
 * rule had to argue with two server instructions to win.
 *
 * Both texts are fixed. This is the half that does not depend on their being
 * read — G6 taught in August that a sentence in a prompt is not a wall.
 */
import { goalSaysWriteToNobody, planNamesPeople } from '../chat.service';

describe('the owner said to write to nobody', () => {
  it.each([
    'ლეპტოპის ეკრანის შეცვლა მჭირდება. არავის არ მისწერო, მე თვითონ მივწერ.',
    'მჭირდება ვეტერინარი. არავის არ დაუკავშირდე.',
    'მარკეტინგის პარტნიორი მჭირდება — მე თვითონ დავურეკავ.',
    'Find me a notary. Do not contact anyone, I will contact them myself.',
    'ARAVIS AR MISWERO is not here, but „არავის ნუ მისწერ" is.',
  ])('reads it in „%s"', (text) => {
    expect(goalSaysWriteToNobody(text)).toBe(true);
  });

  /**
   * The half that matters more, because this REFUSES a plan: a false positive
   * blocks legitimate work. A bare „არავის" is deliberately not a phrase — it
   * turns up in ordinary sentences that mean nothing of the kind.
   */
  it.each([
    'მჭირდება კარგი ვეტერინარი თბილისში.',
    'არავის ვიცნობ ამ სფეროში, დამეხმარე.',
    'ვეძებ ადამიანს, ვისაც არავის გაუკეთებია ეს.',
    'I need an introduction to anyone in fintech.',
    '',
  ])('does NOT read it in „%s"', (text) => {
    expect(goalSaysWriteToNobody(text)).toBe(false);
  });

  it('survives a goal with no title and no brief', () => {
    expect(goalSaysWriteToNobody(null)).toBe(false);
    expect(goalSaysWriteToNobody(undefined)).toBe(false);
  });
});

describe('a plan that would have us write to people', () => {
  it('is one with anybody under people_to_involve', () => {
    expect(planNamesPeople({ people_to_involve: [{ name: 'Gega', phone: '+9955' }] })).toBe(true);
  });

  it.each([
    ['an empty list', { people_to_involve: [] }],
    ['no list at all', { solved_when: 'done' }],
    ['not an object', 'a plan'],
    ['null', null],
  ])('is not one with %s', (_label, plan) => {
    expect(planNamesPeople(plan)).toBe(false);
  });
});

/**
 * Ticket 20 row 119 — a run had no idea what day it was.
 *
 * The tester asked directly, and the answer was no: the prompt assembly
 * computes a date nowhere, in any mode. Goal 3536's assistant kept writing
 * „ხვალ 12:00" and saved a private note dated 2026-09-11 on a 16 September
 * goal — it was not ignoring a rule, it had nothing to read.
 *
 * The clock is a parameter rather than read inside, so this test states what
 * the line says on a known day instead of passing differently at midnight.
 */
describe('the run is told what day it is', () => {
  const { buildTodaySection } = jest.requireActual('../chat.service');
  // 16 September 2026, 11:10 UTC — which is 15:10 in Tbilisi.
  const NOON = new Date('2026-09-16T11:10:00Z');

  it('carries the ISO date, so nothing has to be parsed out of prose', () => {
    expect(buildTodaySection(NOON)).toContain('2026-09-16');
  });

  it('is on TBILISI time, not UTC — „ხვალ" is their tomorrow', () => {
    expect(buildTodaySection(NOON)).toContain('15:10');
    expect(buildTodaySection(NOON)).toContain('თბილისი');
  });

  it('names the weekday, because that is how a date is said out loud', () => {
    // 16 September 2026 is a Wednesday.
    expect(buildTodaySection(NOON)).toContain('ოთხშაბათი');
  });

  it('tells the model to turn a relative word into a real date', () => {
    expect(buildTodaySection(NOON)).toContain('ხვალ');
  });

  it('and to say it does not know rather than invent one', () => {
    expect(buildTodaySection(NOON)).toMatch(/ნურასდროს|არ იცი/);
  });

  it('crosses midnight in Tbilisi, not in UTC', () => {
    // 21:30 UTC on the 16th is already 01:30 on the 17th in Tbilisi.
    expect(buildTodaySection(new Date('2026-09-16T21:30:00Z'))).toContain('2026-09-17');
  });
});
