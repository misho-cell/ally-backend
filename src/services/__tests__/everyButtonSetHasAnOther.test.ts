import { readFileSync } from 'fs';
import { join } from 'path';
import { otherChoiceLabel, withOtherChoice } from '../otherChoice';

/**
 * Board #68, Misho 3 October: every set of buttons also offers „other, I'll
 * write it", added by the server in the conversation's language.
 */
describe('withOtherChoice', () => {
  it('adds the other option after the model’s own buttons', () => {
    expect(withOtherChoice(['ვამტკიცებ', 'შევცვალოთ'], 'ka')).toEqual([
      'ვამტკიცებ',
      'შევცვალოთ',
      'სხვა, მე დავწერ',
    ]);
  });

  it('speaks the conversation’s language', () => {
    expect(withOtherChoice(['Yes', 'No'], 'en')).toEqual(['Yes', 'No', "Other, I'll write it"]);
    expect(otherChoiceLabel('ru')).toBe('Другое, напишу сам');
    expect(otherChoiceLabel('es')).toBe('Otro, lo escribo yo');
  });

  it('keeps a set that already offers its own other option as it is', () => {
    expect(withOtherChoice(['კი', 'სხვა ვარიანტი'], 'ka')).toEqual(['კი', 'სხვა ვარიანტი']);
    expect(withOtherChoice(['Yes', 'Other…'], 'en')).toEqual(['Yes', 'Other…']);
  });

  it('adds nothing where there are no buttons', () => {
    expect(withOtherChoice(null, 'ka')).toBeNull();
    expect(withOtherChoice([], 'ka')).toEqual([]);
  });

  it('is applied to the buttons that are stored and shown', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('const storedChoices = withOtherChoice(');
  });
});
