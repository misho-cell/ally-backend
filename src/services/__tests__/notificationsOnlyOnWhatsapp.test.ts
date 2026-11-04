jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { whatsappCopyHeldBack } from '../notification.service';
import { WHATSAPP_DEVICE } from '../whatsappChannel.service';
import { notifiesOnlyInWhatsapp, setWhatsappOnly } from '../whatsappConsent.service';

/**
 * #8713 part 2 (Tornike, 4 Nov): a member with WhatsApp on got both the app's
 * notification and WhatsApp's; with app notifications off, WhatsApp's never
 * came. „WhatsApp only" is one notification, there, independent of the app.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const rows = (r: unknown[]): never => ({ rows: r, rowCount: r.length }) as never;

beforeEach(() => mockQuery.mockReset());

describe('notifications on WhatsApp only', () => {
  it('is set only for a member who chose WhatsApp', async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    expect(await setWhatsappOnly(5, true)).toBeNull();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('AND opted_in = TRUE');
    expect(params).toEqual([5, true]);
  });

  it('is read as on only while WhatsApp itself is chosen', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ opted_in: true, whatsapp_only: true }]));
    expect(await notifiesOnlyInWhatsapp(5)).toBe(true);
    mockQuery.mockResolvedValueOnce(rows([{ opted_in: false, whatsapp_only: true }]));
    expect(await notifiesOnlyInWhatsapp(5)).toBe(false);
  });

  it('falls back to the app when the setting cannot be read', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    expect(await notifiesOnlyInWhatsapp(5)).toBe(false);
  });
});

describe('the WhatsApp copy', () => {
  it('is not held back by a Netai screen left open, when WhatsApp is the only channel', () => {
    expect(whatsappCopyHeldBack(true, undefined, true, false)).toBe(false);
  });

  it('is held back by an open screen when the app notifies too', () => {
    expect(whatsappCopyHeldBack(false, undefined, true, false)).toBe(true);
  });

  it('is never sent for an answer asked from WhatsApp, or while the asking device is in use', () => {
    expect(whatsappCopyHeldBack(true, WHATSAPP_DEVICE, false, false)).toBe(true);
    expect(whatsappCopyHeldBack(true, 'web-1', false, true)).toBe(true);
  });

  it('is offered through PUT /profile/whatsapp/only, with 409 when WhatsApp is not chosen', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'profile.routes.ts'),
      'utf8',
    );
    const at = routes.indexOf("'/whatsapp/only'");
    expect(at).toBeGreaterThan(-1);
    const handler = routes.slice(at, routes.indexOf('profileRouter.put(', at + 1));
    expect(handler).toContain('authenticateJwt');
    expect(handler).toContain('status(409)');
    expect(handler).toContain('status(400)');
  });
});
