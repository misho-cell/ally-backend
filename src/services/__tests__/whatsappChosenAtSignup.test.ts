const mockVerify = jest.fn();
const mockConsent = jest.fn();
const mockWelcome = jest.fn();
jest.mock('../auth.service', () => ({ verifyToken: (t: string) => mockVerify(t) }));
jest.mock('../whatsappConsent.service', () => ({
  ConsentSource: { Signup: 'signup' },
  setWhatsappConsent: (...a: unknown[]) => mockConsent(...a),
}));
jest.mock('../whatsappWelcome.service', () => ({
  welcomeInWhatsapp: (...a: unknown[]) => mockWelcome(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { optInAtSignup } from '../whatsappAtSignup.service';

/** #8713 part 3: WhatsApp chosen on the sign-up form's ticked box. */
beforeEach(() => {
  mockVerify.mockReset().mockReturnValue({ userId: '42', role: 'user' });
  mockConsent.mockReset().mockResolvedValue({});
  mockWelcome.mockReset().mockResolvedValue('sent');
});

describe('WhatsApp chosen at sign-up', () => {
  it('records the choice as made at sign-up and sends the welcome', async () => {
    await optInAtSignup('token');
    expect(mockConsent).toHaveBeenCalledWith(42, true, 'signup');
    expect(mockWelcome).toHaveBeenCalledWith(42);
  });

  it('never undoes a registration when it fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockConsent.mockRejectedValue(new Error('db'));
    await expect(optInAtSignup('token')).resolves.toBeUndefined();
    expect(mockWelcome).not.toHaveBeenCalled();
  });

  it('is asked for only when the form sent the box ticked', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'auth.routes.ts'),
      'utf8',
    );
    expect(routes).toContain("body('whatsapp_opt_in').optional().isBoolean({ strict: true })");
    expect(routes).toContain('whatsapp_opt_in === true');
  });
});
