import { readFileSync } from 'fs';
import { join } from 'path';
import { ASK_BODY_MAX_CHARS, disclosureLine } from '../askOpening';
import { scrubMechanicalForStorage } from '../privacyScrub';

/** 1687 (A4): every outgoing ask ends with the identical line, never the model's words. */
describe('the disclosure line', () => {
  it('is the same line every time, in the reader’s language', () => {
    expect(disclosureLine('ka', 'ნინო ბერიძე')).toBe(
      'ნინო ბერიძის ასისტენტი, ნინო ბერიძის სახელით',
    );
    expect(disclosureLine('en', 'Nino Beridze')).toBe("Nino Beridze's assistant, for Nino Beridze");
    expect(disclosureLine('ru', 'Nino Beridze')).toBe(
      'Ассистент Nino Beridze, от имени Nino Beridze',
    );
    expect(disclosureLine('es', 'Nino Beridze')).toBe(
      'Asistente de Nino Beridze, en nombre de Nino Beridze',
    );
  });

  it('is stored as its own paragraph, not glued to the question (D710 revert, 9 Oct 02:11Z)', () => {
    const question = 'შეგეძლება პირადად დაეხმარო, თუ მხოლოდ რჩევას გაუწევ?';
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      const line = disclosureLine(language, 'ნინო ბერიძე');
      const stored = scrubMechanicalForStorage(`${question}\n\n${line}`);
      expect(stored).toBe(`${question}\n\n${line}`);
    }
  });

  it('closes every ask, after the body, with the profile name; a long body is logged', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    const at = asks.indexOf('1687 (A4): the body is measured');
    const block = asks.slice(at, at + 900);
    expect(block).toContain('if (body.length > ASK_BODY_MAX_CHARS)');
    expect(block).toContain(
      "if (profileName !== '') lines.push(disclosureLine(said, profileName));",
    );
    expect(ASK_BODY_MAX_CHARS).toBe(400);
  });
});
