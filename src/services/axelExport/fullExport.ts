import { phoneDigits } from '../phone';
import { userLanguage } from '../threads.service';
import { toCsv, type CsvValue } from './csv';
import { exportPhoneHash } from './exportHash';
import { buildMemberFiles, readInputs, type ExportFile } from './axelExport.service';
import { keyedRoster, ownerIndex, type MemberInputs } from './memberFiles';
import {
  readBlocks,
  readEnrichment,
  readExclusions,
  readFacts,
  readInsights,
  readIntroductions,
  readInvites,
  readMemberOther,
  readOwnerAsks,
  readOwnerTies,
  readWarmthEvents,
  type FactRow,
} from './axelDataB';
import {
  CONTACT_COLUMNS,
  FACT_COLUMNS,
  contactIndex,
  contactRow,
  factRows,
  type ContactInputs,
  type RowContext,
} from './contactFiles';
import {
  MEMBER_TO_MEMBER_COLUMNS,
  SHARED_CONTACT_COLUMNS,
  memberToMember,
  reachSummary,
  relationshipDistribution,
  sharedContacts,
  tagFrequency,
  topEmployers,
} from './crossingFiles';
import { DATA_DICTIONARY_FULL } from './dataDictionaryFull';

/**
 * The Axel export, full (Misho's word, 6 Oct; the founder's request of 11:22,
 * parts A to F): the first delivery's two files plus every phonebook row, the
 * facts, the crossings, the roster-wide aggregates and everything else per
 * member, with the data dictionary and a manifest.
 */
async function readContactInputs(members: MemberInputs): Promise<ContactInputs> {
  const ids = members.roster.map((m) => m.user_id).filter((id): id is number => id !== null);
  const digits = [...new Set(members.phonebooks.map((r) => r.contact_digits))];
  const [facts, insights, exclusions, blocks, warmth, intros, invites, ties, asks, enrichment] =
    await Promise.all([
      readFacts(digits),
      readInsights(ids),
      readExclusions(ids),
      readBlocks(ids),
      readWarmthEvents(ids),
      readIntroductions(ids),
      readInvites(ids),
      readOwnerTies(ids),
      readOwnerAsks(ids),
      readEnrichment(digits),
    ]);
  return { facts, insights, exclusions, blocks, warmth, intros, invites, ties, asks, enrichment };
}

function rowContext(members: MemberInputs, contacts: ContactInputs): RowContext {
  const keyed = keyedRoster(members.roster);
  return {
    members,
    idx: ownerIndex(members),
    cidx: contactIndex(contacts),
    enrichment: contacts.enrichment,
    rosterKeyByDigits: new Map(keyed.map(({ key, m }) => [phoneDigits(m.phone), key])),
    rosterKeyByUserId: new Map(
      keyed.filter(({ m }) => m.user_id !== null).map(({ key, m }) => [m.user_id as number, key]),
    ),
  };
}

const file = (
  name: string,
  columns: readonly string[],
  rows: Record<string, CsvValue>[],
): ExportFile => ({
  name,
  body: toCsv(columns, rows),
  rows: rows.length,
});

const columnsOf = (rows: Record<string, CsvValue>[]): string[] =>
  rows[0] ? Object.keys(rows[0]) : [];

async function memberOtherFile(members: MemberInputs, ctx: RowContext): Promise<ExportFile> {
  const ids = members.roster.map((m) => m.user_id).filter((id): id is number => id !== null);
  const other = await readMemberOther(ids);
  const languages = new Map(
    await Promise.all(ids.map(async (id) => [id, await userLanguage(String(id))] as const)),
  );
  const rows = other.map((o) => ({
    roster_key: ctx.rosterKeyByUserId.get(o.id) ?? '',
    member_hash: exportPhoneHash(members.roster.find((m) => m.user_id === o.id)?.phone ?? ''),
    language: languages.get(o.id) ?? '',
    ...o,
  }));
  return file('member_other.csv', columnsOf(rows), rows);
}

function crossFiles(contacts: Record<string, CsvValue>[], facts: readonly FactRow[]): ExportFile[] {
  const tags = tagFrequency(contacts);
  const employers = topEmployers(contacts, facts);
  const distribution = relationshipDistribution(contacts);
  const reach = reachSummary(contacts);
  return [
    file('crossings_member_to_member.csv', MEMBER_TO_MEMBER_COLUMNS, memberToMember(contacts)),
    file('crossings_shared_contacts.csv', SHARED_CONTACT_COLUMNS, sharedContacts(contacts)),
    file('aggregates_tag_frequency.csv', ['tag', 'contacts', 'members_using'], tags),
    file('aggregates_top_employers.csv', ['employer', 'contacts'], employers),
    file('aggregates_relationship_distribution.csv', ['field', 'value', 'count'], distribution),
    file('aggregates_reach.csv', ['measure', 'value'], reach),
  ];
}

export function fullManifest(files: readonly ExportFile[], exportedAt: string): ExportFile {
  const body = JSON.stringify(
    {
      export: 'axel_members',
      delivery: 'full: parts A to F',
      exported_at: exportedAt,
      files: files.map((f) => ({ name: f.name, rows: f.rows })),
      hashed: 'every phone number, by a keyed HMAC (see data_dictionary.md)',
      not_in_the_base: [
        'tag colours: no tag has a colour anywhere in the base',
        'mentions in conversations: no counter exists; conversation text is not exported',
      ],
    },
    null,
    2,
  );
  return { name: 'manifest.json', body, rows: null };
}

export async function buildAxelExportFull(exportedAt: string): Promise<ExportFile[]> {
  const members = await readInputs();
  const contactsIn = await readContactInputs(members);
  const ctx = rowContext(members, contactsIn);
  const contacts = members.phonebooks.map((r) => contactRow(r, ctx));
  const keyByUser = new Map([...ctx.rosterKeyByUserId].map(([id, key]) => [String(id), key]));
  const files = [
    ...buildMemberFiles(members),
    file('contacts.csv', CONTACT_COLUMNS, contacts),
    file('contact_facts.csv', FACT_COLUMNS, factRows(contactsIn.facts, keyByUser)),
    ...crossFiles(contacts, contactsIn.facts),
    await memberOtherFile(members, ctx),
  ];
  const dictionary = { name: 'data_dictionary.md', body: DATA_DICTIONARY_FULL, rows: null };
  return [...files, dictionary, fullManifest(files, exportedAt)];
}
