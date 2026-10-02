import { nameInBridgeBook } from './bridgePicker';
import { findContactPhonesByName } from './tools/nameMatch';

/**
 * The tester's 995 #5: an English-speaking mediator read „introduce them to
 * სანდრო" — the ASKER's label for the person, in the asker's script. The
 * mediator knows that person under his own name for them; that is the name
 * his side of the request uses, whenever it can be found exactly.
 *
 * The same reading the accept makes: the number on the request, else EXACTLY
 * ONE match for the asker's name in the mediator's book. Anything else keeps
 * the asker's name, which is what every request showed before.
 */
export async function targetNameForMediator(
  mediatorUserId: number,
  askersName: string,
  targetPhone: string | null,
): Promise<string> {
  try {
    const phone = targetPhone ?? (await onlyMatch(mediatorUserId, askersName));
    if (phone === null) return askersName;
    return (await nameInBridgeBook(String(mediatorUserId), phone)) ?? askersName;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      '[intro] could not read the mediator’s name for the target:',
      (err as Error).message,
    );
    return askersName;
  }
}

async function onlyMatch(mediatorUserId: number, name: string): Promise<string | null> {
  const matches = await findContactPhonesByName(String(mediatorUserId), name, 2);
  return matches.length === 1 ? (matches[0] ?? null) : null;
}
