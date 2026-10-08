import { readFileSync } from 'fs';
import { join } from 'path';
import { asksWhatWaits, contactQuestionMayRun } from '../dailyContactQuestion';

/** 3367 (the tester's 47065, conv 45693): „რა მელოდება?" got only the day's side question. */
const PRESENT = { ownerPresent: true, regularThread: true, goalBound: false, preview: false };

describe('asking what waits gets no side question', () => {
  it.each(['რა მელოდება? ვინმე მეკითხება რამეს?', 'რა არის ახალი?', "What's new?", 'Что нового?'])(
    '„%s" asks what waits',
    (line) => {
      expect(asksWhatWaits(line)).toBe(true);
    },
  );

  it('an ordinary line does not', () => {
    expect(asksWhatWaits('მჭირდება სანტექნიკოსი')).toBe(false);
  });

  it('the day’s question stays away from that run', () => {
    expect(contactQuestionMayRun({ ...PRESENT, ownerAsksWhatWaits: true })).toBe(false);
    expect(contactQuestionMayRun(PRESENT)).toBe(true);
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('ownerAsksWhatWaits: asksWhatWaits(ownerLine),');
  });
});
