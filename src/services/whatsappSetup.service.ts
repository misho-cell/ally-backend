import {
  GRAPH_URL,
  NOTIFY_TEMPLATE,
  TEMPLATE_LANGUAGE,
  WELCOME_TEMPLATE,
} from './whatsappChannel.service';

/**
 * Misho, 25 Oct: „შენით დაამატე ტექსტი … და ჩართე". The two templates Netai
 * needs are created in Meta from here, through the token the OTP already uses,
 * so no one has to type them into Meta's screens. Meta reviews each one; until
 * it says APPROVED nothing can go out with it.
 *
 * The business account is read from the token itself (debug_token), or from
 * WHATSAPP_WABA_ID when set. Nothing here prints the token or a number.
 */
const NOTIFY_EXAMPLE = 'ნინომ გიპასუხა: კი, გაგაცნობ. https://www.netai.guru/chat/1';

interface TemplateSpec {
  readonly name: string;
  readonly category: 'UTILITY';
  readonly body: string;
  readonly example: readonly string[];
}

/**
 * The texts, as Lika's brief of 27 Oct rewrote them so Meta reads them as
 * Utility: each names the one event (a reply in the person's own Netai chat,
 * or the setting they just switched on) and nothing promotional. A parameter
 * never starts or ends a body (Meta's rule).
 */
export const NETAI_TEMPLATES: readonly TemplateSpec[] = [
  {
    name: NOTIFY_TEMPLATE,
    category: 'UTILITY',
    body: 'Netai-ში შენს ჩატში ახალი პასუხია:\n\n{{1}}\n\nამ პასუხის სანახავად გახსენი Netai.',
    example: [NOTIFY_EXAMPLE],
  },
  {
    name: WELCOME_TEMPLATE,
    category: 'UTILITY',
    body:
      'WhatsApp შეტყობინებების მიღება ჩართულია. Netai-ის ჩატში ახალი პასუხის მიღებისას ' +
      'WhatsApp-ზე შეგატყობინებთ. შეტყობინებების გამორთვა შეგიძლია Netai-ის პროფილიდან.',
    example: [],
  },
];

export interface TemplateState {
  readonly name: string;
  readonly status: string;
  readonly category: string | null;
}

export interface WhatsAppSetupState {
  readonly account_found: boolean;
  readonly templates: readonly TemplateState[];
  /** When no account is found: the permissions the token carries, by name only. */
  readonly token_scopes?: readonly string[];
}

interface GraphAnswer {
  readonly data?: unknown;
  readonly error?: {
    readonly message?: string;
    /** Meta's own words on WHICH parameter, for an „Invalid parameter". */
    readonly error_user_title?: string;
    readonly error_user_msg?: string;
    readonly error_subcode?: number;
  };
}

/** Meta's error with its detail, never the request (the token rides in the header only). */
export function graphErrorLine(status: number, error: GraphAnswer['error']): string {
  const detail = [error?.error_user_title, error?.error_user_msg].filter(Boolean).join(' — ');
  const subcode = error?.error_subcode === undefined ? '' : ` (subcode ${error.error_subcode})`;
  return `WhatsApp ${status}: ${error?.message ?? 'unknown error'}${subcode}${detail ? ` — ${detail}` : ''}`;
}

function token(): string {
  const value = process.env.WHATSAPP_TOKEN?.trim();
  if (!value) throw new Error('WHATSAPP_TOKEN is not set');
  return value;
}

