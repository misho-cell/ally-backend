import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 2185 (MTR #7, 2 of 2): „whom would you recommend?" got yes / no buttons, or
 * buttons answering for the helper („20 ლარი ღირს", „ესა და ეს დარბაზი").
 */
describe('an open question carries only the server’s own buttons (2185)', () => {
  it('the model’s and the editor’s buttons are dropped on an open question', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain('const openQuestion = askKind === AskKind.Open;');
    expect(asks).toContain('const ownButtons = openQuestion || isNotice ? undefined : authored;');
    expect(asks).toContain('const editedChoices = openQuestion');
  });
});
