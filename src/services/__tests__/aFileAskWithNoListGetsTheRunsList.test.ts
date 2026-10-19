import { readFileSync } from 'fs';
import { join } from 'path';
import { contactsAsList, listedNames, withEarlierListForAFile, withFileLine } from '../excelLine';

/** The tester's 68835, thread 60506, word for word. */
const OWNER = 'ჩემი კონტაქტების სია Word ფაილად მომეცი';
const REFUSAL =
  'აქედან შენს კონტაქტების სიას „ვორდის“ ჩამოსატვირთ ფაილად ვერ მოგიმზადებ. შემიძლია სია ' +
  'ტექსტად დაგილაგო, რომ პირდაპირ ჩასვა „ვორდში“.';

describe('#6074 retest: a file ask with no list in sight gets the list the run itself read', () => {
  const names = listedNames({
    contacts: [{ name: 'ნიკა ტესტაძე' }, { name: null }, { name: '  ' }, { name: 'ლიკა' }],
  });

  it('takes the owner’s own saved names, never an empty one', () => {
    expect(names).toEqual(['ნიკა ტესტაძე', 'ლიკა']);
    expect(contactsAsList(names)).toBe('- ნიკა ტესტაძე\n- ლიკა');
    expect(contactsAsList([])).toBeNull();
  });

  it('turns the refusal into the list and the line for its button', () => {
    const withList = withEarlierListForAFile(REFUSAL, contactsAsList(names), OWNER);
    const out = withFileLine(withList, OWNER, 'ka');
    expect(out).not.toContain('ვერ მოგიმზადებ');
    expect(out).not.toContain('ჩასვა');
    expect(out).toContain('- ნიკა ტესტაძე');
    expect(out.endsWith('ქვემოთ „Word“-ზე დაჭერით ეს სია ფაილად ჩამოიტვირთება.')).toBe(true);
  });

  it('leaves the reply alone when no file was asked for', () => {
    expect(
      withEarlierListForAFile(REFUSAL, contactsAsList(names), 'ვინ არიან ჩემი კონტაქტები?'),
    ).toBe(REFUSAL);
  });

  it('is wired: the run notes its list, and the file branch reads it', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('runListedContacts.set(runId, listedNames(listed));');
    expect(chat).toContain('contactsAsList(runListedContacts.get(runId) ?? []),');
    expect(chat).toContain('runListedContacts.delete(runId);');
  });
});
