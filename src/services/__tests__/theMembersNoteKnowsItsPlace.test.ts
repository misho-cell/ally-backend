import { readFileSync } from 'fs';
import { join } from 'path';
import { GoalState, membersNoteOutOfPlace } from '../membersNoteScope';

const OPEN_NO_PLAN: GoalState = { text: 'კარგი სანტექნიკი მჭირდება', hasPlan: false, open: true };

/** 2908 (the master test run's 45679): the members note on turns that are not its own. */
describe('the members note', () => {
  it('still fires on the first answer to a need, even when nothing was found (#960)', () => {
    expect(
      membersNoteOutOfPlace(
        'სანტექნიკი მჭირდება',
        'კონტაქტებში სანტექნიკი ვერ ვიპოვე.',
        OPEN_NO_PLAN,
      ),
    ).toBe(false);
    expect(membersNoteOutOfPlace('I need a plumber', 'No plumber is saved.', null)).toBe(false);
  });

  it('stays out when the owner said to write to nobody', () => {
    const line = 'კარგი მასაჟისტი მჭირდება ვაკეში. ოღონდ არავის მისწერო.';
    expect(membersNoteOutOfPlace(line, 'ვეძებ.', OPEN_NO_PLAN)).toBe(true);
    expect(membersNoteOutOfPlace('რა ხდება?', 'ვეძებ.', { ...OPEN_NO_PLAN, text: line })).toBe(
      true,
    );
  });

  it('stays out on follow-up and status questions', () => {
    expect(membersNoteOutOfPlace('რატომ სწორედ ამ ადამიანებს ეკითხები?', '…', OPEN_NO_PLAN)).toBe(
      true,
    );
    expect(membersNoteOutOfPlace('რა არის ახალი?', '…', OPEN_NO_PLAN)).toBe(true);
    expect(membersNoteOutOfPlace("What's new?", '…', OPEN_NO_PLAN)).toBe(true);
  });

  it('stays out once the goal has a plan, or is closed', () => {
    expect(membersNoteOutOfPlace('კარგი', '…', { ...OPEN_NO_PLAN, hasPlan: true })).toBe(true);
    expect(membersNoteOutOfPlace('მადლობა', '…', { ...OPEN_NO_PLAN, open: false })).toBe(true);
  });

  it('stays out when the reply already says nobody fits', () => {
    expect(
      membersNoteOutOfPlace(
        'ეკლესიის ორღანისტი მჭირდება',
        'შენს სამ კონტაქტში ამ საქმისთვის შესაფერისი ადამიანი ვერ გამოვყავი.',
        OPEN_NO_PLAN,
      ),
    ).toBe(true);
  });

  it('gates both members notes in the run', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat.match(/\(await membersNoteFits\(\)\)/gu)).toHaveLength(2);
  });
});

describe('a closing turn is a closing turn by its words (RW-012 B, goal 20759)', () => {
  it.each([
    'ეს მოგვარდა, დახურე.',
    'ვხურავ დანარჩენ კითხვებს',
    'მოგვარდა, მადლობა.',
    'Solved, close it',
  ])('„%s" gets no members note, even while the goal is still open', (line) => {
    expect(
      membersNoteOutOfPlace(line, 'მოგვარებულია.', {
        text: 'ბუღალტერი',
        hasPlan: false,
        open: true,
      }),
    ).toBe(true);
  });

  it('a run that called finish_task never gets the note', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain("if (toolNamesUsed.includes('finish_task')) return false;");
  });
});
