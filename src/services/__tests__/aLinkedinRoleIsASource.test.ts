jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  __esModule: true,
  query: jest.fn().mockResolvedValue({ rows: [{ found: false }], rowCount: 1 }),
}));

import {
  applyOfficeholderGate,
  clearRunEvidence,
  recordRunLinkedinEvidence,
} from '../officeholderGate';
import { linkedinEvidence } from '../tools/publicProfileRead';

/**
 * Misho, 15 Oct (the real TBC case, tester's box 60161): „ნათია ფაჩიკაშვილი —
 * Director of MSME Banking" came from a LinkedIn post in the search results,
 * and the gate put its placeholder in place of the name, twice in one answer.
 * LinkedIn is a source for a role in a company; a public office is not.
 */
const RUN = 'run-linkedin';
const SEARCH = {
  results: [
    {
      url: 'https://www.linkedin.com/posts/natia-pachikashvili-cfa_msmebanking-activity',
      title: 'Natia Pachikashvili — Director of MSME Banking at TBC Bank',
      content: 'Natia Pachikashvili, Director of MSME Banking, TBC Bank.',
    },
    {
      url: 'https://news.example.ge/minister',
      title: 'Minister Levan Davitashvili visits',
      content: 'Levan Davitashvili, minister of economy.',
    },
  ],
};

afterEach(() => clearRunEvidence(RUN));

describe('the LinkedIn results of a web search', () => {
  it('are read from LinkedIn hits only', () => {
    const text = linkedinEvidence(SEARCH);
    expect(text).toContain('Natia Pachikashvili');
    expect(text).not.toContain('Davitashvili');
    expect(linkedinEvidence({ results: 'none' })).toBe('');
    expect(linkedinEvidence(null)).toBe('');
  });

  it('let a company role keep the name LinkedIn gave', async () => {
    recordRunLinkedinEvidence(RUN, linkedinEvidence(SEARCH));
    const reply = 'Natia Pachikashvili, Director of MSME Banking თიბისი ბანკში.';
    const out = await applyOfficeholderGate(reply, RUN, 'ka');
    expect(out.refused).toEqual([]);
    expect(out.reply).toBe(reply);
  });

  it('name a public office holder from LinkedIn alone only with its source said', async () => {
    recordRunLinkedinEvidence(
      RUN,
      'https://www.linkedin.com/in/levan-davitashvili\nLevan Davitashvili, Minister of Economy',
    );
    const out = await applyOfficeholderGate(
      'The Minister of Economy is Levan Davitashvili.',
      RUN,
      'en',
    );
    expect(out.refused).toEqual(['Levan Davitashvili']);
    expect(out.reply).toBe(
      'The Minister of Economy is Levan Davitashvili ' +
        '(according to LinkedIn; I could not confirm it on an official page).',
    );
  });

  it('do not let another site’s snippet through', async () => {
    recordRunLinkedinEvidence(RUN, linkedinEvidence(SEARCH));
    const out = await applyOfficeholderGate(
      'The head of the agency is Levan Davitashvili.',
      RUN,
      'en',
    );
    expect(out.refused).toEqual(['Levan Davitashvili']);
    expect(out.reply).toBe('I could not confirm one name on an official page, so I left it out.');
  });
});
