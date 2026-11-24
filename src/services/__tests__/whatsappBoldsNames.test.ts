/**
 * Misho, 24 Nov: „a person's first and last name, and a company's name,
 * wherever they come, in bold." The names are the ones the searches found;
 * WhatsApp bolds text between asterisks.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  boldNamesFor,
  forgetBoldNames,
  namesIn,
  noteBoldNames,
  withBoldNames,
} from '../whatsappBold';

beforeEach(() => forgetBoldNames());

describe('which names', () => {
  it('takes the people a result names and the companies it lists', () => {
    const result = {
      results: [
        { phone: '+995555000001', name: 'Nino Beridze', employer: 'Build LLC' },
        { contact_id: '+995555000002', name: 'Levan Japaridze' },
        { phone: '+995555000003', name: 'Ann' },
      ],
      companies: [{ name: 'Strata Group', heads_on_the_web: [] }],
      notes: { name: 'not a person' },
    };
    expect(namesIn(result).sort()).toEqual(
      ['Build LLC', 'Levan Japaridze', 'Nino Beridze', 'Strata Group'].sort(),
    );
  });
});

describe('how they are bolded', () => {
  it('bolds each name, the full name before its first word', () => {
    expect(
      withBoldNames('Ask Nino Beridze at Strata Group, or Nino alone.', [
        'Nino',
        'Nino Beridze',
        'Strata Group',
      ]),
    ).toBe('Ask *Nino Beridze* at *Strata Group*, or *Nino* alone.');
  });

  it('bolds a Georgian name with its case ending', () => {
    expect(
      withBoldNames('გიორგი მეფარიშვილთან თორნიკე აბულაძის გავლით.', [
        'გიორგი მეფარიშვილი',
        'თორნიკე აბულაძე',
      ]),
    ).toBe('*გიორგი მეფარიშვილთან* *თორნიკე აბულაძის* გავლით.');
  });

  it('never bolds inside a word, twice, or a name too short to be sure', () => {
    expect(withBoldNames('Ninotchka and *Nino*', ['Nino'])).toBe('Ninotchka and *Nino*');
    expect(withBoldNames('Ann and Annabel', ['Ann'])).toBe('Ann and Annabel');
    expect(withBoldNames('nothing here', [])).toBe('nothing here');
  });
});

describe('the conversation keeps its names for its WhatsApp copies', () => {
  it('merges what each run found, and forgets them after an hour', () => {
    noteBoldNames(7, 1, ['Nino Beridze'], 0);
    noteBoldNames(7, 1, ['Strata Group'], 1_000);
    expect(boldNamesFor(7, 1, 2_000).sort()).toEqual(['Nino Beridze', 'Strata Group']);
    expect(boldNamesFor(7, 1, 2 * 60 * 60_000)).toEqual([]);
    expect(boldNamesFor(8, 1, 0)).toEqual([]);
  });

  it('bolds the answer and the goal news sent to WhatsApp, and notes each run’s names', () => {
    const replies = readFileSync(join(__dirname, '..', 'whatsappReplies.service.ts'), 'utf8');
    expect(replies.match(/withBoldNames\(/gu)?.length).toBe(2);
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'noteBoldNames(Number(userId), threadId, runBoldNames.get(runId) ?? []);',
    );
    expect(chat).toContain('...namesIn(result)');
  });
});
