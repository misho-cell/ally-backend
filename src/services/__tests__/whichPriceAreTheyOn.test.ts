import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ⚠️ THE DRIFT CHECK CANNOT ANSWER THE QUESTION IT RAISES.
 *
 * It reads ONLY our own price id, because the Stripe account is shared with a
 * different product. So its verdict — „stored active, but stripe has no
 * subscription on our price" — is compatible with two entirely different
 * facts: the person is subscribed to nothing and the column is wrong, or the
 * person is subscribed on ANOTHER price and the column is right about access
 * while the check simply cannot see it.
 *
 * Reporting the first from a check that cannot separate them is the same
 * mistake as this morning's tag measurement: a right measurement answering a
 * different question. So the reader that answers it reads EVERY price.
 */
describe('reading which price somebody is actually on', () => {
  const source = readFileSync(join(__dirname, '..', 'stripeReconcile.service.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const reader = code.slice(code.indexOf('export async function pricesForUser'));

  it('asks Stripe for every subscription, not only ours', () => {
    expect(reader).toContain("status: 'all'");
    expect(reader).not.toMatch(/\.filter\(isOurPrice\)/);
  });

  /** Ours is LABELLED, not used as a filter — the caller sees both kinds. */
  it('labels our price rather than filtering by it', () => {
    expect(reader).toContain('is_our_price: isOurPrice(subscription)');
  });

  /**
   * ⚠️ AN EMPTY LIST MUST NOT READ AS „NOT PAYING". Three different empties
   * exist here — no customer at all, a customer with nothing, and a customer
   * with something we cannot see — and each carries its own sentence.
   */
  it('says in words what an empty answer means', () => {
    expect(code).toContain('const NOTHING_AT_ALL');
    expect(code).toContain('const ANOTHER_PRODUCT');
    expect(code).toContain('const NO_CUSTOMER');
    expect(reader).toContain('note: subscriptions.length === 0 ? NOTHING_AT_ALL : ANOTHER_PRODUCT');
  });

  it('answers the no-customer case without calling Stripe at all', () => {
    const noCustomer = reader.indexOf('found.customer_id === null');
    const stripeCall = reader.indexOf('stripeClient()');
    expect(noCustomer).toBeGreaterThan(-1);
    expect(stripeCall).toBeGreaterThan(noCustomer);
  });

  /** A read, and nothing else. The repair it informs still needs a yes. */
  it('writes nothing', () => {
    expect(reader).not.toContain('UPDATE ');
    expect(reader).not.toContain('INSERT ');
    expect(reader).not.toContain('DELETE ');
  });

  /** A billing record's id is not needed to answer "which price". */
  it('does not hand back the customer id', () => {
    const returned = reader.slice(reader.lastIndexOf('return {'));
    expect(returned).not.toContain('customer_id');
  });

  /** „No key" is its own answer and must not leave by the same door as „fine". */
  it('refuses with 503 when the server cannot read Stripe', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    const route = routes.slice(routes.indexOf("'/stripe/prices/:id'"));
    expect(route.slice(0, 1200)).toContain('isStripeConfigured()');
    expect(route.slice(0, 1200)).toContain('503');
  });
});
