import { readFileSync } from 'fs';
import { join } from 'path';
import { FactChange, factChangedIn, factChangedRefusal } from '../factKeeping';

/**
 * Board #100 (plate F1): an ask said „for a friend" though the owner asked for
 * himself, and „last year" became „this year".
 */
describe('a question keeps the facts the owner wrote', () => {
  it('holds back a friend the owner never mentioned', () => {
    const changed = factChangedIn('იცნობ კარგ იურისტს? მეგობრისთვის მჭირდება.', [
      'მჭირდება იურისტი ბინის ყიდვაზე',
    ]);
    expect(changed).toEqual({ change: FactChange.Beneficiary, word: 'მეგობრისთვის' });
    expect(
      factChangedIn('Do you know a good lawyer? Asking for a friend.', ['I need a lawyer'])?.change,
    ).toBe(FactChange.Beneficiary);
  });

  it('lets it through when the owner did say it is for somebody else', () => {
    expect(
      factChangedIn('მეგობარს პირველი წიგნის გამოცემა უნდა, იცნობ სტამბას?', [
        'მეგობარს წიგნის დაბეჭდვა სჭირდება',
      ]),
    ).toBeNull();
    expect(
      factChangedIn('Asking for a friend: a dentist?', ['my sister needs a dentist']),
    ).toBeNull();
  });

  it('holds back a time the owner did not give', () => {
    const changed = factChangedIn('წელს გაყიდე ბინა?', ['შარშან ვიყიდე ბინა და ახლა ვყიდი']);
    expect(changed).toEqual({ change: FactChange.Time, word: 'წელს' });
    expect(
      factChangedIn('Did you work with them this year?', ['we hired them last year'])?.change,
    ).toBe(FactChange.Time);
  });

  it('lets a time through when it is the owner’s own, or the owner gave none', () => {
    expect(factChangedIn('შარშან ვინ გაგიკეთა რემონტი?', ['შარშან რემონტი გავაკეთე'])).toBeNull();
    expect(factChangedIn('ხვალ შეგიძლია?', ['მჭირდება ელექტრიკოსი'])).toBeNull();
  });

  it('passes a plain question untouched', () => {
    expect(factChangedIn('იცნობ კარგ ბუღალტერს?', ['მჭირდება ბუღალტერი'])).toBeNull();
  });

  it('tells the model to rewrite with the owner’s facts, and not to report it', () => {
    const text = factChangedRefusal({ change: FactChange.Beneficiary, word: 'for a friend' });
    expect(text).toContain('Not sent');
    expect(text).toContain('they are asking for themselves');
    expect(text).toContain('Do not tell the owner about this');
  });

  it('is checked before the ask goes out, and the tool says so', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const handler = chat.slice(chat.indexOf("case 'ask_contact': {"));
    const checkAt = handler.indexOf('const changed = factChangedIn(question, ownerLines);');
    expect(checkAt).toBeGreaterThan(0);
    expect(checkAt).toBeLessThan(handler.indexOf('await createAsk('));
    expect(chat).toContain('FACTS: keep every fact exactly as the owner wrote it');
  });
});

/** Tester 39832 (#1552): cargo became furniture on the way. */
describe('a detail in brackets the owner never gave', () => {
  const owner = [
    'სოფო ტესტაძეს ჰკითხე, კარგ მეურმეს ხომ არ მირჩევს, სოფლიდან ტვირთი მაქვს ჩამოსატანი',
  ];

  it('is held back', () => {
    expect(
      factChangedIn(
        'კარგ მეურმეს ხომ არ მირჩევ? სოფლიდან ტვირთის (ავეჯის) ჩამოტანა მჭირდება.',
        owner,
      ),
    ).toEqual({ change: FactChange.Detail, word: 'ავეჯის' });
  });

  it('passes when the owner said it, in any case ending', () => {
    expect(
      factChangedIn('ტვირთის (ავეჯის) ჩამოტანა მჭირდება', ['ავეჯი მაქვს ჩამოსატანი სოფლიდან']),
    ).toBeNull();
  });

  it('passes a question with no brackets', () => {
    expect(factChangedIn('კარგ მეურმეს ხომ არ მირჩევ? ტვირთი მაქვს ჩამოსატანი.', owner)).toBeNull();
  });
});

describe('a bracketed word in the other script', () => {
  it('passes when the owner wrote it in Georgian', () => {
    expect(factChangedIn('კარგი ექიმი მჭირდება (Tbilisi)', ['ექიმი მჭირდება თბილისში'])).toBeNull();
  });
});

/** #1618 (tester 40229): „reliable" added to the question without brackets. */
describe('a quality the owner never asked for', () => {
  it('is held back', () => {
    expect(
      factChangedIn('Do you know a reliable person who could help paint a car?', [
        'I need someone to help paint my car',
      ])?.word,
    ).toBe('reliable');
    expect(factChangedIn('იცნობ სანდო ხელოსანს?', ['ხელოსანი მჭირდება'])?.change).toBe(
      FactChange.Detail,
    );
  });

  it('passes when the owner asked for it', () => {
    expect(factChangedIn('იცნობ სანდო ხელოსანს?', ['სანდო ხელოსანი მჭირდება'])).toBeNull();
  });
});
