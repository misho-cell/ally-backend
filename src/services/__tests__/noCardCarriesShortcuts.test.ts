import { onlyPlanButtons } from '../cardButtons';
import { APPROVE_LABEL, CHANGE_LABEL } from '../choiceNotes';

/**
 * #6364, RULE D846 (Giorgi, 19 Oct): no card carries a shortcut-answer button.
 * The plan card keeps „ვადასტურებ" and „შევცვალოთ", exactly as before.
 */
describe('a card shows no shortcut-answer button', () => {
  it('keeps the plan card’s two buttons, in every language', () => {
    for (const lang of ['ka', 'en', 'ru', 'es'] as const) {
      expect(onlyPlanButtons([APPROVE_LABEL[lang], CHANGE_LABEL[lang]])).toEqual([
        APPROVE_LABEL[lang],
        CHANGE_LABEL[lang],
      ]);
    }
  });

  it('drops every other button, the helper’s and the reminder’s included', () => {
    expect(onlyPlanButtons(['ვიცნობ, დავაკავშირებ', 'არ ვიცნობ'])).toBeNull();
    expect(onlyPlanButtons(['კი', 'არა', 'ხვალ'])).toBeNull();
    expect(onlyPlanButtons(['ვადასტურებ', 'შევცვალოთ', 'სხვა, მე დავწერ'])).toEqual([
      'ვადასტურებ',
      'შევცვალოთ',
    ]);
  });

  it('reads nothing into a missing or malformed set', () => {
    expect(onlyPlanButtons(null)).toBeNull();
    expect(onlyPlanButtons(undefined)).toBeNull();
    expect(onlyPlanButtons('ვადასტურებ')).toBeNull();
    expect(onlyPlanButtons([1, { label: 'ვადასტურებ' }])).toBeNull();
  });
});

describe('#6364 is applied where buttons leave the server', () => {
  const { readFileSync } = jest.requireActual<typeof import('fs')>('fs');
  const { join } = jest.requireActual<typeof import('path')>('path');
  const read = (...p: string[]): string => readFileSync(join(__dirname, ...p), 'utf8');

  it('in history, in both live events and in the sync reply', () => {
    expect(read('..', 'threads.service.ts')).toContain('choices: onlyPlanButtons(row.choices)');
    const sse = read('..', 'sse.service.ts');
    expect(sse).toContain('const choices = onlyPlanButtons(payload.choices);');
    expect(sse).toContain('scrubDeep(onlyPlanButtons(payload.choices) ?? [])');
    expect(read('..', '..', 'api', 'routes', 'chat.routes.ts')).toContain(
      'const choices = onlyPlanButtons(result.choices);',
    );
  });
});
