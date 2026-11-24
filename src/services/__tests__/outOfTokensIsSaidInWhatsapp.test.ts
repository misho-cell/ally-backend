/**
 * Misho, 24 Nov (the app is retired): a member out of tokens who wrote in
 * WhatsApp was told „I could not take your message — try later or write in the
 * app". The route's own words say what happened and when the tokens come back.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { refusalOf } from '../whatsappInbound.service';

describe('out of tokens, in WhatsApp', () => {
  it('passes on the route’s own words for an out-of-tokens refusal', () => {
    expect(refusalOf(402, { error: 'ტოკენები ამოგეწურა — შეავსე ან დაელოდე 1 დეკემბერს.' })).toBe(
      'ტოკენები ამოგეწურა — შეავსე ან დაელოდე 1 დეკემბერს.',
    );
  });

  it('says nothing of its own for any other failure', () => {
    expect(refusalOf(500, { error: 'db timeout' })).toBeNull();
    expect(refusalOf(402, null)).toBeNull();
    expect(refusalOf(402, { error: '  ' })).toBeNull();
  });

  it('sends that line instead of the generic one, which no longer points to the app', () => {
    const inbound = readFileSync(join(__dirname, '..', 'whatsappInbound.service.ts'), 'utf8');
    expect(inbound).toContain('posted.refusal ?? LINES.failed');
    expect(inbound).not.toContain('აპში მომწერე');
  });
});
