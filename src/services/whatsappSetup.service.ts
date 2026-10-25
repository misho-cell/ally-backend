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

/** The texts Misho asked me to write. A parameter never starts or ends a body (Meta's rule). */
export const NETAI_TEMPLATES: readonly TemplateSpec[] = [
  {
    name: NOTIFY_TEMPLATE,
    category: 'UTILITY',
    body: 'Netai-დან ახალი შეტყობინება:\n\n{{1}}\n\nგასაგრძელებლად გახსენი Netai.',
    example: [NOTIFY_EXAMPLE],
  },
  {
    name: WELCOME_TEMPLATE,
    category: 'UTILITY',
    body:
      'გამარჯობა! Netai-ის შეტყობინებებს ამიერიდან WhatsApp-შიც მიიღებ. ' +
      'გამორთვა ნებისმიერ დროს შეგიძლია Netai-ის პროფილიდან.',
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
}

interface GraphAnswer {
  readonly data?: unknown;
  readonly error?: { readonly message?: string };
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
    throw new Error(`WhatsApp ${response.status}: ${body.error?.message ?? 'unknown error'}`);
  }
  return body;
}

interface GranularScope {
  readonly scope?: string;
  readonly target_ids?: readonly string[];
}

/** The WhatsApp Business Account the token manages; null when it manages none. */
export async function businessAccountId(): Promise<string | null> {
  const fixed = process.env.WHATSAPP_WABA_ID?.trim();
  if (fixed) return fixed;
  const t = encodeURIComponent(token());
  const answer = await graph(`/debug_token?input_token=${t}&access_token=${t}`);
  const scopes = ((answer.data as { granular_scopes?: GranularScope[] } | undefined)
    ?.granular_scopes ?? []) as GranularScope[];
  const managed = scopes.find((s) => s.scope === 'whatsapp_business_management');
  return managed?.target_ids?.[0] ?? null;
}

/** Where Netai's two templates stand in Meta. */
export async function whatsappSetupState(): Promise<WhatsAppSetupState> {
  const account = await businessAccountId();
  if (account === null) return { account_found: false, templates: [] };
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
