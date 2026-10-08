import { detectRunLanguage } from '../runLanguage';

/** 2707, the Latin case (seat 179367): „iuristi mchirdeba" was answered in English. */
describe('Georgian typed in Latin letters', () => {
  it.each([
    'iuristi mchirdeba',
    'kargi iuristi mchirdeba, vinme icnob?',
    'gamarjoba',
    'madloba dzalian',
  ])('„%s" is Georgian', (line) => {
    expect(detectRunLanguage(line)).toBe('ka');
  });

  it.each(['I need a good lawyer.', 'Do you know anyone in Tbilisi?', 'Ok'])(
    '„%s" stays English',
    (line) => {
      expect(detectRunLanguage(line)).toBe('en');
    },
  );

  it('Spanish stays Spanish', () => {
    expect(detectRunLanguage('Necesito un buen abogado en Tbilisi')).toBe('es');
  });
});
