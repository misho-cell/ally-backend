jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));

import { introAcceptedOffNetai } from '../introOpening';
import { introOutcomeEvent } from '../taskEngine.events';

/** #6771 (Giorgi, G-150): the go-between agreed and the target is not on Netai. */
describe('an accepted introduction to someone not on Netai', () => {
  it('is Giorgi’s one message, with a call link and a WhatsApp link', () => {
    expect(introAcceptedOffNetai('ka', 'ლიკა', 'თემურ ბოლოთაშვილი', '+995 500 00 00 01')).toBe(
      'ლიკამ თანხმობა გამოთქვა თემურ ბოლოთაშვილთან გაცნობაზე დახმარებისთვის. ' +
        'ახლა შეგიძლია მას პირდაპირ დაუკავშირდე. ' +
        'ეს არის მისი ნომერი: [+995500000001](tel:+995500000001) ' +
        '[WhatsApp](https://wa.me/995500000001).',
    );
  });

  it('says „-სთან" after a vowel', () => {
    expect(introAcceptedOffNetai('ka', 'გია', 'ნინო', '+995500000001')).toContain(
      'ნინოსთან გაცნობაზე',
    );
  });

  it('claims no Netai channel', () => {
    const text = introAcceptedOffNetai('ka', 'ლიკა', 'თემური', '+995500000001') ?? '';
    expect(text).not.toMatch(/აქ ხართ|გადავცემ|Netai/u);
  });

  it('has no words yet in the other languages, which keep their line', () => {
    expect(introAcceptedOffNetai('en', 'Lika', 'Temur', '+995500000001')).toBeNull();
  });

  it('tells the goal’s run there is no channel and nothing to add', () => {
    const event = introOutcomeEvent(
      'თემური',
      true,
      'handed_over',
      'ლიკა',
      false,
      { answer: null },
      true,
    );
    expect(event.ka).toContain('Netai-ით მასთან არხი არ არსებობს');
    expect(event.ka).not.toContain('პირდაპირი არხი გახსნილია');
    expect(event.en).toContain('there is no Netai channel to them');
  });

  it('leaves a member target’s event as it was', () => {
    const event = introOutcomeEvent('თემური', true, 'handed_over', 'ლიკა');
    expect(event.ka).toContain('პირდაპირი არხი გახსნილია');
  });
});
