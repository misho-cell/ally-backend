import { renewalDay, nextRenewalDay } from '../renewalDay';
import { budgetWindow } from '../budgetWindow';

/**
 * D494 — „tell the user to top up OR wait for the refill, WITH THE DAY."
 * The founder, 25 September, on row 271/270.
 *
 * The refusal already offered two ways out and dated neither: „top up, or wait
 * for the monthly renewal". Waiting is the free one, and somebody who cannot
 * tell whether the wait is ten minutes or three weeks has not been offered it
 * — they have been told to pay, politely.
 *
 * ⚠️ THE MONTH NAMES ARE A TABLE IN THE SOURCE AND NOT `Intl`, and tonight is
 * the reason. `Intl.DateTimeFormat('ka-GE')` gives Georgian months on a Node
 * built with full ICU and ENGLISH ones on small-icu — silently, because a
 * missing locale falls back instead of throwing. That is the same shape as the
 * `File` global that failed on the first real speech call a few hours earlier:
 * right here, absent there, and no test can see the difference. These tests
 * would pass against `Intl` on this machine and the product would speak
 * English to Georgians in production.
 */
const SEPTEMBER_28 = new Date(Date.UTC(2026, 8, 28)); // a Monday
const OCTOBER_1 = new Date(Date.UTC(2026, 9, 1)); // a Thursday

describe('the day is said in the reader’s own language', () => {
  it('writes a Georgian date in Georgian', () => {
    const said = renewalDay('ka', SEPTEMBER_28);

    expect(said).toBe('ორშაბათს, 28 სექტემბერს');
    expect(said).not.toMatch(/[a-z]/i);
  });

  it('writes the other three the way each is read', () => {
    expect(renewalDay('en', SEPTEMBER_28)).toBe('Monday 28 September');
    expect(renewalDay('ru', SEPTEMBER_28)).toBe('в понедельник, 28 сентября');
    expect(renewalDay('es', SEPTEMBER_28)).toBe('el lunes 28 de septiembre');
  });

  /** The dative is the difference between „Monday" and „on Monday". */
  it('puts the Georgian words in the case the sentence needs', () => {
    expect(renewalDay('ka', OCTOBER_1)).toBe('ხუთშაბათს, 1 ოქტომბერს');
  });

  /** Every month has a name in every language — a gap here is a blank date. */
  it('has all twelve months in all four languages', () => {
    for (let month = 0; month < 12; month += 1) {
      for (const language of ['ka', 'en', 'ru', 'es'] as const) {
        const said = renewalDay(language, new Date(Date.UTC(2026, month, 15)));

        expect(said).toMatch(/15/);
        expect(said).not.toMatch(/undefined/);
      }
    }
  });
});

/**
 * The date has to be the one the LEDGER will actually act on. The grant is
 * written against `date_trunc(...) + INTERVAL '1 …'` in Postgres, so this is
 * the same arithmetic done in UTC — if the two ever disagree, the product
 * names a day on which nothing happens.
 */
describe('it is the day the allowance really returns', () => {
  afterEach(() => {
    delete process.env.BUDGET_WINDOW;
  });

  it('is the first of next month while the window is the month', () => {
    delete process.env.BUDGET_WINDOW;

    expect(budgetWindow().nextReset(new Date(Date.UTC(2026, 8, 25, 22, 30)))).toEqual(
      new Date(Date.UTC(2026, 9, 1)),
    );
    // December rolls the year, which is the one arithmetic that has a corner.
    expect(budgetWindow().nextReset(new Date(Date.UTC(2026, 11, 31, 23, 59)))).toEqual(
      new Date(Date.UTC(2027, 0, 1)),
    );
  });

  it('is the coming Monday once the window is the week (D124)', () => {
    process.env.BUDGET_WINDOW = 'week';

    // Friday 25 September 2026 -> Monday the 28th.
    expect(budgetWindow().nextReset(new Date(Date.UTC(2026, 8, 25, 22, 30)))).toEqual(
      new Date(Date.UTC(2026, 8, 28)),
    );
    // ⚠️ Sunday belongs to the week that began six days EARLIER, exactly as
    // date_trunc('week') reads it — so its next reset is tomorrow, and an
    // `8 - day` that forgot Sunday would name a Monday eight days out.
    expect(budgetWindow().nextReset(new Date(Date.UTC(2026, 8, 27, 12, 0)))).toEqual(
      new Date(Date.UTC(2026, 8, 28)),
    );
    // A Monday is not its own reset day — the week that starts today runs on.
    expect(budgetWindow().nextReset(new Date(Date.UTC(2026, 8, 28, 9, 0)))).toEqual(
      new Date(Date.UTC(2026, 9, 5)),
    );
  });

  it('says a real date whatever today is', () => {
    expect(nextRenewalDay('ka')).toMatch(/\d{1,2}/);
    expect(nextRenewalDay('en')).toMatch(/\d{1,2}/);
  });
});
