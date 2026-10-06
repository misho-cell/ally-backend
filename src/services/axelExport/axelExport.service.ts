import archiver from 'archiver';
import { PassThrough } from 'stream';
import { phoneDigits } from '../phone';
import { toCsv } from './csv';
import {
  readAccounts,
  readAccountsByDigits,
  readDigitsWithFacts,
  readLegacyColours,
  readMemberActivity,
  readPhonebooks,
  readRoster,
  readScores,
  readStatedClose,
  readTags,
  readTiers,
  type PhonebookRow,
} from './axelData';
import {
  AGGREGATE_COLUMNS,
  MEMBER_COLUMNS,
  aggregateRow,
  keyedRoster,
  memberRow,
  ownerIndex,
  type MemberInputs,
} from './memberFiles';
import { DATA_DICTIONARY_PART_A_D } from './dataDictionary';

/**
 * The Axel export, first delivery (Misho's word, 6 Oct): parts A and D — the
 * roster members and the per-member counts — as one zip, with the data
 * dictionary and a manifest of row counts, export time, what was hashed and
 * what is left for the second delivery.
 */
export interface ExportFile {
  readonly name: string;
  readonly body: string;
  readonly rows: number | null;
}

async function readInputs(): Promise<MemberInputs> {
  const roster = await readRoster();
  const ids = roster.map((m) => m.user_id).filter((id): id is number => id !== null);
  const phonebooks = await readPhonebooks(ids);
  const contactDigits = [
    ...new Set([
      ...phonebooks.map((r) => r.contact_digits),
      ...roster.map((m) => phoneDigits(m.phone)),
    ]),
  ];
  const [accounts, activity, tags, scores, tiers, legacy, statedClose, withFacts, byDigits] =
    await Promise.all([
      readAccounts(ids),
      readMemberActivity(ids),
      readTags(ids),
      readScores(ids),
      readTiers(ids),
      readLegacyColours(ids),
      readStatedClose(ids),
      readDigitsWithFacts(contactDigits),
      readAccountsByDigits(contactDigits),
    ]);
  return {
    roster,
    accounts,
    activity,
    phonebooks,
    tags,
    scores,
    tiers,
    legacy,
    statedClose,
    digitsWithFacts: withFacts,
    accountsByDigits: byDigits,
  };
}

export function buildMemberFiles(inputs: MemberInputs): ExportFile[] {
  const keyed = keyedRoster(inputs.roster);
  const idx = ownerIndex(inputs);
  const axelDigits = new Set(inputs.roster.map((m) => phoneDigits(m.phone)));
  const byOwner = new Map<number, PhonebookRow[]>();
  for (const r of inputs.phonebooks)
    byOwner.set(r.owner_id, [...(byOwner.get(r.owner_id) ?? []), r]);
  const own = (userId: number | null): PhonebookRow[] =>
    userId === null ? [] : (byOwner.get(userId) ?? []);
  const members = keyed.map(({ key, m }) => memberRow(key, m, inputs, own(m.user_id)));
  const aggregates = keyed.map(({ key, m }) =>
    aggregateRow(key, m, inputs, own(m.user_id), idx, axelDigits),
  );
  return [
    { name: 'members.csv', body: toCsv(MEMBER_COLUMNS, members), rows: members.length },
    {
      name: 'aggregates_per_member.csv',
      body: toCsv(AGGREGATE_COLUMNS, aggregates),
      rows: aggregates.length,
    },
  ];
}

export function manifest(files: readonly ExportFile[], exportedAt: string): ExportFile {
  const body = JSON.stringify(
    {
      export: 'axel_members',
      delivery: 'first: parts A and D',
      exported_at: exportedAt,
      files: files.map((f) => ({ name: f.name, rows: f.rows })),
      hashed: 'every phone number, by a keyed HMAC (see data_dictionary.md)',
      left_out_until_the_second_delivery: [
        'B: every phonebook row',
        'C: the crossings',
        'D: the cross-roster aggregates (tag frequency, top employers, distributions)',
        'E: everything else per member',
        'language per member',
      ],
    },
    null,
    2,
  );
  return { name: 'manifest.json', body, rows: null };
}

export async function buildAxelExportFirstDelivery(exportedAt: string): Promise<ExportFile[]> {
  const files = buildMemberFiles(await readInputs());
  const dictionary = { name: 'data_dictionary.md', body: DATA_DICTIONARY_PART_A_D, rows: null };
  return [...files, dictionary, manifest(files, exportedAt)];
}

/** One zip in memory: the files are small (one row per member). */
export async function zipFiles(files: readonly ExportFile[]): Promise<Buffer> {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const sink = new PassThrough();
  const chunks: Buffer[] = [];
  sink.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve, reject) => {
    sink.on('end', resolve);
    archive.on('error', reject);
  });
  archive.pipe(sink);
  for (const f of files) archive.append(f.body, { name: f.name });
  await archive.finalize();
  await done;
  return Buffer.concat(chunks);
}
