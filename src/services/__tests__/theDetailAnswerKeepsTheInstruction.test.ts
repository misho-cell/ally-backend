jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  grantPermissionRefusal,
  instructionAwaitingItsDetail,
  ownerLineWithItsDetail,
  PlanConsentScreen,
  readPlanConsentScreen,
} from '../chat.service';
import { contactInstructionIn } from '../instructionUnsent';

/** D795 (prompt chat 65225, item 6): the detail answer must not lose the instruction's yes. */
describe('an instruction that waited for its day', () => {
  const lines = (...said: string[]) =>
    said.map((content, i) => ({ at: `2026-10-17T17:0${i}:00Z`, content }));

  it('is the yes once the owner gives the day', () => {
    const screen = readPlanConsentScreen(
      [],
      lines('სთხოვე ლევანს, მაგიდა დაგვიჯავშნოს', 'ხვალ 8 საათზე, 4 კაცი'),
    );
    expect(instructionAwaitingItsDetail(screen)).toEqual(['სთხოვე ლევანს, მაგიდა დაგვიჯავშნოს']);
    expect(grantPermissionRefusal(true, screen)).toBeNull();
  });

  it('is not borrowed from a line that was not such an instruction', () => {
    const screen = readPlanConsentScreen([], lines('ბუღალტერი მჭირდება', 'ხვალ 8 საათზე'));
    expect(instructionAwaitingItsDetail(screen)).toEqual([]);
    expect(grantPermissionRefusal(true, screen)?.reason).toBe('owner_did_not_say_so');
  });

  it('is not needed when the instruction already had its day', () => {
    const screen: PlanConsentScreen = {
      lastOwnerMessage: 'კარგი',
      newestOfferedChoices: null,
      ownerSaidSinceCard: [],
      labelsDealtAfterTheCard: [],
      previousOwnerMessage: 'სთხოვე ლევანს, ხვალ 8-ზე მაგიდა დაგვიჯავშნოს',
    };
    expect(instructionAwaitingItsDetail(screen)).toEqual([]);
  });
});

/** #6604 / #6365 (prompt chat box 70133): „ჰკითხე დავითს…" → „which Davit?" → „გამოგონილს". */
describe('an instruction whose person was asked about', () => {
  const lines = (...said: string[]) =>
    said.map((content, i) => ({ at: `2026-10-20T19:0${i}:00Z`, content }));

  it('is the yes once the owner answers which one', () => {
    const screen = readPlanConsentScreen(
      [],
      lines('ჰკითხე დავითს, ხომ არ იცნობს კარგ ბუღალტერს', 'გამოგონილს'),
    );
    expect(instructionAwaitingItsDetail(screen)).toEqual([
      'ჰკითხე დავითს, ხომ არ იცნობს კარგ ბუღალტერს',
    ]);
    expect(grantPermissionRefusal(true, screen)).toBeNull();
  });

  it('is not when the answer takes it back, holds it up, or asks something', () => {
    for (const answer of ['არა, ჯერ არ მისწერო', 'მოიცადე', 'რომელი დავითი?']) {
      const screen = readPlanConsentScreen(
        [],
        lines('ჰკითხე დავითს, ხომ არ იცნობს კარგ ბუღალტერს', answer),
      );
      expect(instructionAwaitingItsDetail(screen)).toEqual([]);
    }
  });

  it('is not when the answer is a long new message', () => {
    const screen = readPlanConsentScreen(
      [],
      lines(
        'ჰკითხე დავითს, ხომ არ იცნობს კარგ ბუღალტერს',
        'სხვათა შორის ხვალ ქალაქში ვიქნები და შეიძლება შევხვდე',
      ),
    );
    expect(instructionAwaitingItsDetail(screen)).toEqual([]);
  });
});

describe('the line the server sends from (65285, #1688)', () => {
  const lines = (...said: string[]) =>
    said.map((content, i) => ({ at: `2026-10-17T18:3${i}:00Z`, content }));

  it('is the instruction with its detail, so the ask goes instead of a plan', () => {
    const screen = readPlanConsentScreen(
      [],
      lines('სთხოვე გიორგის, მაგიდა დამიჯავშნოს.', 'შაბათს 20:00-ზე, 4 კაცი'),
    );
    expect(ownerLineWithItsDetail(screen)).toBe(
      'სთხოვე გიორგის, მაგიდა დამიჯავშნოს. შაბათს 20:00-ზე, 4 კაცი',
    );
  });

  it('is the last line alone otherwise', () => {
    const screen = readPlanConsentScreen([], lines('ბუღალტერი მჭირდება', 'თბილისში'));
    expect(ownerLineWithItsDetail(screen)).toBe('თბილისში');
  });

  it('is what both the plan guard and the server send read', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'const said = ownerLineWithItsDetail(await planConsentOnScreen(threadId));',
    );
    expect(chat).toContain('const outcome = await sendInstructedAsk(userId, threadId, ownerLine)');
  });
});

describe('the unsent-instruction guard after the detail answer (65408, #1688)', () => {
  const lines = (...said: string[]) =>
    said.map((content, i) => ({ at: `2026-10-17T19:4${i}:00Z`, content }));

  it('finds the instruction, so its note asks for the ask, not a plan', () => {
    const screen = readPlanConsentScreen(
      [],
      lines(
        'სთხოვე გიორგი მაისურაძეს, მაგიდა დამიჯავშნოს რესტორანში.',
        'რესტორანი „ბარბარესთან“, ამ შაბათს 20:00-ზე, 4 ადამიანზე.',
      ),
    );
    expect(contactInstructionIn(screen.lastOwnerMessage ?? '')).toBeNull();
    expect(contactInstructionIn(ownerLineWithItsDetail(screen))).not.toBeNull();
  });

  it('reads that line in the run', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      "await withTheInstructionItAnswers(threadId, runOwnerLine.get(runId) ?? ''),",
    );
  });
});
