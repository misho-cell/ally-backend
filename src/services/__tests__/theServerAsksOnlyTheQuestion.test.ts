import { instructionQuestion } from '../goalIntent';

/** QA-001 run 2 (conv 42765): the server's send carried the owner's whole line. */
describe('theServerAsksOnlyTheQuestion', () => {
  it('takes what follows the addressee in Georgian', () => {
    expect(
      instructionQuestion(
        'ჰკითხე Netai Test Lado N1-ს იცნობს თუ არა გია ბერიძეს და გამაცნობს თუ არა',
      ),
    ).toBe('იცნობს თუ არა გია ბერიძეს და გამაცნობს თუ არა');
    expect(instructionQuestion('ჰკითხე გიგა ტესტაძეს, რომ შაბათს თავისუფალია?')).toBe(
      'შაბათს თავისუფალია?',
    );
  });

  it('takes the clause after a name placed before the verb', () => {
    expect(instructionQuestion('ნინოს ჰკითხე იცნობს თუ არა გიას')).toBe('იცნობს თუ არა გიას');
  });

  it('takes the „whether" clause in English', () => {
    expect(instructionQuestion('Ask Giga Test whether he knows Gia Beridze')).toBe(
      'whether he knows Gia Beridze',
    );
  });

  it('gives up when the question cannot be told apart', () => {
    expect(instructionQuestion('ჰკითხე გიგა')).toBeNull();
    expect(instructionQuestion('no instruction here')).toBeNull();
  });
});
