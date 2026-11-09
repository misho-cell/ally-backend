import { titleExchange } from '../threadTitle.service';

/**
 * Tornike's 8 Nov report, #12: „კოკაკოლა" was titled „კოკა ტოპურია", a contact
 * the answer listed. A short first message is titled from itself alone.
 */
describe('the exchange a title is made from', () => {
  it('is the message alone when it is a few words', () => {
    expect(titleExchange('კოკაკოლა', 'Koka Topuria and three more')).toBe('კოკაკოლა');
    expect(titleExchange('Samsung Galaxy s22', 'Try these steps')).toBe('Samsung Galaxy s22');
  });

  it('carries the answer when the message is longer', () => {
    const exchange = titleExchange('I need movers for my flat in Vake', 'Three movers fit');
    expect(exchange).toContain('USER: I need movers for my flat in Vake');
    expect(exchange).toContain('ASSISTANT: Three movers fit');
  });

  it('is the message when there is no answer yet', () => {
    expect(titleExchange('I need movers for my flat in Vake')).toBe(
      'I need movers for my flat in Vake',
    );
  });
});
