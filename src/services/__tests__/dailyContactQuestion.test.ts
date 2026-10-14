jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import {
  asksAQuestion,
  contactQuestionMayRun,
  contactQuestionSection,
  RunPresence,
  whoWithLastDigits,
} from '../dailyContactQuestion';

const OPEN: RunPresence = {
  ownerPresent: true,
  regularThread: true,
  goalBound: false,
  preview: false,
};

/**
 * The tester's 58416 (a real owner, 14 Oct): the day's „სხვათა შორის, … სად
 * მუშაობს?" was tacked onto the answer to her question on a political topic.
 */
describe('the day’s contact question waits when the owner came with a question', () => {
  it('reads a question mark or a question word as the owner’s own question', () => {
    expect(asksAQuestion('ვინ არის საქართველოს პრემიერი?')).toBe(true);
    expect(asksAQuestion('რა აზრის ხარ ამ კანონზე')).toBe(true);
    expect(asksAQuestion('რამდენი ღირს')).toBe(true);
    expect(asksAQuestion('Who runs the ministry')).toBe(true);
  });

  it('does not read a plain line as a question', () => {
    expect(asksAQuestion('გამარჯობა')).toBe(false);
    expect(asksAQuestion('მადლობა, კარგად ვარ')).toBe(false);
    expect(asksAQuestion('რატი დღეს მოვიდა')).toBe(false);
    expect(asksAQuestion('Thanks, that helps')).toBe(false);
  });

  it('keeps the question back on such a line, and lets it run otherwise', () => {
    expect(contactQuestionMayRun({ ...OPEN, ownerAsksAQuestion: true })).toBe(false);
    expect(contactQuestionMayRun({ ...OPEN, ownerAsksAQuestion: false })).toBe(true);
  });
});

/** The tester's 58416; Misho's yes, 14 Oct: the owner can tell who is meant. */
describe('the day’s question names the contact with the number’s last two digits', () => {
  it('adds the last two digits to the name the owner saved', () => {
    expect(whoWithLastDigits('ნიკა', '+995 555 12 34 47')).toBe('ნიკა (ნომერი მთავრდება 47-ზე)');
  });

  it('carries them into the line the run is given', () => {
    const section = contactQuestionSection({
      kind: 'curiosity',
      task_id: null,
      phone: '+995555123447',
      payload: { who: 'ნიკა', missing_fact: 'employer' },
    });
    expect(section).toContain('„სხვათა შორის, ნიკა (ნომერი მთავრდება 47-ზე) სად მუშაობს?');
  });
});
