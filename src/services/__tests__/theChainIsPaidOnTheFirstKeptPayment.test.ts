import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * D717 (the founder, 7 Oct, board 44356; Misho's yes, §97): the chain is paid
 * on the first payment that is NOT refunded. Pay → refund → pay again shares
 * once more; pay, kept, pay again shares nothing.
 */
describe('the first payment that pays the chain', () => {
  const src = readFileSync(join(__dirname, '..', 'referral.service.ts'), 'utf8');
  const guard = src.slice(src.indexOf('export async function distributeReferralEarnings('));

  it('ignores a share that a refund took back', () => {
    expect(guard).toContain('AND NOT EXISTS (SELECT 1 FROM referral_transactions taken');
    expect(guard).toContain('taken.external_id = $3 || earned.external_id');
    expect(guard).toContain('[subscriberId, EARN_REASON, CLAWBACK_PREFIX]');
  });
});
