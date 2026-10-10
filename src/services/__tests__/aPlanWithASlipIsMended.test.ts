import { repairedPlanJson } from '../planJsonRepair';
import { parsePlan } from '../taskPlans.service';

/** 4522: plans refused as „not valid JSON" for a slip in the middle, and lost. */
describe('a plan whose JSON text has a slip', () => {
  // The 15:30Z case, as the tool log shows it: a lone quote before the routes' closing bracket.
  const strayQuote =
    '{"solved_when": "ვაკეში ნოტარიუსი მოიძებნა", "routes": [{"name": "პირადი კონტაქტი", "status": "waiting"}, "], ' +
    '"people_to_involve": [{"name": "გია ხელოსანი", "phone": "+995599000370", "route": "პირადი კონტაქტი"}], "never": []}';

  it('is mended when the slip is a lone quote before a bracket', () => {
    expect(repairedPlanJson(strayQuote)).toMatchObject({
      routes: [{ name: 'პირადი კონტაქტი', status: 'waiting' }],
      people_to_involve: [{ name: 'გია ხელოსანი' }],
    });
  });

  it('is mended when a Georgian „ was closed with an ASCII quote', () => {
    const text = '{"solved_when": "„საცდელი ლოჯისტიკა"ს ბუღალტერი", "routes": []}';
    expect(repairedPlanJson(text)).toEqual({
      solved_when: '„საცდელი ლოჯისტიკა“ს ბუღალტერი',
      routes: [],
    });
  });

  it('stays unmended when it really was cut off', () => {
    expect(repairedPlanJson('{"solved_when": "ვაკეში ნოტარ')).toBeUndefined();
  });

  it('reaches the plan checks instead of the „not valid JSON" refusal', () => {
    const outcome = parsePlan(strayQuote);
    if (!outcome.ok) expect(outcome.error).not.toContain('not valid JSON');
  });
});
