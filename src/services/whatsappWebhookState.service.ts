import { PUBLIC_BASE_URL } from '../config/publicUrl';
import { businessAccountId, graph } from './whatsappSetup.service';

/**
 * Misho's test, 4 Nov: Lika's webhook is „on Subscribe" and the app is Live,
 * yet no WhatsApp delivery has ever reached the server. Meta delivers a
 * business account's messages only to the apps that account is subscribed to,
 * at the callback URL the number (or that app) names. This reads both from
 * Meta — app names and a yes/no on the URL, never an id, a token or a number.
 */
export const OUR_WEBHOOK_PATH = '/webhooks/whatsapp';

export interface WebhookState {
  readonly account_found: boolean;
  /** Names of the apps the business account delivers its messages to. */
  readonly subscribed_apps: readonly string[];
  /** Whether the callback URL Meta holds for the number is ours; null when Meta names none. */
  readonly number_webhook_is_ours: boolean | null;
}

interface SubscribedAppRow {
  readonly whatsapp_business_api_data?: { readonly name?: string };
}

/** The app names in Meta's subscribed_apps answer. */
export function subscribedAppNames(data: unknown): string[] {
  const rows = Array.isArray(data) ? (data as SubscribedAppRow[]) : [];
  return rows
    .map((row) => row.whatsapp_business_api_data?.name ?? '')
    .filter((name) => name !== '');
}

/** Whether the number's webhook_configuration points at this backend; null when none is set. */
export function webhookIsOurs(answer: unknown): boolean | null {
  const config = (answer as { webhook_configuration?: Record<string, unknown> } | null)
    ?.webhook_configuration;
  const urls = Object.values(config ?? {}).filter((v): v is string => typeof v === 'string');
  if (urls.length === 0) return null;
  const ours = `${PUBLIC_BASE_URL}${OUR_WEBHOOK_PATH}`;
  return urls.some((url) => url.trim().replace(/\/+$/u, '') === ours);
}

async function numberWebhookIsOurs(): Promise<boolean | null> {
  const phoneId = process.env.WHATSAPP_PHONE_ID?.trim();
  if (!phoneId) return null;
  return webhookIsOurs(await graph(`/${phoneId}?fields=webhook_configuration`));
}

/** Where Meta would send an inbound WhatsApp message, as far as Meta says. */
export async function whatsappWebhookState(): Promise<WebhookState> {
  const account = await businessAccountId();
  if (account === null) {
    return { account_found: false, subscribed_apps: [], number_webhook_is_ours: null };
  }
  const apps = await graph(`/${account}/subscribed_apps`);
  return {
    account_found: true,
    subscribed_apps: subscribedAppNames(apps.data),
    number_webhook_is_ours: await numberWebhookIsOurs(),
  };
}
