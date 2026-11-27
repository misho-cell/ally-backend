/**
 * Misho, 24 Nov: after the ways in, the search shows everyone in the owner's own
 * contacts with a tie to the field — ten at most, in the app and in WhatsApp —
 * each with one reason the owner can see, and never someone already given.
 */
jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { LevelFindings, ResearchLevel, ownContactsLeft } from '../fullResearch.service';
import {
  MAX_OWN_CONTACTS_SHOWN,
  OWN_CONTACTS_KIND,
  OwnTieKind,
  ownContactsAfterReply,
  ownContactsInField,
  ownContactsItem,
  stemsOf,
  tieOf,
  isInField,
} from '../ownContactsInField';
import { renderPendingMessage } from '../pendingMessages';

const nino = { phone: '+995 555 000 001', name: 'Nino Beridze', tags: ['ძმაკაცი', 'არქიტექტორი'] };
const levan = {
  phone: '+995 555 000 002',
  name: 'Levan Japaridze',
  tags: ['Levan', 'არქიტექტორი'],
};
const mariam = {
  phone: '+995 555 000 003',
  name: 'Mariam Lomidze',
  tags: [],
  jobPosition: 'ინჟინერი',
  employer: 'Build LLC',
};
const stranger = { phone: '+995 555 000 004', name: 'Saved Me', tags: [], they_saved_you: true };

describe('who is listed', () => {
  it('lists own contacts once each, those found by more searches first', () => {
    const found = ownContactsInField(
      [{ results: [nino, levan] }, { results: [levan, mariam, stranger] }],
      'არქიტექტორი',
      () => true,
    );
    expect(found.map((c) => c.name)).toEqual(['Levan Japaridze', 'Nino Beridze']);
    expect(found[0].hits).toBe(2);
  });

  it('offers no one only other people’s phones tie to it, nor anyone with no reason to say (Lika, 27 Nov)', () => {
    const othersOnly = { ...levan, tags: ['Levan'], found_by_others_labels: true };
    const ownWorkOnly = { ...mariam, phone: '+995 555 000 006', found_by_their_own_work: 'note' };
    const found = ownContactsInField(
      [{ results: [othersOnly, ownWorkOnly, nino] }],
      'არქიტექტორი',
      () => true,
    );
    expect(found.map((c) => c.name)).toEqual(['Nino Beridze']);
  });

  it('offers only people whose work is in the field, as the owner saved them (Lika, 27 Nov)', () => {
    const asSaved = { ...nino, name: 'Nino B. Registered', saved_as: 'Nino Beridze' };
    const savedUnderNoName = { ...nino, phone: '+995 555 000 005', saved_as: null };
    const otherTrade = { ...mariam, tags: ['Mariam'] };
    const found = ownContactsInField(
      [{ results: [asSaved, savedUnderNoName, otherTrade] }],
      'არქიტექტორი',
      () => true,
    );
    expect(found.map((c) => c.name)).toEqual(['Nino Beridze']);
  });

  it('leaves out a note about someone the owner does not hold', () => {
    const note = { contact_id: '+995555000009', name: 'Far Away', matched: ['builder'] };
    const held = { ...note, contact_id: '+995555000010', name: 'Near By', in_your_contacts: true };
    const notHeld = { ...note, in_your_contacts: false };
    const names = ownContactsInField(
      [{ results: [note, notHeld, held] }],
      'builder',
      () => true,
    ).map((c) => c.name);
    expect(names).toEqual(['Near By']);
  });

  it('leaves out who the caller says was already given or written to', () => {
    const found = ownContactsInField(
      [{ results: [nino, levan] }],
      'არქიტექტორი',
      (_p, n) => n !== 'Nino Beridze',
    );
    expect(found.map((c) => c.name)).toEqual(['Levan Japaridze']);
  });

  it('takes the research’s own levels only, without anyone answered or asked before', () => {
    const findings: LevelFindings[] = [
      { level: ResearchLevel.Own, result: { results: [nino, mariam] } },
      {
        level: ResearchLevel.Second,
        result: { results: [{ phone: '+995555000020', name: 'Far' }] },
      },
      { level: ResearchLevel.OwnSaved, result: { results: [levan] } },
    ];
    const left = ownContactsLeft(findings, 'არქიტექტორი', 'პირველად nino beridze-ს ვკითხავდი', {
      asked: new Set(['995555000003']),
      introduced: new Set(),
    });
    expect(left.map((c) => c.name)).toEqual(['Levan Japaridze']);
  });
});

