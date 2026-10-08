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

describe('the run', () => {
  it('notes the names each search found and puts them back before the reply is stored', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('noteSavedNames(runId, savedNamesIn(labelled));');
    expect(chat).toContain('const asSaved = withNamesAsSaved(finalText, savedNames);');
    expect(chat).toContain('runSavedNames.delete(runId);');
  });
});
