jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  backgroundQuery: jest.fn(),
  default: { end: jest.fn() },
}));
jest.mock('../../../services/whatsapp.service', () => ({ sendWhatsAppMessage: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { connectorPhone } from '../oauth.routes';

const oauth = readFileSync(join(__dirname, '..', 'oauth.routes.ts'), 'utf8');

/** #5743 (Lika's phone, 18 Oct 20:32Z): the connector's sign-in said only „Could not send the code". */
describe('the connector sign-in', () => {
  it('reads the number the way the app does', () => {
    expect(connectorPhone('+995 555 12 34 56')).toBe('+995555123456');
    expect(connectorPhone('555123456')).toBe('+995555123456');
    expect(connectorPhone('0555 12 34 56')).toBe('+995555123456');
  });

  it('refuses a number that is not whole, instead of trying to send to it', () => {
    expect(connectorPhone('99599757')).toBeNull();
    expect(connectorPhone('')).toBeNull();
    expect(connectorPhone(undefined)).toBeNull();
  });

  it('says when the hourly code limit is the reason, with 429', () => {
    expect(oauth).toContain('err instanceof OtpSendCapError');
    expect(oauth).toContain('Too many codes were sent to this number in the last hour');
    expect(oauth).toContain('HTTP_TOO_MANY_REQUESTS');
  });
});
