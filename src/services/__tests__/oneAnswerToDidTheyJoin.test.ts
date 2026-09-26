import { readFileSync } from 'fs';
import { join } from 'path';

import { joinedNetai, usedNetai, NETAI_LIVE_STATUSES } from '../netaiMembership';

/**
 * ROW 264 — „IS THIS PERSON ON NETAI" MEANT TWO DIFFERENT THINGS, AND A TESTER
 * FOUND IT BY COMPARING TWO SCREENS.
 *
 * Sofo (172497) registered through the founder's Netai invite on 25 September.
 * `/admin/users` called her `netai_user`. The referral tree called her
 * `ally_account`. Both were honest and neither was reading the same rule:
 * the admin page counted a thread OR a search OR a live subscription, the tree
 * counted a thread and nothing else. She has no thread yet and a trial, so she
 * fell between them.
 *
 * ⚠️ AND THE LABEL WAS ABOUT TO REACH A PERSON. The connector's own
 * instructions say an `ally_account` „has never opened Netai — it is a target,
 * not a member". The tree was telling the product to pitch Netai to somebody
 * who had joined it that morning. A wrong number is a reporting fault; this
 * was a pitch aimed at a new member.
 *
 * Measured over the 805 invitees before changing anything: 8 by the thread
 * rule, 15 by the other. Nearly double — and the 8 was the number in front of
 * the founder.
 */
describe('one definition, and it says which question it answers', () => {
  it('separates arriving from using, by name', () => {
    expect(joinedNetai('u')).toContain('subscription_status IN');
    expect(joinedNetai('u')).toContain('search_activity');
    // USED is deliberately the narrow one: a conversation, nothing else.
    expect(usedNetai('u')).not.toContain('subscription_status');
    expect(usedNetai('u')).not.toContain('search_activity');
  });

  it('is a strict subset: anybody who used it has also joined', () => {
    // Both rest on the same thread test, so USED cannot be true where JOINED
    // is false — asserted on the text because that is what the database runs.
    expect(joinedNetai('u')).toContain('EXISTS (SELECT 1 FROM threads t WHERE t.user_id = u.id)');
    expect(usedNetai('u')).toContain('EXISTS (SELECT 1 FROM threads t WHERE t.user_id = u.id)');
  });

  it('takes the alias it is given, so every caller reads its own row', () => {
    expect(usedNetai('invitee')).toContain('invitee.id');
    expect(joinedNetai('nu')).toContain('nu.subscription_status');
  });

  /** The statuses are ours and fixed; a typo here silently shrinks the count. */
  it('counts exactly the three live statuses', () => {
    expect(NETAI_LIVE_STATUSES).toEqual(['active', 'trialing', 'past_due']);
    for (const status of NETAI_LIVE_STATUSES) expect(joinedNetai('u')).toContain(`'${status}'`);
  });
});

/**
 * The point of the shared module is that no reader can have its own rule. If
 * one of these writes the test out by hand again, they can drift apart again,
 * and the next person to notice will be a tester with two screens open.
 */
describe('every reader asks the shared question', () => {
  const read = (...parts: string[]): string =>
    readFileSync(join(__dirname, '..', ...parts), 'utf8');

  it('the referral tree does', () => {
    const tree = read('referralTree.service.ts');

    expect(tree).toContain("from './netaiMembership'");
    expect(tree).toContain("${joinedNetai('u')}");
    expect(tree).toContain("${usedNetai('u')}");
  });

  it('the admin user page does', () => {
    const admin = read('adminUsers.service.ts');

    expect(admin).toContain("from './netaiMembership'");
    expect(admin).toContain("${joinedNetai('u')} AS netai_user");
  });

  it('the pilot report does', () => {
    const pilot = read('pilotOutcomes.service.ts');

    expect(pilot).toContain("from './netaiMembership'");
    expect(pilot).toContain("${usedNetai('invitee')}");
  });

  /**
   * ⚠️ NOBODY WRITES THE TEST OUT BY HAND ANY MORE. This is the assertion that
   * actually prevents the regression: the three readers may not contain their
   * own copy of the thread-or-search-or-subscription clause.
   */
  it('none of them still carries its own copy of the rule', () => {
    for (const file of [
      'referralTree.service.ts',
      'adminUsers.service.ts',
      'pilotOutcomes.service.ts',
    ]) {
      const source = read(file).replace(/\/\*[\s\S]*?\*\//g, '');

      expect(source).not.toMatch(/subscription_status = ANY\(\$\d::text\[\]\)\) AS netai_user/);
    }
  });

  /**
   * The population label is the one that reaches a person, so it rests on
   * JOINED — the opposite of „never heard of us" — and not on usage.
   */
  it('the population label rests on joining, not on usage', () => {
    const tree = read('referralTree.service.ts');
    const fn = tree.slice(tree.indexOf('function populationOf'));

    expect(fn.slice(0, 500)).toContain('row.joined_netai');
    expect(fn.slice(0, 500)).not.toContain('row.opened_netai ?');
  });

  /** And `hasAccessToAlly` is still not the discriminator — registerUser sets it. */
  it('still refuses hasAccessToAlly as the test', () => {
    expect(joinedNetai('u')).not.toContain('hasAccessToAlly');
    expect(usedNetai('u')).not.toContain('hasAccessToAlly');
  });
});
