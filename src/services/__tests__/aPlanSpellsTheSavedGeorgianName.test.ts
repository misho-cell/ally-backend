const mockFacts = jest.fn();
jest.mock('../tools/factEnrichment', () => ({
  __esModule: true,
  fetchFactsForPhones: (...a: unknown[]) => mockFacts(...a),
  nameAsSpelled: jest.requireActual('../tools/factEnrichment').nameAsSpelled,
}));
jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { withSavedSpelling } from '../taskPlans.service';

/** #4654 (the tester's 64914, 56629): the plan said „Tsotne Tsitskishvili-ის ასისტენტს". */
describe('a name in a Georgian plan', () => {
  const tsotne = { name: 'Tsotne Tsitskishvili', phone: '+995500000060', route: 'პირდაპირი' };

  beforeEach(() => jest.resetAllMocks());

  it('is the Georgian spelling the owner saved, when the model wrote the Latin label', async () => {
    mockFacts.mockResolvedValue(new Map([['+995500000060', { georgianName: 'ცოტნე ციცქიშვილი' }]]));
    const [person] = await withSavedSpelling('186918', [tsotne]);
    expect(person.name).toBe('ცოტნე ციცქიშვილი');
    expect(person.phone).toBe(tsotne.phone);
  });

  it('stays as written when nothing is saved, when it is already Georgian, or when the read fails', async () => {
    mockFacts.mockResolvedValue(new Map());
    expect((await withSavedSpelling('1', [tsotne]))[0].name).toBe('Tsotne Tsitskishvili');
    mockFacts.mockResolvedValue(new Map([['+995500000060', { georgianName: 'ცოტნე ციცქიშვილი' }]]));
    const own = { ...tsotne, name: 'ცოტნე' };
    expect((await withSavedSpelling('1', [own]))[0].name).toBe('ცოტნე');
    mockFacts.mockRejectedValue(new Error('timeout'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await withSavedSpelling('1', [tsotne]))[0].name).toBe('Tsotne Tsitskishvili');
  });

  it('is applied to a Georgian plan only', () => {
    const plans = readFileSync(join(__dirname, '..', 'taskPlans.service.ts'), 'utf8');
    expect(plans).toContain(
      "const spelled = language === 'ka' ? await withSavedSpelling(userId, once) : once;",
    );
  });
});
