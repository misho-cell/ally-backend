import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Board #859 (the founder's Android, 4 October): Google accepted the pushes and
 * the phone showed nothing. Pushes go out as „high" urgency, and the push
 * service's own answer is recorded on success.
 */
const source = readFileSync(join(__dirname, '..', 'notification.service.ts'), 'utf8');

describe('a push to a device', () => {
  it('is sent at high urgency', () => {
    expect(source).toContain(
      "const PUSH_SEND_OPTIONS: webpush.RequestOptions = { urgency: 'high' };",
    );
    expect(source).toContain('PUSH_SEND_OPTIONS,\n    );');
  });

  it('records what the push service answered when it accepted', () => {
    expect(source).toContain(
      "await recordDelivery(userId, row.endpoint, 'sent', result.statusCode, null);",
    );
  });
});
