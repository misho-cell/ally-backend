/**
 * Plate v301 G5, second half: the person a mediator recommended got the
 * asker's first request word for word. The opening now says who recommended
 * them.
 */
jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  query: jest.fn(),
  __esModule: true,
}));

import { query } from '../../db/postgres/client';
import { namePartsToMatch, recommendedByLine, recommenderFor } from '../recommendedBy';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => mockQuery.mockReset());

describe('recommenderFor', () => {
  it('names who answered with this person', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ name: 'Netai Test 156' }] } as never);

    expect(await recommenderFor(13069, 173690, 'Dato Beridze')).toBe('Netai Test 156');
    expect(mockQuery.mock.calls[0]?.[1]).toEqual([13069, 173690, ['Dato Beridze', 'Dato']]);
  });

  it('is null when nobody on the goal named them', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    expect(await recommenderFor(13069, 173690, 'Dato Beridze')).toBeNull();
  });

  it('is null, not an error, when the read fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout'));

    expect(await recommenderFor(13069, 173690, 'Dato Beridze')).toBeNull();
  });

  it('asks nothing for a name too short to match safely', async () => {
    expect(await recommenderFor(13069, 173690, 'Al')).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('the line', () => {
  it('says who recommended them, in each language', () => {
    expect(recommendedByLine('en', 'Nino')).toBe('Nino recommended you for this.');
    expect(recommendedByLine('ka', 'ნინო')).toContain('დაგასახელა');
    expect(recommendedByLine('ru', 'Nino')).toContain('Nino');
    expect(recommendedByLine('es', 'Nino')).toContain('Nino');
  });

  it('matches on the full name and the first name', () => {
    expect(namePartsToMatch(' Dato Beridze ')).toEqual(['Dato Beridze', 'Dato']);
    expect(namePartsToMatch('Nino')).toEqual(['Nino']);
  });
});
