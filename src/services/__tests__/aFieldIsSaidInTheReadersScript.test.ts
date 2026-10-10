import { fieldInScript } from '../fieldPlaces';
import { card1Text, card2Text } from '../matchCards';

/** 1699 (tester 50656): „…ამისთვის არის ღია, hospitality." — an English field in a Georgian card. */
describe('the offer’s field on the match cards', () => {
  it('is said in Georgian to a Georgian reader when the trade list knows the word', () => {
    expect(fieldInScript('hospitality', true)).toBe('სტუმართმასპინძლობა');
    expect(fieldInScript('Logistics', true)).toBe('ლოჯისტიკა');
    expect(fieldInScript('real estate', true)).toBe('უძრავი ქონება');
  });

  it('is said in Latin letters to everyone else', () => {
    expect(fieldInScript('სასტუმრო', false)).toBe('hospitality');
    expect(fieldInScript('hospitality', false)).toBe('hospitality');
  });

  it('keeps a word the list does not know, and never a word inside a longer one', () => {
    expect(fieldInScript('pottery', true)).toBe('pottery');
    expect(fieldInScript('hotelier', true)).toBe('hotelier');
    expect(fieldInScript('hospitality in Adjara', true)).toBe('სტუმართმასპინძლობა in Adjara');
  });

  it('reaches both cards', () => {
    expect(card1Text('ka', 'hospitality')).toContain('სტუმართმასპინძლობა');
    expect(card1Text('ka', 'hospitality')).not.toContain('hospitality');
    expect(card2Text('ka', 'hospitality')).toContain('სტუმართმასპინძლობა');
    expect(card2Text('en', 'hospitality')).toContain('hospitality');
  });
});