describe('only the ones really in the field (Misho, 26 Nov)', () => {
  const stems = stemsOf('სნოუბორდის ტრენერი');
  const placeInName = {
    phone: '+995 555 000 030',
    name: 'Nino Bakuriani',
    tags: ['მეზობელი'],
  };

  it('a request word only in the saved name, with tags about something else, is not a tie', () => {
    expect(isInField({ ...placeInName, name: 'Nino სნოუბორდი' }, stems)).toBe(false);
    const found = ownContactsInField(
      [{ results: [{ ...placeInName, name: 'Nino სნოუბორდი' }] }],
      'სნოუბორდის ტრენერი',
      () => true,
    );
    expect(found).toEqual([]);
  });

  it('a tag or job carrying the request, a note, others’ labels or their own work is a tie', () => {
    expect(isInField({ ...placeInName, tags: ['ტრენერი'] }, stems)).toBe(true);
    expect(
      isInField({ ...placeInName, tags: [], jobPosition: 'სნოუბორდის ინსტრუქტორი' }, stems),
    ).toBe(true);
    expect(isInField({ ...placeInName, matched: ['ასწავლის'] }, stems)).toBe(true);
    expect(isInField({ ...placeInName, found_by_others_labels: true }, stems)).toBe(true);
    expect(isInField({ ...placeInName, found_by_their_own_work: 'note' }, stems)).toBe(true);
  });

  it('a row with nothing about their work at all is not a tie', () => {
    expect(isInField({ phone: '+995 555 000 031', name: 'Levan Japaridze', tags: [] }, stems)).toBe(
      false,
    );
  });
});

describe('the reason shown', () => {
  const stems = stemsOf('არქიტექტორი');

  it('quotes the owner’s own label, the one that carries the word first', () => {
    expect(tieOf(nino, stems)).toEqual({ kind: OwnTieKind.Label, value: 'არქიტექტორი' });
  });

  it('never quotes other people’s labels', () => {
    const othersOnly = { ...levan, tags: ['Levan'], found_by_others_labels: true };
    expect(tieOf(othersOnly, stems)).toEqual({ kind: OwnTieKind.OthersLabels, value: '' });
  });

  it('names the work a profile states, and says nothing of a self-description', () => {
    expect(tieOf(mariam, stems)).toEqual({ kind: OwnTieKind.Work, value: 'ინჟინერი, Build LLC' });
    expect(tieOf({ ...mariam, found_by_their_own_work: 'note' }, stems).kind).toBe(
      OwnTieKind.Plain,
    );
  });

  it('quotes the owner’s own note, but never a hidden one', () => {
    expect(tieOf({ matched: ['builds houses'] }, stems)).toEqual({
      kind: OwnTieKind.Note,
      value: 'builds houses',
    });
    expect(tieOf({ matched: ['[your own hidden note — matched, not shown]'] }, stems).kind).toBe(
      OwnTieKind.Plain,
    );
  });
});

describe('the card', () => {
  const many = Array.from({ length: 13 }, (_, i) => ({
    phone: `+99555500${String(i).padStart(4, '0')}`,
    name: `Person ${i + 1}`,
    tie: { kind: OwnTieKind.Label, value: 'მშენებელი' },
    hits: 1,
  }));

  it('drops who the answer named and shows the best ten, nothing more', () => {
    const item = ownContactsItem(many);
    expect(item?.kind).toBe(OWN_CONTACTS_KIND);
    const left = ownContactsAfterReply(item?.payload ?? {}, 'Person 1 is your best way in');
    expect((left?.contacts as unknown[]).length).toBe(MAX_OWN_CONTACTS_SHOWN);
    expect(left).not.toHaveProperty('rest');
    expect(JSON.stringify(left)).not.toContain('"Person 1"');
  });

  it('says nothing when there is nobody, or nobody the answer left out', () => {
    expect(ownContactsItem([])).toBeNull();
    const one = ownContactsItem(many.slice(0, 1));
    expect(ownContactsAfterReply(one?.payload ?? {}, 'ask Person 1 first')).toBeNull();
  });

  it('reads in Georgian with a reason per person, ten at most, with no „show them all"', () => {
    const payload = ownContactsAfterReply(ownContactsItem(many)?.payload ?? {}, '') ?? {};
    const card = renderPendingMessage({ kind: OWN_CONTACTS_KIND, task_id: null, payload }, 'ka');
    expect(card?.text).toContain('შენს კონტაქტებში ამ სფეროსთან კიდევ ესენი არიან');
    expect(card?.text).toContain('• Person 1 — შენ შენახული გყავს როგორც „მშენებელი"');
    expect(card?.text).toContain('• Person 10');
    expect(card?.text).not.toContain('• Person 11');
    expect(card?.text).not.toContain('ყველას გაჩვენებ');
    expect(card?.choices).toEqual([]);
    expect(card?.instruction).toBe('');
  });

  it('has no button when all fit', () => {
    const payload =
      ownContactsAfterReply(ownContactsItem(many.slice(0, 3))?.payload ?? {}, '') ?? {};
    const card = renderPendingMessage({ kind: OWN_CONTACTS_KIND, task_id: null, payload }, 'en');
    expect(card?.choices).toEqual([]);
    expect(card?.text).not.toContain('more, and');
  });
});

describe('the run delivers it after the answer, in WhatsApp too', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('notes the card when the research is taken, and filters it by the reply', () => {
    expect(chat).toContain('const ownContacts = ownContactsItem(taken.ownContacts);');
    expect(chat).toContain('const replyItems = withOwnContactsAfterReply(pendingItems, reply);');
  });

  it('is never held back as another goal’s item', () => {
    expect(chat).toMatch(/THIS_REPLYS_OWN[^;]*OWN_CONTACTS_KIND/su);
  });
});
