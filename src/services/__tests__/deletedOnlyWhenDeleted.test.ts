import { readFileSync } from 'fs';
import { join } from 'path';
import { deletionClaimWithoutTool, notDeletedLine, withoutFalseClaim } from '../deletionClaim';
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

  it('stands when the owner’s „don’t offer it again" was recorded (Misho, 19 Nov)', () => {
    const excluded = claimsRead({ [ClaimKind.Deleted]: ['ARCi გამოვრიცხე.'] }, [OwnerAsk.Delete]);
    expect(
      deletionClaimWithoutTool(excluded, ['save_private_context', 'find_companies_for_need']),
    ).toBe(false);
    expect(deletionClaimWithoutTool(excluded, ['exclude_contact'])).toBe(false);
  });

  it('a reply that claims no deletion is left alone', () => {
    expect(deletionClaimWithoutTool(claimsRead({}, [OwnerAsk.Delete]), [])).toBe(false);
  });

  it('a plain question never gets the delete card (3565)', () => {
    expect(deletionClaimWithoutTool(claimsRead({ [ClaimKind.Deleted]: ['x.'] }), [])).toBe(false);
  });

  it('a reply that was only the claim becomes the truth and a confirm button', () => {
    const line = notDeletedLine('ka');
    expect(line).toEqual({
      text: 'ეს ჯერ არ წამიშლია. დამიდასტურე და ახლავე წავშლი.',
      confirm: 'კი, წაშალე',
    });
    expect(withoutFalseClaim('ჩანაწერი წავშალე.', ['ჩანაწერი წავშალე.'], line)).toEqual({
      text: line.text,
      confirm: line.confirm,
    });
    expect(chat).toContain('deletionClaimWithoutTool(claimsNow, toolNamesUsed)');
    expect(chat).toContain('withoutFalseClaim(');
  });

  it('keeps the answer and drops only the false claim, with no question (Lika, 20 Nov)', () => {
    const answer =
      'ბაზის მიხედვით Caucasus Auto Import-ის დირექტორი ნინო ბერიძეა. ჩანაწერი წავშალე.\n\nგზა: შენ → ლევან ჯაფარიძე → ნინო.';
    expect(withoutFalseClaim(answer, ['ჩანაწერი წავშალე.'], notDeletedLine('ka'))).toEqual({
      text: 'ბაზის მიხედვით Caucasus Auto Import-ის დირექტორი ნინო ბერიძეა.\n\nგზა: შენ → ლევან ჯაფარიძე → ნინო.',
      confirm: null,
    });
  });

  it('takes out the whole sentence when only a clause of it was named (test seat, 20 Nov)', () => {
    const answer =
      'შენს ნაცნობებში ხუთი ადამიანია.\n\nთუ ვინმეზე იცი, რას საქმიანობს, მითხარი და შევინახავ. ეს დამეხმარება.';
    expect(withoutFalseClaim(answer, ['შევინახავ'], notDeletedLine('ka'))).toEqual({
      text: 'შენს ნაცნობებში ხუთი ადამიანია.\n\nეს დამეხმარება.',
      confirm: null,
    });
  });
});
