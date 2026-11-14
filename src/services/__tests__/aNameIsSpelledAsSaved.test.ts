jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';

import { query } from '../../db/postgres/client';
import { georgianScriptName, namePartOfLabel, sureGeorgianNameWords } from '../georgianScriptName';
import { withNamesSpelledAsKnown } from '../namesSpelledAsKnown';
import { forgetSurnameSpellings } from '../surnameSpelling';

const mockQuery = query as jest.MockedFunction<typeof query>;
const OWNER = '186272';

/** Nobody saved these numbers in Georgian, and the base settles no surname. */
function theBaseKnowsNothing(): void {
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
}

beforeEach(() => {
  mockQuery.mockReset();
  forgetSurnameSpellings();
  theBaseKnowsNothing();
});

/**
 * Misho, 14 Nov (screenshot): a contact saved „tornike abuladze" was written
 * „ტორნიკე" by the reply and „თორნიკე abuladze-ის" by the plan sentence.
 */
describe('a name saved in lower case', () => {
  it('has its surname in Georgian script too', () => {
    expect(georgianScriptName('tornike abuladze')).toBe('თორნიკე აბულაძე');
    expect(georgianScriptName('nino beridze')).toBe('ნინო ბერიძე');
  });

  it('keeps a lower-case word that is not a surname as written', () => {
    expect(georgianScriptName('levan mechanic')).toBe('ლევან mechanic');
    expect(georgianScriptName('nino media')).toBe('ნინო media');
  });

  it('gives its name part from a label', () => {
    expect(namePartOfLabel('tornike abuladze')).toBe('tornike abuladze');
  });
});

describe('the spellings the server is sure of', () => {
  it('are a listed first name and a surname the rule reads one way only', async () => {
    expect(await sureGeorgianNameWords(OWNER, ['tornike abuladze'])).toEqual([
      'თორნიკე',
      'აბულაძე',
    ]);
  });

  it('leave out a surname the rule could read two ways', async () => {
    expect(await sureGeorgianNameWords(OWNER, ['Giorgi Turashvili'])).toEqual(['გიორგი']);
  });

  it('take a Georgian label as the owner saved it', async () => {
    expect(await sureGeorgianNameWords(OWNER, ['ბესო ორთოიძე'])).toEqual(['ბესო', 'ორთოიძე']);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('take the spelling other members saved for that number', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ label: 'Giorgi Turashvili', georgian: 'გიორგი ტურაშვილი', n: 4 }],
      rowCount: 1,
    } as never);
    expect(await sureGeorgianNameWords(OWNER, ['Giorgi Turashvili'])).toEqual([
      'გიორგი',
      'ტურაშვილი',
    ]);
  });
});

describe('a reply naming someone', () => {
  const sure = ['თორნიკე', 'აბულაძე', 'ბესო', 'ორთოიძე'];

  it('spells the name as the server is sure of, in every case', () => {
    expect(
      withNamesSpelledAsKnown(
        'ტორნიკეს ასისტენტს დაველაპარაკები, რომ ტორნიკემ გირჩიოს თამადა.',
        sure,
      ),
    ).toBe('თორნიკეს ასისტენტს დაველაპარაკები, რომ თორნიკემ გირჩიოს თამადა.');
  });

  it('leaves every other word alone, and a name already right', () => {
    const text = 'ბესო ორთოიძის ასისტენტს ვკითხავ, თორნიკე კი უარს მეტყვის.';
    expect(withNamesSpelledAsKnown(text, sure)).toBe(text);
  });

  it('changes nothing with no sure spelling, or a short one', () => {
    expect(withNamesSpelledAsKnown('ტორნიკეს ვკითხავ.', [])).toBe('ტორნიკეს ვკითხავ.');
    expect(withNamesSpelledAsKnown('ტატოს ვკითხავ.', ['თათ'])).toBe('ტატოს ვკითხავ.');
  });

  it('is applied to the Georgian reply with the names the run found or wrote to', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'effectiveFinal = withNamesSpelledAsKnown(\n      effectiveFinal,\n      await sureSpellingsForRun(userId, runId),\n    );',
    );
    expect(chat).toContain('...(runAskSentTo.get(runId) ?? []),');
  });
});
