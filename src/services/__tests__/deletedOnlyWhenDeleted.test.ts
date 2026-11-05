import { readFileSync } from 'fs';
import { join } from 'path';
import { deletionClaimWithoutTool, notDeletedLine } from '../deletionClaim';
import { ClaimKind, OwnerAsk } from '../replyClaims.service';
import { claimsRead } from './helpers/replyClaims';

/**
 * 3302 (MASTER TEST RUN ME-016 / PR-036): „…ჩანაწერი წავშალე" with no tool
 * called; the fact stayed. „Deleted" only when a deleting tool ran. #8779 c:
 * the claim and the owner's ask are the small model's reading.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
const said = claimsRead({ [ClaimKind.Deleted]: ['ჩანაწერი წავშალე.'] }, [OwnerAsk.Delete]);

describe('a deletion is claimed only when one happened', () => {
  it('is caught when no deleting tool ran', () => {
    expect(deletionClaimWithoutTool(said, ['search_contact_by_name'])).toBe(true);
  });

  it('stands when a deleting tool ran', () => {
    expect(deletionClaimWithoutTool(said, ['forget_contact_fact'])).toBe(false);
  });

  it('stands after the owner’s own profile was rewritten (#4126)', () => {
    expect(
      deletionClaimWithoutTool(said, ['get_what_netai_knows_about_me', 'update_user_profile']),
    ).toBe(false);
  });

  it('a reply that claims no deletion is left alone', () => {
    expect(deletionClaimWithoutTool(claimsRead({}, [OwnerAsk.Delete]), [])).toBe(false);
  });

  it('a plain question never gets the delete card (3565)', () => {
    expect(deletionClaimWithoutTool(claimsRead({ [ClaimKind.Deleted]: ['x.'] }), [])).toBe(false);
  });

  it('the owner reads the truth and a confirm button', () => {
    expect(notDeletedLine('ka')).toEqual({
      text: 'ეს ჯერ არ წამიშლია. დამიდასტურე და ახლავე წავშლი.',
      confirm: 'კი, წაშალე',
    });
    expect(chat).toContain('deletionClaimWithoutTool(claimsNow, toolNamesUsed)');
    expect(chat).toContain('choices = [notDeleted.confirm];');
  });
});
