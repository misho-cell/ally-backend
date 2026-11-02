import { readFileSync } from 'fs';
import { join } from 'path';
import { looksLikeContactInstruction } from '../goalIntent';

/**
 * #694: „ask <name> …" typed by the owner was refused once („no permission
 * recorded") before it went. D316: the instruction is the yes, so the send
 * grants the plan-free permission first, from the owner's own words.
 */
describe('a typed instruction sends at once', () => {
  it('recognises the owner’s instructions from this week’s refusals', () => {
    expect(looksLikeContactInstruction('თორნიკე აბულაძეს ჰკითხე დღეს თუ სცალია შესახვედრად')).toBe(
      true,
    );
    expect(
      looksLikeContactInstruction('Preguntale a Netai Test 1 si conoce un buen dentista'),
    ).toBe(true);
  });

  // #8515 (the tester's 80752 item 1, case 30): pass on / forward is an order too.
  it('reads „pass these names to X" as the owner’s instruction', () => {
    expect(
      looksLikeContactInstruction(
        'ამ სამ ბროკერს — ნიკა, დავითი, თამარი — ლაშას გადაეცი, სახელებით.',
      ),
    ).toBe(true);
    expect(looksLikeContactInstruction('ეს სია ნინოს გადაუგზავნე')).toBe(true);
    expect(looksLikeContactInstruction('pass these 3 names to Lasha')).toBe(true);
  });

  it('does not read a line that only mentions passing something on as an order', () => {
    expect(looksLikeContactInstruction('ნინომ გადასცა სია')).toBe(false);
    expect(looksLikeContactInstruction('ეს სია ნინოს არ გადაუგზავნე')).toBe(false);
  });

  it('never reads a bare yes as an instruction (ticket 19 G2)', () => {
    expect(looksLikeContactInstruction('კი')).toBe(false);
  });

  it('is asked before every send, owner present only, instruction only', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const handler = chat.slice(chat.indexOf("case 'ask_contact': {"));
    const grant = handler.indexOf('await grantFromTheOwnersInstruction(');
    expect(grant).toBeGreaterThan(-1);
    expect(grant).toBeLessThan(handler.indexOf('await createAsk('));
    const fn = chat.slice(chat.indexOf('async function grantFromTheOwnersInstruction('));
    expect(fn.slice(0, 900)).toContain(
      'if (ownerAbsent || threadId === undefined || task.permission_granted === true) return;',
    );
    expect(fn.slice(0, 900)).toContain('looksLikeContactInstruction(line)');
  });
});