async function graph(path: string, init: RequestInit = {}): Promise<GraphAnswer> {
  const response = await fetch(`${GRAPH_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json()) as GraphAnswer;
  if (!response.ok) {
    throw new Error(graphErrorLine(response.status, body.error));
  }
  return body;
}

interface GranularScope {
  readonly scope?: string;
  readonly target_ids?: readonly string[];
}

async function tokenScopes(): Promise<GranularScope[]> {
  const t = encodeURIComponent(token());
  const answer = await graph(`/debug_token?input_token=${t}&access_token=${t}`);
  return ((answer.data as { granular_scopes?: GranularScope[] } | undefined)?.granular_scopes ??
    []) as GranularScope[];
}

function targetsOf(scopes: readonly GranularScope[], scope: string): string[] {
  return [...(scopes.find((s) => s.scope === scope)?.target_ids ?? [])];
}

async function idsAt(path: string): Promise<string[]> {
  const answer = await graph(path);
  return ((answer.data ?? []) as { id?: string }[])
    .map((row) => row.id ?? '')
    .filter((id) => id !== '');
}

/** The business accounts of the token's businesses, owned or shared with them. */
async function accountsOfBusinesses(businesses: readonly string[]): Promise<string[]> {
  const lists = await Promise.all(
    businesses.flatMap((b) => [
      idsAt(`/${b}/owned_whatsapp_business_accounts?fields=id&limit=50`),
      idsAt(`/${b}/client_whatsapp_business_accounts?fields=id&limit=50`).catch(() => []),
    ]),
  );
  return [...new Set(lists.flat())];
}

/** The one of these accounts that holds Netai's sending number. */
async function accountHoldingOurNumber(accounts: readonly string[]): Promise<string | null> {
  const phoneId = process.env.WHATSAPP_PHONE_ID?.trim() ?? '';
  for (const account of accounts) {
    const phones = await idsAt(`/${account}/phone_numbers?fields=id&limit=50`);
    if (phones.includes(phoneId)) return account;
  }
  return accounts.length === 1 ? accounts[0] : null;
}

/**
 * The WhatsApp Business Account the token manages; null when none is found.
 * A system user's token granted on the whole business names no account in its
 * scopes (as on live, 25 Oct): then the business's accounts are read and the
 * one holding WHATSAPP_PHONE_ID is taken.
 */
export async function businessAccountId(): Promise<string | null> {
  const fixed = process.env.WHATSAPP_WABA_ID?.trim();
  if (fixed) return fixed;
  const scopes = await tokenScopes();
  const managed = targetsOf(scopes, 'whatsapp_business_management');
  if (managed.length > 0) return accountHoldingOurNumber(managed);
  const businesses = targetsOf(scopes, 'business_management');
  if (businesses.length === 0) return null;
  return accountHoldingOurNumber(await accountsOfBusinesses(businesses));
}

/** Where Netai's two templates stand in Meta. */
export async function whatsappSetupState(): Promise<WhatsAppSetupState> {
  const account = await businessAccountId();
  if (account === null) {
    const scopes = (await tokenScopes()).map((s) => s.scope ?? '').filter((s) => s !== '');
    return { account_found: false, templates: [], token_scopes: scopes };
  }
  const answer = await graph(
    `/${account}/message_templates?fields=name,status,category,language&limit=100`,
  );
  const rows = (answer.data ?? []) as { name: string; status: string; category?: string }[];
  const ours = new Set(NETAI_TEMPLATES.map((t) => t.name));
  return {
    account_found: true,
    templates: rows
      .filter((row) => ours.has(row.name))
      .map((row) => ({ name: row.name, status: row.status, category: row.category ?? null })),
  };
}

function templatePayload(spec: TemplateSpec): object {
  return {
    name: spec.name,
    language: TEMPLATE_LANGUAGE,
    category: spec.category,
    components: [
      {
        type: 'BODY',
        text: spec.body,
        ...(spec.example.length > 0 && { example: { body_text: [spec.example] } }),
      },
    ],
  };
}

/** Submits to Meta each of Netai's templates that is not there yet. Returns the state after. */
export async function createNetaiTemplates(): Promise<WhatsAppSetupState> {
  const before = await whatsappSetupState();
  if (!before.account_found) return before;
  const account = await businessAccountId();
  const existing = new Set(before.templates.map((t) => t.name));
  for (const spec of NETAI_TEMPLATES.filter((t) => !existing.has(t.name))) {
    await graph(`/${account}/message_templates`, {
      method: 'POST',
      body: JSON.stringify(templatePayload(spec)),
    });
  }
  return whatsappSetupState();
}
