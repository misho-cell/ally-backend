import { readFileSync } from 'fs';
import { join } from 'path';
import { plainWordForms } from '../firstNameNamed';
import { closingQuestion, offersToContact } from '../goalIntent';

/**
 * Thread 74582 (30 Oct, a real member): the assistant ended a message with
 * „…ტოტოს ასისტენტს ვკითხო, ხომ არ იცის …?", the owner answered „კი" two and a
 * half hours later, and both walls refused the one person the yes was about:
 * the question was read only within fifteen minutes of the goal opening, it is
 * an offer rather than an order, and the first-names list did not hold the
 * name. The owner was told the question was going out; nothing was sent.
 */
const code = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
const OFFER =
  'ჯერ ერთს ვკითხავდი.\n\nტოტოს ასისტენტს ვკითხო, ხომ არ იცის მშენებლობის ტექნოლოგიური სტარტაპი?';

describe('a yes to the assistant’s offer to ask one person', () => {
  it('reads only the closing question of the assistant’s message', () => {
    expect(closingQuestion(OFFER)).toBe(
      'ტოტოს ასისტენტს ვკითხო, ხომ არ იცის მშენებლობის ტექნოლოგიური სტარტაპი?',
    );
    expect(closingQuestion('ტოტოს ვკითხავ.')).toBe('');
  });

  it('counts a first-person offer to contact somebody', () => {
    for (const offer of [
      'ტოტოს ვკითხო?',
      'ტოტოს მივწერო?',
      'ტოტოს გავუგზავნო ეს ტექსტი?',
      'ხომ არ მივწერო ტოტოს?',
      'Shall I ask Toto?',
      'Do you want me to message Toto?',
    ])
      expect(offersToContact(offer)).toBe(true);
  });

  it('does not count a question that offers no contact, or refuses one', () => {
    for (const not of ['ტოტო გახსოვს?', 'ტოტოს რა ვუთხრა?', 'არავის მივწერო?', 'ნუ მივწერ ტოტოს?'])
      expect(offersToContact(not)).toBe(false);
  });

  it('reads a name the list does not hold through its plain forms', () => {
    const forms = plainWordForms('ტოტოს ასისტენტს ვკითხო?');
    expect(forms).toContain('ტოტო');
    expect(forms).toContain('toto');
    expect(forms.every((form) => form.length >= 3)).toBe(true);
  });

  it('reads the question right before the yes, however long before the goal', () => {
    const reader = code.slice(code.indexOf('async function assistantQuestionBefore'));
    const body = reader.slice(0, reader.indexOf('\n}\n'));
    expect(body).not.toContain('TYPED_LINE_GRACE_MINUTES');
    expect(body).toContain("AND COALESCE(c.kind, '') <> 'event' AND c.content <> ''");
  });

  it('opens the walls only for exactly one contact the offer names', () => {
    const helper = code.slice(code.indexOf('async function ownerJustNamedPerson'));
    expect(helper.slice(0, helper.indexOf('} catch (error)'))).toContain(
      'await offerNamesThisPerson(asked, person)',
    );
    const offer = code.slice(code.indexOf('async function offerNamesThisPerson'));
    expect(offer.slice(0, 400)).toContain(
      "if (offer === '' || !offersToContact(offer)) return false;",
    );
    const start = code.slice(code.indexOf('async function onlyContactWhoseLabelStartsWith'));
    expect(start.slice(0, 900)).toContain(
      'return distinct.size === 1 && distinct.has(phoneDigits(person.contactPhone));',
    );
  });
});
