import { readFileSync } from 'fs';
import { join } from 'path';
import { lineNamesTheContact } from '../dailyContactQuestion';

/** 3004 (conv 44458): the owner told where Nino works; the same reply asked where Nino works. */
const nino = { kind: 'curiosity', task_id: null, payload: { who: 'ნინო სტომატოლოგი' } } as never;

describe('the day’s question waits when the owner just spoke of that person', () => {
  it('sees the person named in the owner’s line, in any case form', () => {
    expect(
      lineNamesTheContact(
        'ჩემი კონტაქტი ნინო სტომატოლოგი კარგი სტომატოლოგია, კლინიკა „ღიმილი" აქვს ვაკეში. დაიმახსოვრე.',
        nino,
      ),
    ).toBe(true);
    expect(lineNamesTheContact('ნინოს უთხარი, რომ ვაკეში ვარ', nino)).toBe(true);
  });

  it('asks as before when the line is about someone else', () => {
    expect(lineNamesTheContact('მჭირდება სანტექნიკოსი', nino)).toBe(false);
  });

  it('the run passes the owner’s line', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const at = chat.indexOf('ownerAsksWhatWaits: asksWhatWaits(ownerLine),');
    expect(chat.slice(at, at + 120)).toContain('ownerLine,');
  });
});
