const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => mockQuery(...args),
  default: {},
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { PushReceiptEvent, recordPushReceipt } from '../notification.service';

const RECEIPT = 'ab'.repeat(16);

beforeEach(() => mockQuery.mockReset());

/** #7724 (tester's engagement desk C-0020): a 201 is the provider's, not the phone's. */
describe('a push receipt', () => {
  it('marks the delivery received, and a tap marks it clicked too', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    await expect(recordPushReceipt(RECEIPT, PushReceiptEvent.Received)).resolves.toBe(true);
    expect(mockQuery.mock.calls[0][1]).toEqual([RECEIPT, false]);
    await recordPushReceipt(RECEIPT, PushReceiptEvent.Clicked);
    expect(mockQuery.mock.calls[1][1]).toEqual([RECEIPT, true]);
    expect(mockQuery.mock.calls[1][0]).toContain('received_at = COALESCE(received_at, NOW())');
  });

  it('touches nothing for something that is not a receipt', async () => {
    await expect(recordPushReceipt('1; DROP', PushReceiptEvent.Received)).resolves.toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rides in every push, and the route is open to the service worker only by the receipt', () => {
    const service = readFileSync(join(__dirname, '..', 'notification.service.ts'), 'utf8');
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'notifications.routes.ts'),
      'utf8',
    );
    expect(service).toContain('JSON.stringify({ ...payload, receipt })');
    expect(routes.indexOf("'/receipt'")).toBeLessThan(
      routes.indexOf('notificationsRouter.use(authenticateJwt, requireUserRole);'),
    );
  });
});
