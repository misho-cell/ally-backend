import { readFileSync } from 'fs';
import { join } from 'path';
import { savedNamesIn, withNamesAsSaved } from '../savedNames';

/** 3169 (seat 179960): names came back in the other alphabet. */
const NAMES = savedNamesIn({
  results: [
    { name: 'Dato Testadze', saved_as: 'Dato Testadze' },
    { name: 'Mike Sample', saved_as: 'Mike Sample' },
    { name: 'Temo Eleqtrikosi', saved_as: null },
    { name: 'ანა საცდელიძე', saved_as: 'ანა საცდელიძე' },
    { name: 'Sandro', saved_as: 'Sandro' },
    { name: null, saved_as: '💙' },
  ],
});

describe('a name is shown as saved', () => {
  it('reads two- and three-word names from a result', () => {
    expect(NAMES).toEqual(['Dato Testadze', 'Mike Sample', 'Temo Eleqtrikosi', 'ანა საცდელიძე']);
  });

  it('puts Latin-saved names back in a Georgian reply', () => {
    expect(
      withNamesAsSaved(
        'იურისტად გყავს დათო ტესტაძე და მაიკ სემპლი, ელექტრიკოსად — თემო ელექტრიკოსი.',
        NAMES,
      ),
    ).toBe('იურისტად გყავს Dato Testadze და Mike Sample, ელექტრიკოსად — Temo Eleqtrikosi.');
  });

  it('puts a Georgian-saved name back in an English reply', () => {
    expect(withNamesAsSaved('Your lawyer is Ana Tsdelidze.', NAMES)).toBe(
      'Your lawyer is ანა საცდელიძე.',
    );
  });

  it('never touches a name already in its own alphabet, nor its case ending', () => {
    const reply = 'ანა საცდელიძეს ჰკითხე, ან Dato Testadze-ს.';
    expect(withNamesAsSaved(reply, NAMES)).toBe(reply);
  });

  it('leaves other words alone', () => {
    const reply = 'დათო ბერიძე და მაია სამხარაძე სხვა ხალხია.';
    expect(withNamesAsSaved(reply, NAMES)).toBe(reply);
  });
});

/** 3862 (SE-011, seat 181407): nine own lawyers, two of them a letter pair apart. */
const LAWYERS = savedNamesIn({
  results: [
    { name: 'Nika advokati', saved_as: 'Nika advokati' },
    { name: 'Maka advokati', saved_as: 'Maka advokati' },
    { name: 'Sopo advokati', saved_as: 'Sopo advokati' },
  ],
});

describe('the closest saved name wins', () => {
  it('puts Maka back as Maka, even when Nika comes first in the list', () => {
    expect(withNamesAsSaved('გყავს ნიკა ადვოკატი და მაკა ადვოკატი.', LAWYERS)).toBe(
      'გყავს Nika advokati და Maka advokati.',
    );
  });

  it('keeps the reply’s own words when two saved names are equally close', () => {
    const reply = 'გყავს ტიკა ადვოკატი.';
    expect(withNamesAsSaved(reply, ['Nika advokati', 'Mika advokati'])).toBe(reply);
  });

  it('still puts back a drifted spelling when only one saved name is near', () => {
    expect(withNamesAsSaved('გყავს მაიკ სემპლი.', ['Mike Sample', 'Nika advokati'])).toBe(
      'გყავს Mike Sample.',
    );
  });
});

describe('the run', () => {
  it('notes the names each search found and puts them back before the reply is stored', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('noteSavedNames(runId, savedNamesIn(labelled));');
    expect(chat).toContain('const asSaved = withNamesAsSaved(finalText, savedNames);');
    expect(chat).toContain('runSavedNames.delete(runId);');
  });
});
