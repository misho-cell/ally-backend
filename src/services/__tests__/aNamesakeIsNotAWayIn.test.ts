jest.mock('../tools/searchByTag', () => ({ __esModule: true, exactMatchesForMany: jest.fn() }));
jest.mock('../toolCallLog.service', () => ({
  __esModule: true,
  logToolCall: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../tools/webSearch', () => ({ __esModule: true, webSearch: jest.fn() }));
jest.mock('../tools/searchSecondDegree', () => ({
  __esModule: true,
  searchSecondDegree: jest.fn(),
}));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordFixedUsage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../searchQuery.service', () => ({
  __esModule: true,
  distilSearchQuery: jest.fn(),
  distilIntroductionLocally: jest.requireActual('../searchQuery.service').distilIntroductionLocally,
}));

import { exactMatchesForMany } from '../tools/searchByTag';
import { findWaysIn } from '../openingSearch.service';
import { rowsArePeople } from '../listItems.service';
import { sameSurname } from '../wayInName';

/**
 * The tester's 79366 (URGENT, a real member's list, 31 Oct): 334 rows were
 * „reached" through contacts who shared only the first name — „Nikoloz
 * Kevkhishvili" through „Nikoloz Papashvili", „Keta Pavlenishvili" through
 * „Keti Anesashvili". A person is the owner's contact only with the surname too.
 */
const mockMany = exactMatchesForMany as jest.MockedFunction<typeof exactMatchesForMany>;

function everyQueryFinds(name: string): void {
  mockMany.mockImplementation(
    async (_user, queries) => new Map(queries.map((q) => [q, { name, phone: '+995555000111' }])),
  );
}

beforeEach(() => mockMany.mockReset());

describe('a surname', () => {
  it('must be carried by the contact, in either script', () => {
    expect(sameSurname('Nikoloz Kevkhishvili', 'Nikoloz Papashvili')).toBe(false);
    expect(sameSurname('Eka Jajanidze', 'ეკა ჯაჯანიძე')).toBe(true);
    expect(sameSurname('Bank', 'anything')).toBe(true);
  });
});

describe('a person in the owner’s phonebook', () => {
  it('is not reached through a namesake with another surname', async () => {
    everyQueryFinds('Nikoloz Papashvili');
    const found = await findWaysIn('7', ['Nikoloz Kevkhishvili'], {}, undefined, {
      everyNameIsAPerson: true,
    });
    expect(found.get('Nikoloz Kevkhishvili')).toEqual({ kind: 'none' });
  });

  it('is reached through a contact with the same first name and surname', async () => {
    everyQueryFinds('ნიკოლოზ კევხიშვილი');
    const found = await findWaysIn('7', ['Nikoloz Kevkhishvili'], {}, undefined, {
      everyNameIsAPerson: true,
    });
    expect(found.get('Nikoloz Kevkhishvili')).toMatchObject({ kind: 'first_circle' });
  });

  it('is looked for by first name and surname even when the first name is unfamiliar', async () => {
    everyQueryFinds('Keti Anesashvili');
    const found = await findWaysIn('7', ['Keta Pavlenishvili'], {}, undefined, {
      everyNameIsAPerson: true,
    });
    expect(mockMany.mock.calls[0][1]).toEqual(['Keta Pavlenishvili']);
    expect(found.get('Keta Pavlenishvili')).toEqual({ kind: 'none' });
  });
});

describe('a person with an unfamiliar first name', () => {
  it('is not reached through a relative with the same surname', async () => {
    everyQueryFinds('Nino Pavlenishvili');
    const found = await findWaysIn('7', ['Keta Pavlenishvili'], {}, undefined, {
      everyNameIsAPerson: true,
    });
    expect(found.get('Keta Pavlenishvili')).toEqual({ kind: 'none' });
  });
});

describe('a list of people', () => {
  it('is one with a first-name and a last-name column', () => {
    expect(rowsArePeople(['First Name', 'Last Name', 'Company'])).toBe(true);
    expect(rowsArePeople(['Company', 'City'])).toBe(false);
  });
});
