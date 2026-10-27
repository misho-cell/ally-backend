import { nameInsideLabel } from '../georgianScriptName';
import { renderPendingMessage } from '../pendingMessages';

/**
 * #8020 (d) (case 63857): server lines read raw phonebook labels — „ლაშა
 * Kurashvili. ახელ", „LIST. Lika Osepashvili. Ally. Force". Only the name
 * inside a label is said; a label with no name in it says nothing.
 */
describe('the name inside a phonebook label', () => {
  it('drops what the label adds around the name', () => {
    expect(nameInsideLabel('ლაშა Kurashvili. ახელ')).toBe('ლაშა Kurashvili');
    expect(nameInsideLabel('LIST. Lika Osepashvili. Ally. Force')).toBe('Lika Osepashvili');
  });

  it('is nothing when no piece opens on a first name', () => {
    expect(nameInsideLabel('BMW service')).toBeNull();
    expect(nameInsideLabel('')).toBeNull();
  });
});

describe('the new-member card (#8020 d)', () => {
  it('says the name inside the owner’s label, not the label', () => {
    const out = renderPendingMessage(
      {
        kind: 'new_member_for_goal',
        task_id: 9,
        payload: {
          who: 'LIST. Lika Osepashvili. Ally. Force',
          organisation: 'tbc',
          goal_title: 'a meeting at TBC',
        },
      },
      'en',
    );
    expect(out?.text).toContain('Lika Osepashvili has just opened Netai');
    expect(out?.text).not.toContain('LIST');
  });
});
