import { readFileSync } from 'fs';
import { join } from 'path';
import { withOwnersNetwork } from '../planVoice';

/** P3 (the tester's 47972, conv 46812): the plan reply spoke as the owner. */
const TESTER_REPLY =
  'ჩემს ნაცნობებში პირდაპირ ფოტოგრაფი არ აღმოჩნდა, მაგრამ ვიპოვე ერთი ვარიანტი ერთი ნაბიჯით ' +
  'მოშორებით: სოფო, ფოტოგრაფი, რომელსაც იცნობს ლევან მოგონილაძე (ის ჩემი ქსელის წევრია).\n\n' +
  'ლევანის ასისტენტს დაველაპარაკები და შევეცდები მოვაგვარო.\n\nდავიწყო?';

describe('the plan reply speaks of the owner’s network', () => {
  it('says „შენს ნაცნობებში" and „შენი ქსელის" in the tester’s reply', () => {
    const fixed = withOwnersNetwork(TESTER_REPLY);
    expect(fixed).toContain('შენს ნაცნობებში პირდაპირ ფოტოგრაფი');
    expect(fixed).toContain('(ის შენი ქსელის წევრია)');
    expect(fixed).not.toMatch(/ჩემ/u);
    expect(fixed).toContain('ლევანის ასისტენტს დაველაპარაკები');
  });

  it('turns „my contacts / my network" to the owner in en, es and ru', () => {
    expect(withOwnersNetwork('No one in my contacts. My network has Levan.')).toBe(
      'No one in your contacts. Your network has Levan.',
    );
    expect(withOwnersNetwork('Nadie en mis contactos; Levan está en mi red.')).toBe(
      'Nadie en tus contactos; Levan está en tu red.',
    );
    expect(withOwnersNetwork('Среди моих контактов нет, Леван в моей сети.')).toBe(
      'Среди твоих контактов нет, Леван в твоей сети.',
    );
  });

  it('leaves other first-person words and quoted words alone', () => {
    const line = 'ჩემი აზრით, ეს კარგია. გია წერს: „ჩემს ნაცნობებში არავინაა". ჩემს წრეში კი არის.';
    expect(withOwnersNetwork(line)).toBe(
      'ჩემი აზრით, ეს კარგია. გია წერს: „ჩემს ნაცნობებში არავინაა". შენს წრეში კი არის.',
    );
    expect(withOwnersNetwork('Did you mean my message?')).toBe('Did you mean my message?');
  });

  it('runs on the plan reply only, after the approval check', () => {
    const body = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const at = body.indexOf('function withPlanInReply(');
    const fn = body.slice(at, body.indexOf('\n}\n', at));
    expect(fn.indexOf('withOwnersNetwork(written)')).toBeGreaterThan(
      fn.indexOf('if (!replyAsksForApproval(offered)) return written;'),
    );
  });
});
