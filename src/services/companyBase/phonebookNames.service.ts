import { readPhonebooks, readRoster } from '../axelExport/axelData';
import { normalizePhone } from '../phone';
import { nameKey } from '../tools/transliterate';
import { labelNameKeys, NamePlacement, NamesOnANumber } from './phonebookNames';

/**
 * #7525, #6997: every name a number is known by — the roster's own names, and
 * the labels the members saved in their phonebooks. Read live; no number
 * leaves the server.
 */
export async function namesOnNumbers(): Promise<NamesOnANumber[]> {
  const roster = await readRoster();
  const ids = roster.map((m) => m.user_id).filter((id): id is number => id !== null);
  const labels = await readPhonebooks(ids);
  return [
    ...roster.map((m) => ({
      phone: m.phone,
      names: [m.name ?? '', ...m.match_names].map(nameKey),
      from: NamePlacement.Member,
    })),
    ...labels.map((r) => ({
      phone: normalizePhone(r.contact_digits),
      names: labelNameKeys(r.label ?? ''),
      from: NamePlacement.Phonebook,
    })),
  ];
}
