import { DAY_ONE_EVENT } from '../taskEngine.events';

const LANGUAGES = ['ka', 'en', 'ru', 'es'] as const;

/**
 * #6898 (Misho's yes, 21 Oct): „write to the first 3–5 people" sent a run with
 * a one-person plan looking for more, and the extra names came back as a
 * second card. Day one writes to the people in the plan, never to a count.
 */
describe('day one writes to the people in the plan (#6898)', () => {
  it('names no head count in any language', () => {
    for (const lang of LANGUAGES) expect(DAY_ONE_EVENT[lang]).not.toMatch(/3–5/u);
  });

  it('says to write to the people in the plan', () => {
    expect(DAY_ONE_EVENT.ka).toContain('მისწერე გეგმაში მყოფებს');
    expect(DAY_ONE_EVENT.en).toContain('Write to the people in the plan');
  });
});
