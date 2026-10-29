import { query } from '../../db/postgres/client';
import { NamedNumber, NamePlacement, phonesByUniqueName } from '../companyBase/phonebookNames';
import { namesOnNumbers } from '../companyBase/phonebookNames.service';
import { nameKey } from '../tools/transliterate';
import { writePhones } from './rosterPhones.service';

/**
 * #6997 (tester: Arsen Dlyanchev's CELA 16 classmates are keyed by package
 * tokens made under a retired key, so none has a number and known_by stays
 * empty). Misho, 29 Oct: the old key cannot be recovered, „make a new list".
 * A person in the store with no number gets the one number whose roster name
 * or phonebook label carries their full name (phonebookNames). A name two
 * numbers carry, or two people in the store share, is left without one.
 */
const QUERY_TIMEOUT_MS = 10_000;
/** The store holds about 1,550 people; this is a ceiling, not a page. */
const MAX_PEOPLE_READ = 10_000;

export interface PhonebookPhonesReport {
  readonly dry_run: boolean;
  readonly without_number: number;
  readonly by_member_name: number;
  readonly by_phonebook_name: number;
  readonly shared_name: number;
  readonly written: number;
}

interface NamelessPerson {
  readonly person_key: string;
  readonly name: string;
}

async function peopleWithoutNumber(): Promise<NamelessPerson[]> {
  const result = await query<NamelessPerson>(
    `SELECT person_key, name FROM base_people WHERE phone IS NULL ORDER BY person_key LIMIT $1`,
    [MAX_PEOPLE_READ],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** Pure: each person's number, when their name is theirs alone in the store and on one number. */
export function phonesForPeople(
  people: readonly NamelessPerson[],
  byName: ReadonlyMap<string, NamedNumber>,
): { phones: Map<string, NamedNumber>; sharedName: number } {
  const keysByName = new Map<string, string[]>();
  for (const p of people) {
    const key = nameKey(p.name);
    keysByName.set(key, [...(keysByName.get(key) ?? []), p.person_key]);
  }
  const phones = new Map<string, NamedNumber>();
  let sharedName = 0;
  for (const [key, personKeys] of keysByName) {
    const found = byName.get(key);
    if (found === undefined) continue;
    if (personKeys.length > 1) {
      sharedName += personKeys.length;
      continue;
    }
    phones.set(personKeys[0], found);
  }
  return { phones, sharedName };
}

/** Fills the store's missing numbers from the members' phonebooks by name; a dry run writes nothing. */
export async function fillBasePhonesByPhonebookName(
  dryRun: boolean,
): Promise<PhonebookPhonesReport> {
  const people = await peopleWithoutNumber();
  const { phones, sharedName } = phonesForPeople(
    people,
    phonesByUniqueName(await namesOnNumbers()),
  );
  const found = [...phones.values()];
  const plain = new Map([...phones].map(([personKey, n]) => [personKey, n.phone]));
  return {
    dry_run: dryRun,
    without_number: people.length,
    by_member_name: found.filter((n) => n.from === NamePlacement.Member).length,
    by_phonebook_name: found.filter((n) => n.from === NamePlacement.Phonebook).length,
    shared_name: sharedName,
    written: dryRun ? 0 : await writePhones(plain),
  };
}
