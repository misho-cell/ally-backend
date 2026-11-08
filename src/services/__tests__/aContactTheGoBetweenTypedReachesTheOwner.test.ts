import { readFileSync } from 'fs';
import { join } from 'path';
import {
  TypedContactKind,
  typedContactIn,
  typedContactLine,
  typedContactMediatorLine,
} from '../introTypedContact';

/**
 * The tester's battery (6 Nov, C1, C3, C6, C7): the go-between typed the
 * person's number or e-mail into the answer, and the owner read „ask him
 * yourself". What they typed is now handed over, like a number on an ask (D587).
 */
describe('the contact a go-between typed', () => {
  it('is found: a number first, else an e-mail', () => {
    expect(typedContactIn('კი, ნინოს ვეტყვი. მისი ნომერია 599 12 34 56')).toEqual({
      kind: TypedContactKind.Phone,
      value: '599 12 34 56',
    });
    expect(typedContactIn('მისი ელფოსტაა emre@example.com, მიწერეთ')).toEqual({
      kind: TypedContactKind.Email,
      value: 'emre@example.com',
    });
    expect(typedContactIn('კი, შემიძლია დაგაკავშირო')).toBeNull();
    expect(typedContactIn(null)).toBeNull();
  });

  it('reaches the owner with whose contact it is and who wrote it', () => {
    const phone = typedContactLine('ka', 'სანდრო', 'ნინო', {
      kind: TypedContactKind.Phone,
      value: '599 12 34 56',
    });
    expect(phone).toContain('კონტაქტი დაწერა');
    expect(phone).toContain('tel:+995599123456');
    expect(phone).not.toContain('ჰკითხე');
    const email = typedContactLine('en', 'Levan', 'Emre', {
      kind: TypedContactKind.Email,
      value: 'emre@example.com',
    });
    expect(email).toContain('mailto:emre@example.com');
  });

  it('tells the go-between it was passed on', () => {
    expect(typedContactMediatorLine('ka', 'გიორგი', 'ნინო')).toContain('კონტაქტი, რომელიც დაწერე');
  });

  /** Tester's report 8 Nov, C5: the typed contact wins over a phonebook number, read from the card thread. */
  it('wins over a phonebook number for an off-Netai target, after the member target is asked (#8945)', () => {
    const src = readFileSync(join(__dirname, '..', 'introduction.service.ts'), 'utf8');
    const askFirst = src.indexOf('if (asked) return awaitingTheTarget(');
    const typed = src.indexOf('const typed = typedContactIn(');
    expect(askFirst).toBeGreaterThan(-1);
    expect(typed).toBeGreaterThan(askFirst);
    expect(src.slice(typed - 300, typed)).toContain('if (!targetWasTold) {');
    expect(src.slice(typed, typed + 80)).toContain('goBetweensLinesSinceAsked(req)');
  });
});
