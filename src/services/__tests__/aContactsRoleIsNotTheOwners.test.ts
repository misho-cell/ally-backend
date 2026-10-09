import { readFileSync } from 'fs';
import { join } from 'path';
import { valueIsSomeoneElsesRole } from '../someoneElsesRole';

/** 4192 (tester 49369): „💙 ჩემი სტომატოლოგია" went to the owner's profile, twice. */
describe('a contact’s role is not the owner’s profile', () => {
  it.each([
    ['💙 ჩემი სტომატოლოგია, დაიმახსოვრე.', 'სტომატოლოგი'],
    ['💙 ჩემი სტომატოლოგია, დაიმახსოვრე.', 'სტომატოლოგია'],
    ['ნინო ჩემი იურისტია', 'იურისტი'],
    ['Nino is my lawyer, remember that', 'lawyer'],
  ])('„%s" never makes the owner a „%s"', (line, value) => {
    expect(valueIsSomeoneElsesRole(line, value)).toBe(true);
  });

  it.each([
    ['მე სტომატოლოგი ვარ', 'სტომატოლოგი'],
    ["I'm a lawyer, my firm is small", 'lawyer'],
    ['ჩემი სტომატოლოგია, დაიმახსოვრე', 'იურისტი'],
    ['ვმუშაობ ბანკში', 'ბანკი'],
  ])('„%s" may still set „%s"', (line, value) => {
    expect(valueIsSomeoneElsesRole(line, value)).toBe(false);
  });

  it('is refused at update_user_profile, before anything is written', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const handler = chat.slice(chat.indexOf("case 'update_user_profile':"));
    expect(handler.slice(0, 700)).toContain(
      "valueIsSomeoneElsesRole(runOwnerLine.get(runId) ?? '', String(input['value'] ?? ''))",
    );
    expect(handler.indexOf('SOMEONE_ELSES_ROLE_REFUSAL')).toBeLessThan(
      handler.indexOf('return setUserProfileField('),
    );
  });
});
