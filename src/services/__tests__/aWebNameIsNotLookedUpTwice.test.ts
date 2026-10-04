import { readFileSync } from 'fs';
import { join } from 'path';
import { isTheWebName, WEB_NAME_CHECKED_NOTE } from '../chat.service';

/**
 * The tester's 1131 (row 7, B2 36303): eight web names looked up one by one in
 * the contacts, each already checked by the server when the web result came.
 */
describe('a web name already checked this run', () => {
  it('is recognised whole or inside a longer form', () => {
    expect(isTheWebName('Giorgi Kapanadze', 'Giorgi Kapanadze')).toBe(true);
    expect(isTheWebName('giorgi kapanadze', 'Dr. Giorgi Kapanadze')).toBe(true);
    expect(isTheWebName('Infinity Solutions LLC', 'Infinity Solutions')).toBe(true);
  });

  it('never matches on a short fragment', () => {
    expect(isTheWebName('Arci', 'Arci Construction')).toBe(false);
    expect(isTheWebName('Nino', 'Nino Beridze')).toBe(false);
  });

  it('a different person is searched as before', () => {
    expect(isTheWebName('Tamar Lomidze', 'Giorgi Kapanadze')).toBe(false);
  });

  it('answers from the verdict before the search runs', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const at = chat.indexOf("case 'search_contact_by_name': {");
    const block = chat.slice(at, at + 400);
    expect(block.indexOf('webNameAlreadyChecked(runId')).toBeLessThan(
      block.indexOf('runLoggedSearch('),
    );
    expect(WEB_NAME_CHECKED_NOTE).toContain('do not look up web names one by one');
  });
});
