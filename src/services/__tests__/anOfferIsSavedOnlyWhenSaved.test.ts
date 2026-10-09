import { readFileSync } from 'fs';
import { join } from 'path';
import { offerClaimWithoutTool, offerNotSavedLine } from '../offerClaim';

/** 3796 (box 48569): „დავიმახსოვრე შენი შეთავაზება" with no save_offer call. */
describe('a reply that says an offer was saved', () => {
  const owner =
    'ჩემი შეთავაზება სხვა წევრებისთვის: სტუმარმასპინძლობა აჭარაში. დაიმახსოვრე როგორც შეთავაზება.';
  const claim = 'დავიმახსოვრე შენი შეთავაზება: სტუმარმასპინძლობა აჭარაში.';

  it('is caught when save_offer did not run', () => {
    expect(offerClaimWithoutTool(claim, ['search_by_tag'], owner)).toBe(true);
  });

  it('stands when save_offer ran', () => {
    expect(offerClaimWithoutTool(claim, ['save_offer'], owner)).toBe(false);
  });

  it('leaves a saved profile line alone — no offer word on either side', () => {
    expect(
      offerClaimWithoutTool('დავიმახსოვრე, რომ ბუღალტერი ხარ.', [], 'ბუღალტერი ვარ, დაიმახსოვრე'),
    ).toBe(false);
  });

  it('leaves a read-back question alone — it says nothing was saved', () => {
    expect(
      offerClaimWithoutTool('ასე ჩავწერო შენი შეთავაზება: „სტუმარმასპინძლობა აჭარაში"?', [], owner),
    ).toBe(false);
  });

  it('is caught when the reply uses the verb (box 48874, onboarding run)', () => {
    const verb = 'დავიმახსოვრე: შენ სხვა წევრებს სთავაზობ იურიდიულ კონსულტაციას თბილისში.';
    expect(offerClaimWithoutTool(verb, [], owner)).toBe(true);
  });

  it('is caught when the reply names only the service (box 48975, onboarding run)', () => {
    const bare = 'დავიმახსოვრე: იურიდიული კონსულტაცია უძრავი ქონების გარიგებებზე თბილისში.';
    expect(offerClaimWithoutTool(bare, [], owner)).toBe(true);
  });

  it('leaves a reply alone when the owner named an offer but asked for nothing to be kept', () => {
    expect(
      offerClaimWithoutTool('დავიმახსოვრე, რომ ბუღალტერი ხარ.', [], 'რა შეთავაზებები მაქვს?'),
    ).toBe(false);
  });

  it('leaves „polite" alone — it shares the root, not the meaning', () => {
    expect(
      offerClaimWithoutTool('დავიმახსოვრე, თავაზიანად ვუპასუხებ.', [], 'რა შეთავაზებები მაქვს?'),
    ).toBe(false);
  });

  it('is caught in English too', () => {
    expect(
      offerClaimWithoutTool('I saved your offer.', [], 'Save this as my offer: logistics in Poti'),
    ).toBe(true);
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
      'When the owner already wrote the line and asked you to save it, that is their yes.',
    );
  });

  it('runs in the owner’s turn, before the buttons pass the editor', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const guard = chat.indexOf('offerClaimWithoutTool(finalText, toolNamesUsed');
    const editor = chat.indexOf('choices = await checkedOwnerButtons(finalText, choices');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(editor);
  });
});
