/**
 * Misho, 24 Nov (the app is retired): the answers card reached only an open
 * app screen — a closed goal's answers never reached a WhatsApp member, and an
 * open goal's reply spoke of a card they had not seen.
 */
const mockReaches = jest.fn();
const mockTell = jest.fn();
jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../whatsappChannel.service', () => ({
  __esModule: true,
  reachesInWhatsapp: (...a: unknown[]) => mockReaches(...a),
  tellInWhatsapp: (...a: unknown[]) => mockTell(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { answerCardToWhatsapp } from '../answerCard.service';

beforeEach(() => {
  mockReaches.mockReset();
  mockTell.mockReset().mockResolvedValue('sent');
});

describe('the answers card in WhatsApp', () => {
  it('goes to a member who chose WhatsApp, on its goal’s conversation, as worth a template', async () => {
    mockReaches.mockResolvedValue(true);
    await answerCardToWhatsapp(7, 900, 'Nino: კი, ვიცნობ.');
    expect(mockTell).toHaveBeenCalledWith(7, 'Nino: კი, ვიცნობ.', 900, true);
  });

  it('goes nowhere else, and never throws', async () => {
    mockReaches.mockResolvedValue(false);
    await answerCardToWhatsapp(7, 900, 'x');
    expect(mockTell).not.toHaveBeenCalled();
    mockReaches.mockResolvedValue(true);
    mockTell.mockRejectedValue(new Error('graph down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(answerCardToWhatsapp(7, 900, 'x')).resolves.toBeUndefined();
  });

  it('is sent with every card the server writes', () => {
    const src = readFileSync(join(__dirname, '..', 'answerCard.service.ts'), 'utf8');
    expect(src).toContain(
      'await answerCardToWhatsapp(target.ownerId, target.threadId, saved.content);',
    );
  });
});
