import { fieldFits, placeFits, placesIn, withoutPlaces } from '../fieldPlaces';
import { isSureMatch } from '../needsOffers.service';

jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

/** 1699 part 3 (A16): the board's example is one match — a hotel in Kobuleti and hospitality in Adjara. */
const offerOf = (field: string): { id: number; user_id: number; text: string; field: string } => ({
  id: 5,
  user_id: 20,
  text: 'open to it',
  field,
});
const goalOf = (title: string): { id: number; user_id: number; title: string } => ({
  id: 1,
  user_id: 10,
  title,
});

describe('a field family and a place map', () => {
  it('match the board’s example, in both scripts', () => {
    expect(
      isSureMatch(
        goalOf('find an investor for a hotel in Kobuleti'),
        offerOf('hospitality in Adjara'),
      ),
    ).toBe(true);
    expect(
      isSureMatch(goalOf('ქობულეთში სასტუმროს ვხსნი'), offerOf('სტუმართმასპინძლობა აჭარაში')),
    ).toBe(true);
    expect(isSureMatch(goalOf('სასტუმრო ბათუმში'), offerOf('hospitality in Adjara'))).toBe(true);
  });

  it('a town in the offer needs that town, in either script', () => {
    expect(placeFits('hotel in ბათუმში', 'hospitality in Batumi')).toBe(true);
    expect(placeFits('hotel in Kobuleti', 'hospitality in Batumi')).toBe(false);
  });

  it('a different region, or no place at all, is not a sure match for a placed offer', () => {
    expect(isSureMatch(goalOf('a hotel in Telavi'), offerOf('hospitality in Adjara'))).toBe(false);
    expect(isSureMatch(goalOf('a hotel'), offerOf('hospitality in Adjara'))).toBe(false);
  });

  it('an offer with no place fits a goal anywhere', () => {
    expect(isSureMatch(goalOf('a hotel in Telavi'), offerOf('hospitality'))).toBe(true);
  });

  it('no longer matches on the place alone (part 1 did)', () => {
    expect(isSureMatch(goalOf('a lawyer in Batumi'), offerOf('hospitality in Batumi'))).toBe(false);
    expect(fieldFits('a lawyer in Batumi', 'hospitality in Batumi')).toBe(false);
  });

  it('reads places as words, not inside other words', () => {
    expect(placesIn('ფოთოლი').regions.size).toBe(0);
    expect([...placesIn('ფოთში ვცხოვრობ').regions]).toEqual(['samegrelo']);
    expect(withoutPlaces('hospitality in Adjara')).toBe('hospitality in');
  });
});
