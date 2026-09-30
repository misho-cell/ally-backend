import { PLAN_PROPOSAL_EVENT } from '../taskEngine.events';

/**
 * Row 287: the plan asked the owner's yes for „your contacts" and „the second
 * circle" because the event said „start nothing until the plan is approved".
 * Searching runs first and by itself; the yes is only for what goes out.
 */
describe('the plan proposal searches first and asks a yes only for what goes out', () => {
  it('says to search before the plan, with no approval, in every language', () => {
    expect(PLAN_PROPOSAL_EVENT.en).toMatch(/SEARCH FIRST/);
    expect(PLAN_PROPOSAL_EVENT.ka).toMatch(/ჯერ მოძებნე/);
    expect(PLAN_PROPOSAL_EVENT.ru).toMatch(/СНАЧАЛА ИЩИ/);
    expect(PLAN_PROPOSAL_EVENT.es).toMatch(/BUSCA PRIMERO/);
  });

  it('never offers a search for approval', () => {
    expect(PLAN_PROPOSAL_EVENT.en).toMatch(/never offer a search for approval/);
    expect(PLAN_PROPOSAL_EVENT.ka).toMatch(/ძებნა მას არ სთხოვო/);
  });

  it('no longer says to start nothing before approval — only to write to nobody', () => {
    expect(PLAN_PROPOSAL_EVENT.en).not.toMatch(/start nothing/);
    expect(PLAN_PROPOSAL_EVENT.en).toMatch(/Write to nobody until the plan\s+is approved/);
  });
});
