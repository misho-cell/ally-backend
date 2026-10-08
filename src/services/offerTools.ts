import { deleteOffer, listOffers, OfferRefused, saveOffer } from './offers.service';

/**
 * 1698 (A15): the three offer tools' work. Server gates, not prompt hopes: an
 * offer is saved only in the owner's own run and only with `confirmed: true`,
 * the owner having said yes to the one line the assistant read back to him.
 */
export const OFFER_OWNER_ONLY =
  'Not in this run: an offer is saved only when the owner says it in their own message.';
export const OFFER_NEEDS_CONFIRMATION =
  'Not saved yet. Read the one line back to the owner and ask if it is right; call again with ' +
  'confirmed: true only after their yes.';

export interface ToolInput {
  readonly [key: string]: unknown;
}

export async function saveOfferTool(
  userId: string,
  input: ToolInput,
  ownerAbsent: boolean,
): Promise<Record<string, unknown>> {
  if (ownerAbsent) return { saved: false, error: OFFER_OWNER_ONLY };
  if (input['confirmed'] !== true)
    return { saved: false, needs_confirmation: true, note: OFFER_NEEDS_CONFIRMATION };
  const text = typeof input['text'] === 'string' ? input['text'] : '';
  const field = typeof input['field'] === 'string' ? input['field'] : null;
  try {
    const offer = await saveOffer(userId, text, field);
    return { saved: true, offer_id: offer.id };
  } catch (err) {
    if (err instanceof OfferRefused) return { saved: false, error: err.message };
    throw err;
  }
}

export async function listOffersTool(userId: string): Promise<Record<string, unknown>> {
  const offers = await listOffers(userId);
  return { offers: offers.map((o) => ({ offer_id: o.id, text: o.text, field: o.field })) };
}

export async function deleteOfferTool(
  userId: string,
  input: ToolInput,
  ownerAbsent: boolean,
): Promise<Record<string, unknown>> {
  if (ownerAbsent) return { deleted: false, error: OFFER_OWNER_ONLY };
  return { deleted: await deleteOffer(userId, Number(input['offer_id'])) };
}
