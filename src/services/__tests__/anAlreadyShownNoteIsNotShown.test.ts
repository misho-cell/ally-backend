import { withoutAlreadyShownNote } from '../leadingSelfNote';

/** The tester's 44584 b (conv 42451): the wake's own note reached the owner. */
describe('an „already shown" note at the top of a reply', () => {
  it('comes off when the real reply follows it', () => {
    expect(
      withoutAlreadyShownNote(
        'ეს უკვე ნაჩვენები პასუხია, ახალი არაფერია.\n\nგინდა, სხვა კონტაქტს ვკითხო?',
      ),
    ).toBe('გინდა, სხვა კონტაქტს ვკითხო?');
    expect(
      withoutAlreadyShownNote('That answer was already shown.\n\nShall I ask someone else?'),
    ).toBe('Shall I ask someone else?');
  });

  it('stays when nothing follows, or when the paragraph is real content', () => {
    expect(withoutAlreadyShownNote('ეს უკვე ნაჩვენები პასუხია.')).toBe(
      'ეს უკვე ნაჩვენები პასუხია.',
    );
    const plain = 'ნიკამ უპასუხა: ხვალ თავისუფალია.\n\nგინდა, შეხვედრა დავნიშნო?';
    expect(withoutAlreadyShownNote(plain)).toBe(plain);
  });
});
