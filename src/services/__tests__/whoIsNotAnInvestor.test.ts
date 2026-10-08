jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../block.service', () => ({ getExcludedPhones: jest.fn() }));
jest.mock('../tools/searchByTag', () => ({ exactMatchesWithPhones: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { getExcludedPhones } from '../block.service';
import { contactsNotTagged, negatedTerm, notTaggedAnswer } from '../notTagged';
import { exactMatchesWithPhones } from '../tools/searchByTag';

/**
 * 3170 (SE-031 step 3, seat 179960): „ვინ მყავს ისეთი, ვინც ინვესტორი არ არის
 * და საკუთარ ფულს არასდროს დებს?" named nobody, twice.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockExcluded = getExcludedPhones as jest.MockedFunction<typeof getExcludedPhones>;
const mockMatches = exactMatchesWithPhones as jest.MockedFunction<typeof exactMatchesWithPhones>;

const TAGGED = [
  { phone: '+441174960001', name: 'გია ტესტური', tags: ['ინვესტორი'] },
  { phone: '+441174960002', name: 'დათო ტესტური', tags: ['ელექტრიკოსი'] },
  { phone: '+441174960003', name: 'ეკა ტესტური', tags: ['იურისტი', 'ნოტარიუსი'] },
  { phone: '+441174960004', name: 'ზაზა ტესტური', tags: ['investori'] },
  { phone: '+441174960005', name: 'თეა ტესტური', tags: ['ინვესტორების კლუბი'] },
  { phone: '+441174960006', name: 'ია ტესტური', tags: ['სანტექნიკოსი'] },
  { phone: '+441174960007', name: 'კახა ტესტური', tags: ['ფოტოგრაფი'] },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: TAGGED, rowCount: TAGGED.length } as never);
  mockExcluded.mockResolvedValue([]);
  mockMatches.mockResolvedValue([
    { phone: '+441174960001', name: 'გია ტესტური' },
    { phone: '+441174960004', name: 'ზაზა ტესტური' },
  ]);
});

describe('the question', () => {
  it('finds the negated word', () => {
    expect(
      negatedTerm('ვინ მყავს ისეთი, ვინც ინვესტორი არ არის და საკუთარ ფულს არასდროს დებს?'),
    ).toBe('ინვესტორი');
    expect(negatedTerm('ვინ არ არის ინვესტორი?')).toBe('ინვესტორი');
    expect(negatedTerm('Who is not an investor?')).toBe('investor');
    expect(negatedTerm("Who isn't a lawyer?")).toBe('lawyer');
  });

  it('leaves every other line alone', () => {
    expect(negatedTerm('ვინ მყავს ინვესტორი?')).toBeNull();
    expect(negatedTerm('ის არ არის ინვესტორი')).toBeNull();
    expect(negatedTerm('Who is an investor?')).toBeNull();
  });
});

describe('the people', () => {
  it('names three who are not, none the search finds, none tagged with the word', async () => {
    const people = await contactsNotTagged('179960', 'ინვესტორი');
    expect(people).toEqual([
      { name: 'დათო ტესტური', tags: ['ელექტრიკოსი'] },
      { name: 'ეკა ტესტური', tags: ['იურისტი', 'ნოტარიუსი'] },
      { name: 'ია ტესტური', tags: ['სანტექნიკოსი'] },
    ]);
  });

  it('leaves out the owner’s excluded people', async () => {
    mockExcluded.mockResolvedValue(['+441174960002']);
    const people = await contactsNotTagged('179960', 'ინვესტორი');
    expect(people.map((p) => p.name)).not.toContain('დათო ტესტური');
  });

  it('answers nothing for a word nobody is saved as', async () => {
    mockMatches.mockResolvedValue([]);
    expect(await contactsNotTagged('179960', 'ხელმისაწვდომი')).toEqual([]);
  });

  it('reads the owner’s own tags, with a limit and a timeout', async () => {
    await contactsNotTagged('179960', 'ინვესტორი');
    const call = mockQuery.mock.calls[0] as unknown[];
    expect(call[0]).toContain('WHERE ut."contactId" = $1');
    expect(call[1]).toEqual(['179960', 200]);
    expect(call[2]).toBe(6_000);
  });
});

describe('the answer', () => {
  it('says who, with what they are saved as', () => {
    expect(
      notTaggedAnswer(
        'ინვესტორი',
        [
          { name: 'დათო ტესტური', tags: ['ელექტრიკოსი'] },
          { name: 'ეკა ტესტური', tags: ['იურისტი', 'ნოტარიუსი'] },
        ],
        'ka',
      ),
    ).toBe(
      'ამ ხალხთან „ინვესტორი" შენახული არ გაქვს:\n• დათო ტესტური — ელექტრიკოსი\n• ეკა ტესტური — იურისტი, ნოტარიუსი',
    );
  });

  it('runs before the model, in an ordinary conversation the owner started', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const at = chat.indexOf('if (nonMember !== null) return nonMember;');
    const after = chat.slice(at, at + 600);
    expect(after).toContain("!ownerAbsent && thread.type === 'regular'");
    expect(after).toContain('await answerNotTagged(userId, threadId, userMessage, runId, intent)');
    expect(after.indexOf('answerNotTagged')).toBeLessThan(
      chat.slice(at).indexOf('ensureGoalForRequest('),
    );
  });
});
