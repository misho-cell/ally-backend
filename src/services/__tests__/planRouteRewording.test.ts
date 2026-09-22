import { parsePlan } from '../taskPlans.service';

/**
 * Ticket 20 row 244 — a RE-WORDED route name is neither the same string nor
 * one inside the other, and that is what was still being refused.
 *
 * The seat's twenty-question run on account 501, 22 September: 6 of 21
 * `propose_task_plan` calls refused, 5 of them here, each costing a retry.
 * Every case below is one of those five, read back verbatim from the
 * `error_text` column — which exists because a refusal that does not say what
 * was rejected leaves the model diffing its own call against a list.
 *
 * The model is not inventing a route. It is naming the one it declared and
 * folding the particular person into it.
 */
const person = (name: string, route: string): Record<string, unknown> => ({
  name,
  phone: '+995555123456',
  route,
});

function routeChosenFor(
  routeNames: readonly string[],
  said: string,
): { ok: true; route: string } | { ok: false; error: string } {
  const out = parsePlan({
    solved_when: 'დასრულებულია',
    routes: routeNames.map((name) => ({ name, status: 'running' })),
    people_to_involve: [person('ვინმე', said)],
  });
  return out.ok
    ? { ok: true, route: out.value.people_to_involve[0].route }
    : { ok: false, error: out.error };
}

describe('the five refusals of 22 September', () => {
  it('„the second circle - a nudge to Gogi" is the second-circle route', () => {
    expect(
      routeChosenFor(
        ['მეორე წრე (ბიძგები)', 'საკუთარი ქსელი', 'ვები'],
        'მეორე წრე - ბიძგი "Gogi - Carpenter"-თან',
      ),
    ).toEqual({ ok: true, route: 'მეორე წრე (ბიძგები)' });
  });

  it('a route name with five people’s names folded into it still resolves', () => {
    expect(
      routeChosenFor(
        [
          'მეორე წრის ბმულები (წევრი კონტაქტების გავლით)',
          'საკუთარ ქსელში ნაპოვნი არქიტექტორები (მოწვევა, ვინაიდან წევრები არ არიან)',
          'ვები — თბილისის არქიტექტურული ბიუროები',
        ],
        'მეორე წრის ბმულები — იცნობს რამდენიმე არქიტექტორს (გაბუნია, კახა, ლექსო, სოფიო, თეკლა)',
      ),
    ).toEqual({ ok: true, route: 'მეორე წრის ბმულები (წევრი კონტაქტების გავლით)' });
  });

  /**
   * „ხიდი" against „ხიდები" shares no whole word at all. With the case ending
   * off it shares the one word that decides it — which is why the comparison
   * is stemmed and not merely split.
   */
  it('„a bridge to Levani" is the bridges route, once the case ending is off', () => {
    expect(
      routeChosenFor(
        [
          'პირდაპირი კონტაქტები, თავად მათემატიკოსები',
          'second-degree ხიდები, მეგობრების შენახული რეპეტიტორები',
        ],
        'ხიდი Levani Matematika-სთან',
      ),
    ).toEqual({ ok: true, route: 'second-degree ხიდები, მეგობრების შენახული რეპეტიტორები' });
  });

  it('„a direct candidate, his own agency" is the direct-contacts route', () => {
    expect(
      routeChosenFor(
        [
          'პირდაპირი კონტაქტები, ვინც თავად აკეთებს ვებ დეველოპმენტს',
          'მეორე წრე ბმულებით (Givi Beridze, Ia Modebadze)',
          'ღია ვები (კონკრეტული კომპანია/პროფესიონალი)',
        ],
        'პირდაპირი კანდიდატი, საკუთარი დიჯიტალ სააგენტო (Leavingstone) - web & app dev',
      ),
    ).toEqual({ ok: true, route: 'პირდაპირი კონტაქტები, ვინც თავად აკეთებს ვებ დეველოპმენტს' });
  });

  /**
   * THE FIFTH IS STILL REFUSED, AND THAT IS THE RULE WORKING.
   *
   * „მეორე წრე - ვები/გრაფიკული დიზაინერები" against three routes that between
   * them own „ვები", „გრაფიკული" and „მეორე წრე". Two of them share as much as
   * each other, so nothing in the string says which road this person is on,
   * and guessing would attach a real person to a route the owner did not put
   * them on — which the ask path then enforces.
   */
  it('refuses the one that genuinely does not say, rather than guessing', () => {
    const out = routeChosenFor(
      [
        'საკუთარი კონტაქტები (ინტერიერი/ვები-UX-UI/გრაფიკული)',
        'ვები ძიება ზოგადად "დიზაინერი"',
        'მეორე წრე სამი თბილი ბმულის გავლით',
      ],
      'მეორე წრე - ვები/გრაფიკული დიზაინერები',
    );

    expect(out.ok).toBe(false);
  });
});

/**
 * What the relaxation must NOT do. A route is a promise about who gets
 * contacted for what, and the loosest of these rules is still a guess if it
 * has no clear winner.
 */
describe('and the guard is still a guard', () => {
  it('a route nobody declared is still refused', () => {
    const out = routeChosenFor(['ვები', 'მეორე წრე'], 'ტელეფონით დარეკვა');

    expect(out.ok).toBe(false);
  });

  it('a tie between two routes is a refusal, exactly as none is', () => {
    const out = routeChosenFor(['პირდაპირი კონტაქტები ვები', 'მეორე წრე ვები'], 'ვები');

    expect(out.ok).toBe(false);
  });

  it('one shared word is enough when only one route has it', () => {
    expect(routeChosenFor(['ვები ძიება', 'მეორე წრე'], 'ვები')).toEqual({
      ok: true,
      route: 'ვები ძიება',
    });
  });

  /**
   * Two-letter words are not evidence. „და" and „არ" appear in half of all
   * Georgian prose, and a route chosen on one of them is chosen on nothing.
   *
   * The said string here is not contained in either route, so the older
   * containment rule cannot answer it and this one has to — and the only word
   * the two share is the one too short to count.
   */
  it('a word too short to mean anything does not decide a route', () => {
    const out = routeChosenFor(['ვები და ძიება', 'მეორე წრე'], 'და სხვა რამ');

    expect(out.ok).toBe(false);
  });

  /** The exact match, and the single-route shortcut, both still come first. */
  it('an exact name still wins outright', () => {
    expect(routeChosenFor(['მეორე წრე (ბიძგები)', 'ვები'], 'მეორე წრე (ბიძგები)')).toEqual({
      ok: true,
      route: 'მეორე წრე (ბიძგები)',
    });
  });

  it('a one-route plan needs no naming at all', () => {
    expect(routeChosenFor(['ვები'], 'რაღაც სულ სხვა')).toEqual({ ok: true, route: 'ვები' });
  });
});
