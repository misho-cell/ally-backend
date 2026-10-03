import { readFileSync } from 'fs';
import { join } from 'path';
import { pointsAtButtonsBelow } from '../buttonsBelow';

/** The tester's 1087 (#509, 32408): „აირჩიე ზემოთ" with the buttons under the message. */
describe('pointsAtButtonsBelow', () => {
  const buttons = ['კი', 'არა'];

  it('turns „choose above" into „choose below" when the reply has buttons', () => {
    expect(pointsAtButtonsBelow('აირჩიე ზემოთ, ან დაწერე სხვანაირად.', buttons)).toBe(
      'აირჩიე ქვემოთ, ან დაწერე სხვანაირად.',
    );
    expect(pointsAtButtonsBelow('ზემოთ მოცემულ ღილაკებს დააჭირე.', buttons)).toBe(
      'ქვემოთ მოცემულ ღილაკებს დააჭირე.',
    );
    expect(pointsAtButtonsBelow('ზემოთ ხუთივე ვარიანტია, აირჩიე.', buttons)).toBe(
      'ქვემოთ ხუთივე ვარიანტია, აირჩიე.',
    );
    expect(pointsAtButtonsBelow('Pick one above or type your own.', buttons)).toBe(
      'Pick one below or type your own.',
    );
  });

  it('leaves a reply without buttons as written', () => {
    expect(pointsAtButtonsBelow('აირჩიე ზემოთ.', null)).toBe('აირჩიე ზემოთ.');
    expect(pointsAtButtonsBelow('აირჩიე ზემოთ.', [])).toBe('აირჩიე ზემოთ.');
  });

  it('does not touch „above" that is not about the buttons', () => {
    expect(pointsAtButtonsBelow('ზემოთ ვახსენე ანა.', buttons)).toBe('ზემოთ ვახსენე ანა.');
    expect(pointsAtButtonsBelow('ზემოთ მოცემული გეგმა მივყვე?', buttons)).toBe(
      'ზემოთ მოცემული გეგმა მივყვე?',
    );
  });

  it('is applied to the reply that is stored', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'const storedReply = pointsAtButtonsBelow(scrubMechanicalForStorage(reply), safeChoices ?? null);',
    );
  });
});
