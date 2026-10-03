import { readFileSync } from 'fs';
import { join } from 'path';
import {
  isOtherChoiceTap,
  OTHER_CHOICE_TURN_NOTE,
  otherChoiceField,
  otherChoiceIndex,
  otherChoiceLabel,
  withOtherChoice,
} from '../otherChoice';

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

/**
 * The frontend's ask (TO_BACKEND, 3 Oct): a structural mark for the appended
 * button, so the client stops matching on our wording.
 */
describe('other_choice_index', () => {
  it('points at the server’s button, in every language', () => {
    expect(otherChoiceIndex(['კი', 'არა', 'სხვა, მე დავწერ'])).toBe(2);
    expect(otherChoiceIndex(['Yes', "Other, I'll write it"])).toBe(1);
    expect(otherChoiceIndex(['Да', 'Другое, напишу сам'])).toBe(1);
    expect(otherChoiceIndex(['Sí', 'Otro, lo escribo yo'])).toBe(1);
  });

  it('flags nothing for a model-made „other" or a set without one', () => {
    expect(otherChoiceIndex(['კი', 'სხვა ვარიანტი'])).toBeUndefined();
    expect(otherChoiceIndex(['ვნახოთ', 'მოგვიანებით'])).toBeUndefined();
    expect(otherChoiceIndex(null)).toBeUndefined();
    expect(otherChoiceIndex([])).toBeUndefined();
  });

  it('is spread as a field only when there is one', () => {
    expect(otherChoiceField(['კი', 'სხვა, მე დავწერ'])).toEqual({ other_choice_index: 1 });
    expect(otherChoiceField(['კი'])).toEqual({});
  });

  it('travels with every button set the client receives', () => {
    const routes = join(__dirname, '..', '..', 'api', 'routes');
    const threads = readFileSync(join(routes, 'threads.routes.ts'), 'utf8');
    const chatRoute = readFileSync(join(routes, 'chat.routes.ts'), 'utf8');
    expect(threads).toContain('...otherChoiceField(result.choices),');
    expect(threads).toContain('...otherChoiceField(message.choices)');
    expect(chatRoute).toContain('...otherChoiceField(result.choices),');
  });
});

/**
 * The tester's 1088 (32440): the label sent as the owner's message was read as
 * an answer („I will write the invitation myself") and a link went out.
 */
describe('the label arriving as text', () => {
  it('is recognised in every language, and only as the whole message', () => {
    expect(isOtherChoiceTap(' სხვა, მე დავწერ ')).toBe(true);
    expect(isOtherChoiceTap("Other, I'll write it")).toBe(true);
    expect(isOtherChoiceTap('სხვა, მე დავწერ მოსაწვევს')).toBe(false);
    expect(isOtherChoiceTap('სხვა')).toBe(false);
    expect(isOtherChoiceTap(null)).toBe(false);
  });

  it('gets one short line with no tools, asking the owner to type', () => {
    expect(OTHER_CHOICE_TURN_NOTE).toContain('This turn has no tools');
    expect(OTHER_CHOICE_TURN_NOTE).toContain('Do not treat the label as an answer');
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'const otherTap = !ownerAbsent && isOtherChoiceTap(lastOwnerText(messages));',
    );
    expect(chat).toContain('...(otherTap && { forceText: true');
  });
});
