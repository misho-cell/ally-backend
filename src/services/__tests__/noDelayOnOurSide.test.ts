import { readFileSync } from 'fs';
import { join } from 'path';
import { CHECKING_LINE, withoutOurSideApology } from '../ourSideApology';

/**
 * Misho, 29 Oct (Giorgi's thread 74052): „a delay on our side" is replaced with
 * one true line — we are looking into it and will write.
 */
describe('a reply that blames our side (Misho, 29 Oct)', () => {
  it('says the checking line instead, once, and keeps the rest', () => {
    const giorgi =
      'თორნიკე აბულაძის ასისტენტთან კითხვა ისევ ვერ გაიგზავნა ჩვენს მხარეს შეფერხების გამო. ' +
      'შენი თანხმობა უკვე ნათელია, ხელახლა დადასტურება არ გჭირდება.\n\n' +
      'ჩვენს მხარეს შეფერხებაა, ბოდიში.';
    expect(withoutOurSideApology(giorgi, 'ka')).toBe(
      `${CHECKING_LINE.ka} შენი თანხმობა უკვე ნათელია, ხელახლა დადასტურება არ გჭირდება.`,
    );
  });

  it('leaves every other reply untouched, and works in English', () => {
    expect(withoutOurSideApology('ლიკას მივწერე.', 'ka')).toBe('ლიკას მივწერე.');
    expect(withoutOurSideApology('Something went wrong on our side. Lika has it.', 'en')).toBe(
      `${CHECKING_LINE.en} Lika has it.`,
    );
  });

  it('runs on every final reply, and the run watch still finds the case', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const scrub = chat.slice(chat.indexOf('export function scrubFinal('));
    expect(scrub.slice(0, scrub.indexOf('\n}\n'))).toContain('withoutOurSideApology(');
    const watch = readFileSync(join(__dirname, '..', 'runAlerts.service.ts'), 'utf8');
    expect(watch).toContain(CHECKING_LINE.ka.replace(/\.$/u, ''));
  });
});
