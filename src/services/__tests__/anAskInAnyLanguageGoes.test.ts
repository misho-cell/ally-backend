import { looksLikeContactInstruction } from '../goalIntent';

/** #1156 (the tester's 1163, 39140): „Preguntale a X si…" is an ask like „Ask X if…". */
describe('an ask in Spanish or Russian', () => {
  it('is a contact instruction, so it goes in the same turn', () => {
    expect(
      looksLikeContactInstruction(
        'Preguntale a Netai Test 1 si conoce un buen dentista en Tbilisi.',
      ),
    ).toBe(true);
    expect(looksLikeContactInstruction('Спроси Нино, знает ли она стоматолога')).toBe(true);
  });

  it('is not a need that only names a trade', () => {
    expect(looksLikeContactInstruction('Necesito un buen dentista')).toBe(false);
  });
});
