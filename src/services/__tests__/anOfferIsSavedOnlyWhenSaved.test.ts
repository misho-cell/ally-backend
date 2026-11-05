import { readFileSync } from 'fs';
import { join } from 'path';
import { offerClaimWithoutTool, offerNotSavedLine } from '../offerClaim';
import { ClaimKind, OwnerAsk } from '../replyClaims.service';
import { claimsRead } from './helpers/replyClaims';

/**
 * 3796 (box 48569): „დავიმახსოვრე შენი შეთავაზება" with no save_offer call.
 * #8779 c: the readings are the small model's; the tool is the server's check.
 */
describe('a reply that says an offer was saved', () => {
  const claim = 'დავიმახსოვრე შენი შეთავაზება: სტუმარმასპინძლობა აჭარაში.';
  const offered = claimsRead({ [ClaimKind.OfferSaved]: [claim] }, [OwnerAsk.OffersOwnService]);

  it('is caught when save_offer did not run', () => {
    expect(offerClaimWithoutTool(offered, ['search_by_tag'])).toBe(true);
  });

  it('stands when save_offer ran', () => {
    expect(offerClaimWithoutTool(offered, ['save_offer'])).toBe(false);
  });

  it('is left alone when the owner offered nothing of their own (#8218)', () => {
    expect(offerClaimWithoutTool(claimsRead({ [ClaimKind.OfferSaved]: [claim] }), [])).toBe(false);
  });

  it('is left alone when the reply claims no offer saved', () => {
    const profile = claimsRead({ [ClaimKind.Saved]: ['დავიმახსოვრე.'] }, [
      OwnerAsk.OffersOwnService,
    ]);
    expect(offerClaimWithoutTool(profile, [])).toBe(false);
  });

  it('gives the owner the truth and one confirm button', () => {
    expect(offerNotSavedLine('ka')).toEqual({
      text: 'შეთავაზება ჯერ არ შემინახავს. დამიდასტურე და ახლავე შევინახავ.',
      confirm: 'კი, შეინახე',
    });
    expect(offerNotSavedLine('en').confirm).toBe('Yes, save it');
  });

  it('tells the model that an explicit „save it" is the yes (§113.2)', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const tool = chat.slice(chat.indexOf("name: 'save_offer'"));
    expect(tool.slice(0, 900).replace(/' \+\s+'/gu, '')).toContain(
      'their request is the yes; do not read it back',
    );
  });

  it('runs in the owner’s turn, before the buttons pass the editor', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const guard = chat.indexOf('offerClaimWithoutTool(claimsNow, toolNamesUsed)');
    const editor = chat.indexOf('choices = await checkedOwnerButtons(finalText, choices');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(editor);
  });
});
