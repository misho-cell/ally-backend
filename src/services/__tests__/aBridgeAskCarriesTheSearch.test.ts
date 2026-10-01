/**
 * Plate v301 G4, the tester's 994: the model asked the bridge without `need`,
 * so no picker was drawn. The server remembers the second-degree search that
 * found the bridge, in the same thread, and the ask carries it.
 */
import { forgetBridgeNeeds, noteSecondDegreeResult, rememberedBridgeNeed } from '../bridgeNeeds';

const THREAD = 29668;
const BRIDGE = '+44 7700 900996';
const RESULT = {
  found: true,
  results: [
    { phone: 'p-dato', via_contacts: [{ name: 'Netai Test 154', phone: '+447700900996' }] },
    { phone: 'p-keti', via_contacts: [{ name: 'Netai Test 154', phone: '+447700900996' }] },
  ],
};

beforeEach(forgetBridgeNeeds);

describe('a bridge found by a second-degree search', () => {
  it('is remembered with the words and the first person found through it', () => {
    noteSecondDegreeResult(THREAD, 'ადვოკატი', RESULT);

    expect(rememberedBridgeNeed(THREAD, BRIDGE)).toEqual({ need: 'ადვოკატი', forPhone: 'p-dato' });
  });

  it('keeps the first search that found it', () => {
    noteSecondDegreeResult(THREAD, 'ადვოკატი', RESULT);
    noteSecondDegreeResult(THREAD, 'უძრავი ქონების იურისტი', RESULT);

    expect(rememberedBridgeNeed(THREAD, BRIDGE)?.need).toBe('ადვოკატი');
  });

  it('belongs to its thread only', () => {
    noteSecondDegreeResult(THREAD, 'ადვოკატი', RESULT);

    expect(rememberedBridgeNeed(THREAD + 1, BRIDGE)).toBeUndefined();
    expect(rememberedBridgeNeed(undefined, BRIDGE)).toBeUndefined();
  });

  it('ignores a result with no rows, and an empty search', () => {
    noteSecondDegreeResult(THREAD, 'ადვოკატი', { found: false });
    noteSecondDegreeResult(THREAD, '  ', RESULT);

    expect(rememberedBridgeNeed(THREAD, BRIDGE)).toBeUndefined();
  });

  it('does not make a person who is not a bridge into one', () => {
    noteSecondDegreeResult(THREAD, 'ადვოკატი', RESULT);

    expect(rememberedBridgeNeed(THREAD, '+995 599 00 00 00')).toBeUndefined();
  });
});
