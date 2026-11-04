import { deliveryNote, UNKNOWN_SENDER_NOTE } from '../whatsappInbound.service';

describe('an accepted WhatsApp delivery', () => {
  it('is written down with its message count', () => {
    expect(deliveryNote(true, 1)).toBe('[whatsapp] delivery received: 1 message(s)');
  });

  it('says when the channel is off and nothing is answered', () => {
    expect(deliveryNote(false, 2)).toContain('channel is off');
  });

  it('a status-only delivery reads as zero messages', () => {
    expect(deliveryNote(true, 0)).toContain('0 message(s)');
  });

  it('the unknown-sender note carries no number', () => {
    expect(UNKNOWN_SENDER_NOTE).not.toMatch(/\d/u);
  });
});
