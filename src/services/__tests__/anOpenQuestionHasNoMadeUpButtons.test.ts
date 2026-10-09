import { readFileSync } from 'fs';
import { join } from 'path';
import { AskKind, askKindOf } from '../askKind';

/**
 * 2185 (MTR #7, 2 of 2): „whom would you recommend?" got yes / no buttons, or
 * buttons answering for the helper („20 ლარი ღირს", „ესა და ეს დარბაზი").
 */
describe('an open question carries only the server’s own buttons (2185)', () => {
  it.each([
    'Whom would you recommend?',
    'ვის მირჩევდი?',
    'რა ღირს დარბაზის ქირა?',
    'Which hall would you recommend?',
  ])('„%s" is open', (q) => expect(askKindOf(q)).toBe(AskKind.Open));

  it('„Do you know a good accountant?" still gets the know buttons', () => {
    expect(askKindOf('Do you know a good accountant?')).toBe(AskKind.Know);
  });

  it('the model’s and the editor’s buttons are dropped on an open question', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain('const ownButtons = openQuestion ? undefined : authored;');
    expect(asks).toContain('const editedChoices = openQuestion');
  });
});
