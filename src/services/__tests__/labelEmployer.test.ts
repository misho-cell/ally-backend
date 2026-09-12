jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { rolesFromLabels } from '../tools/labelEmployer';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * The only DB read this module makes is the crowd size of each word it does
 * not already know. These are the numbers counted live on 12 September.
 */
const LIVE_SIZES: Record<string, number> = {
  tbc: 6369,
  capital: 375,
  insurance: 441,
  bank: 8580,
  mehmeti: 2,
};

function sizesFromLive(): void {
  mockQuery.mockImplementation((_sql: string, params?: unknown[]) => {
    const words = (params?.[0] ?? []) as string[];
    const data = words
      .filter((w) => LIVE_SIZES[w] !== undefined)
      .map((w) => ({ word: w, org_size: String(LIVE_SIZES[w]) }));
    return Promise.resolve({ rows: data, rowCount: data.length } as never);
  });
}

const NO_FACTS = { hasEmployer: false, hasTitle: false };

beforeEach(() => {
  jest.resetAllMocks();
  sizesFromLive();
});

describe('the company word is lifted out of the label', () => {
  it('answers the founder’s three live rows, name words dropped', async () => {
    const roles = await rolesFromLabels([
      { label: 'მერი ჩაჩანიძე TBC Capital', ...NO_FACTS },
      { label: 'ოთარი TBC Insurance', ...NO_FACTS },
      { label: 'Luka TBC Insurance', ...NO_FACTS },
    ]);

    expect(roles.get('მერი ჩაჩანიძე TBC Capital')?.employer).toBe('TBC Capital');
    expect(roles.get('ოთარი TBC Insurance')?.employer).toBe('TBC Insurance');
    expect(roles.get('Luka TBC Insurance')?.employer).toBe('TBC Insurance');
  });

  it('keeps the spelling the saver typed, not the folded one', async () => {
    const roles = await rolesFromLabels([{ label: 'Luka TBC Insurance', ...NO_FACTS }]);
    expect(roles.get('Luka TBC Insurance')?.employer).not.toContain('tbc');
  });

  it('never lets a word the crowd does not carry become an employer', async () => {
    // „mehmeti" is a name this base's Georgian list happens not to hold, so the
    // classifier calls it an organisation. Two phones carry it; 40 are needed.
    const roles = await rolesFromLabels([{ label: 'Mehmeti Bank', ...NO_FACTS }]);
    expect(roles.get('Mehmeti Bank')?.employer).toBe('Bank');
  });

  it('leaves a label that is only a name alone', async () => {
    const roles = await rolesFromLabels([{ label: 'გიორგი აბულაძე', ...NO_FACTS }]);
    expect(roles.get('გიორგი აბულაძე')).toBeUndefined();
  });
});

describe('the trade word becomes the title, never the employer', () => {
  it('reads ელექტრიკოსი as a title', async () => {
    const roles = await rolesFromLabels([{ label: 'დათო ელექტრიკოსი', ...NO_FACTS }]);
    expect(roles.get('დათო ელექტრიკოსი')).toEqual({ title: 'ელექტრიკოსი' });
  });

  it('reads a profession with clients the same way', async () => {
    const roles = await rolesFromLabels([{ label: 'ნინო ადვოკატი', ...NO_FACTS }]);
    expect(roles.get('ნინო ადვოკატი')?.title).toBe('ადვოკატი');
  });
});

describe('only the company or trade word travels', () => {
  it('drops the town, the relation and the bare title', async () => {
    const labels = ['გიორგი ბათუმი', 'თორნიკე მეზობელი', 'ლევანი დირექტორი'];
    const roles = await rolesFromLabels(labels.map((label) => ({ label, ...NO_FACTS })));
    for (const label of labels) expect(roles.get(label)).toBeUndefined();
  });

  it('never reaches past the company word into the rest of the label', async () => {
    const label = 'ნიკა ბათუმი TBC მეზობელი';
    const roles = await rolesFromLabels([{ label, ...NO_FACTS }]);
    expect(roles.get(label)?.employer).toBe('TBC');
  });
});

describe('a confirmed fact always wins', () => {
  it('does not touch a row that already has both', async () => {
    const roles = await rolesFromLabels([
      { label: 'მერი ჩაჩანიძე TBC Capital', hasEmployer: true, hasTitle: true },
    ]);
    expect(roles.size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('fills only the empty half', async () => {
    const roles = await rolesFromLabels([
      { label: 'დათო ელექტრიკოსი TBC', hasEmployer: true, hasTitle: false },
    ]);
    expect(roles.get('დათო ელექტრიკოსი TBC')).toEqual({ title: 'ელექტრიკოსი' });
  });
});

describe('when the count cannot be read', () => {
  it('drops every word that needed it and keeps the row empty', async () => {
    mockQuery.mockRejectedValue(new Error('statement timeout'));
    const roles = await rolesFromLabels([{ label: 'Luka TBC Insurance', ...NO_FACTS }]);
    expect(roles.get('Luka TBC Insurance')).toBeUndefined();
  });

  it('still answers from the dictionary alone', async () => {
    mockQuery.mockRejectedValue(new Error('statement timeout'));
    const roles = await rolesFromLabels([{ label: 'ნინო ახალგაზრდული ასოციაცია', ...NO_FACTS }]);
    expect(roles.get('ნინო ახალგაზრდული ასოციაცია')?.employer).toContain('ასოციაცია');
  });
});

describe('nothing to read', () => {
  it('asks the database nothing when no row needs it', async () => {
    expect((await rolesFromLabels([])).size).toBe(0);
    expect((await rolesFromLabels([{ label: null, ...NO_FACTS }])).size).toBe(0);
    expect((await rolesFromLabels([{ label: '  ', ...NO_FACTS }])).size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
