import { buttonsShown } from '../cardButtons';
import { APPROVE_LABEL, CHANGE_LABEL } from '../choiceNotes';

/**
 * #6364, RULE D846 (Giorgi, 19 Oct): no card carries a shortcut-answer button.
 * #8054 (founder 27 Oct, box 76726, decision B): the plan card's two go too —
 * no buttons anywhere; a typed „კი" approves.
 */
describe('a card shows no button at all', () => {
  it('drops the plan card’s two buttons, in every language', () => {
    for (const lang of ['ka', 'en', 'ru', 'es'] as const) {
      expect(buttonsShown([APPROVE_LABEL[lang], CHANGE_LABEL[lang]])).toBeNull();
    }
  });

  it('drops every other button, the helper’s and the reminder’s included', () => {
    expect(buttonsShown(['ვიცნობ, დავაკავშირებ', 'არ ვიცნობ'])).toBeNull();
    expect(buttonsShown(['კი', 'არა', 'ხვალ'])).toBeNull();
    expect(buttonsShown(['ვადასტურებ', 'შევცვალოთ', 'სხვა, მე დავწერ'])).toBeNull();
  });

  it('reads nothing into a missing or malformed set', () => {
    expect(buttonsShown(null)).toBeNull();
    expect(buttonsShown(undefined)).toBeNull();
    expect(buttonsShown('ვადასტურებ')).toBeNull();
    expect(buttonsShown([1, { label: 'ვადასტურებ' }])).toBeNull();
  });
});

describe('#6364 is applied where buttons leave the server', () => {
  const { readFileSync } = jest.requireActual<typeof import('fs')>('fs');
  const { join } = jest.requireActual<typeof import('path')>('path');
  const read = (...p: string[]): string => readFileSync(join(__dirname, ...p), 'utf8');

  it('in history, in both live events and in the sync reply', () => {
    expect(read('..', 'threads.service.ts')).toContain('choices: buttonsShown(row.choices)');
    const sse = read('..', 'sse.service.ts');
    expect(sse).toContain('const choices = buttonsShown(payload.choices);');
    expect(sse).toContain('scrubDeep(buttonsShown(payload.choices) ?? [])');
    const route = read('..', '..', 'api', 'routes', 'chat.routes.ts');
    expect(route).toContain('const choices = buttonsShown(result.choices);');
    expect(route).toContain('...otherChoiceField(choices),');
  });
});

/** #8054 (tester 77254): present_choices in a run that proposed a plan is refused. */
describe('a run that proposed a plan', () => {
  const { readFileSync } = jest.requireActual<typeof import('fs')>('fs');
  const { join } = jest.requireActual<typeof import('path')>('path');
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('marks itself when propose_task_plan runs, or is called in the same step', () => {
    const handler = chat.slice(chat.indexOf("case 'propose_task_plan': {"));
    expect(handler.slice(0, 200)).toContain('runsThatProposedAPlan.add(runId)');
    expect(chat).toContain(
      "if (toolBlocks.some((b) => b.name === 'propose_task_plan')) runsThatProposedAPlan.add(runId);",
    );
  });

  it('refuses present_choices and tells the model to ask in words', () => {
    const handler = chat.slice(chat.indexOf("case 'present_choices': {"));
    expect(handler.slice(0, 900)).toContain('runsThatProposedAPlan.has(runId)');
    expect(handler.slice(0, 900)).toContain('error: PLAN_ASKS_IN_WORDS');
  });

  it('forgets the mark when the run ends', () => {
    const start = chat.indexOf('function clearRunState(runId: string): void {');
    const clear = chat.slice(start, chat.indexOf('\n}\n', start));
    expect(clear).toContain('runsThatProposedAPlan.delete(runId)');
  });
});
