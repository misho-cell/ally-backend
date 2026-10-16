import { serverMayWriteTheAsk } from '../instructedAsk';
import { RUN_MODES } from '../promptBlocks.service';

/** 5347: „სანდროს ჰკითხე ჩემი სახელით." in a request thread reached Sandro as „ჩემი სახელით.". */
describe('the server never writes the question in a request thread', () => {
  it('stands down in a request thread, where the request is what goes on', () => {
    expect(serverMayWriteTheAsk('request_thread')).toBe(false);
  });

  it('still asks for the owner in every other mode, and when the mode is unknown', () => {
    for (const mode of RUN_MODES.filter((m) => m !== 'request_thread')) {
      expect(serverMayWriteTheAsk(mode)).toBe(true);
    }
    expect(serverMayWriteTheAsk(undefined)).toBe(true);
  });
});
