import { query } from '../db/postgres/client';
import { createThread, saveThreadMessage } from './threads.service';
import { emitThreadCreated } from './sse.service';
import { sendPushNotification } from './notification.service';

/**
 * The accounts that already registered and never came back.
 *
 * Measured on 5 September: of the 84 businessmen on the founder's seed list,
 * 42 were ALREADY in the base — and of those, one pays, seven have ever opened
 * Netai, and 34 have not. They are the cheapest people in the product to
 * reach: the account exists, the phone is known, and their phonebooks are
 * already loaded. Nobody had ever looked at them as a group.
 *
 * The founder's answer when shown the numbers was to build the list ("4. კი
 * კარგი იქნება"), and to keep it separate from an invitation: an invitation
 * says „come in", a wake-up says „your network is already here".
 *
 * NOTHING IS SENT FROM HERE. This module answers who and why; the channel and
 * the words are the founder's call, and reaching a real person needs his yes.
 */

/** The same three statuses the rest of the codebase counts as a live account. */
const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'];

/** Facts that mean we can say something specific to this person. */
const KNOWN_FACT_TYPES = ['role', 'occupation', 'employer', 'expertise', 'headline'];

const WAKE_QUERY_TIMEOUT_MS = 15_000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export interface WakeUpCandidate {
  user_id: number;
  phone: string;
  /** What the public record says about them — the hook for a first line. */
  facts: readonly string[];
  /** How many contacts they carry. Size of the network we would light up. */
  phonebook: number;
  /**
   * How many of THEIR OWN contacts are already active on Netai. This is the
   * whole argument for waking them: the value is already sitting in the app,
   * built by people they know.
   */
  contacts_on_netai: number;
  registered_at: string;
}

/**
 * Dormant accounts worth waking, best first.
 *
 * "Dormant" is not a shortlist on its own — 62,121 of the 62,164 accounts have
 * never opened Netai, which is the whole base. The bound that makes the list
 * mean something is the one that also makes the message writable: we only
 * wake somebody we can say something SPECIFIC to, so a candidate must carry a
 * public role fact. That is 68 people today, and it grows with every profile
 * the curator imports.
 *
 * Ranked by how many of their own contacts are already here, because that is
 * the sentence the wake-up is made of.
 */
export async function listWakeUpCandidates(limit = DEFAULT_LIMIT): Promise<WakeUpCandidate[]> {
  const capped = Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);
  const result = await query<{
    id: number;
    phone: string;
    facts: string[];
    phonebook: string;
    contacts_on_netai: string;
    registered_at: Date | string;
  }>(
    `WITH netai AS (
       SELECT u.id FROM "User" u
       WHERE u."deletedAt" IS NULL
         AND (EXISTS (SELECT 1 FROM threads t WHERE t.user_id = u.id)
           OR EXISTS (SELECT 1 FROM search_activity sa WHERE sa.user_id = u.id::text)
           OR u.subscription_status = ANY($1::text[]))
     ),
     known AS (
       SELECT regexp_replace(f.neo4j_contact_id, '\\D', '', 'g') AS d,
              array_agg(DISTINCT f.field_type || ': ' ||
                        COALESCE(f.canonical_value, f.value)) AS facts
       FROM contact_facts f
       WHERE f.is_public AND f.retracted_at IS NULL
         AND f.field_type = ANY($2::text[])
       GROUP BY 1
     ),
     cand AS (
       SELECT DISTINCT ON (usr.id) usr.id, up.phone, k.facts, usr."createdAt" AS registered_at
       FROM "UserPhone" up
       JOIN known k ON k.d = regexp_replace(up.phone, '\\D', '', 'g')
       JOIN "User" usr ON usr.id = up."userId" AND usr."deletedAt" IS NULL
       WHERE NOT EXISTS (SELECT 1 FROM netai n WHERE n.id = usr.id)
       ORDER BY usr.id
     )
     SELECT c.id, c.phone, c.facts, c.registered_at,
            (SELECT COUNT(*) FROM "UserAlias" a WHERE a."contactId" = c.id) AS phonebook,
            (SELECT COUNT(DISTINCT n.id)
             FROM "UserAlias" a
             JOIN "UserPhone" p2
               ON regexp_replace(p2.phone, '\\D', '', 'g') =
                  regexp_replace(a.phone, '\\D', '', 'g')
             JOIN netai n ON n.id = p2."userId"
             WHERE a."contactId" = c.id) AS contacts_on_netai
     FROM cand c
     ORDER BY contacts_on_netai DESC, phonebook DESC, c.id
     LIMIT $3`,
    [ACTIVE_STATUSES, KNOWN_FACT_TYPES, capped],
    WAKE_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((row) => ({
    user_id: Number(row.id),
    phone: row.phone,
    facts: row.facts,
    phonebook: Number(row.phonebook),
    contacts_on_netai: Number(row.contacts_on_netai),
    registered_at: new Date(row.registered_at).toISOString(),
  }));
}

/**
 * The words a wake-up would carry.
 *
 * Not an invitation. They already have an account, so „come in" is the wrong
 * sentence — the true one is „your network is already here", and the number
 * that makes it true is `contacts_on_netai`: people out of their OWN phonebook
 * who use Netai today. Everything in the message is measured; nothing about
 * them is claimed that the public record does not already say.
 */
/**
 * Group thousands with a space, without asking the runtime.
 * `toLocaleString('ka-GE')` gives a different string depending on which ICU
 * data the process was built with — a message people read must not vary with
 * the container it was rendered in.
 */
function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function buildWakeUpMessage(candidate: WakeUpCandidate, name: string): string {
  const role = candidate.facts[0]?.split(': ').slice(1).join(': ') ?? '';
  const lines = [
    `გამარჯობა, ${name}.`,
    '',
    `Netai-ს ანგარიში უკვე გაქვს — და შენი ${groupThousands(candidate.phonebook)} ` +
      `კონტაქტიდან ${candidate.contacts_on_netai} ადამიანი უკვე იყენებს მას.`,
  ];
  if (role !== '') {
    lines.push(
      '',
      `შენ შესახებ ჩვენს ჩანაწერში წერია: ${role}. თუ არაზუსტია, მითხარი და შევასწორებ.`,
    );
  }
  lines.push(
    '',
    'Netai შენივე კონტაქტებში ეძებს — ვინ იცნობს იმ ადამიანს, ვინც გჭირდება. ' +
      'შენი ტელეფონის წიგნი უკვე ჩატვირთულია, ანუ პასუხი პირველივე კითხვაზე მზადაა.',
    '',
    'გახსნა: https://netai.guru',
  );
  return lines.join('\n');
}

/** One reviewer's copy of a message that has not been sent to anybody. */
export interface WakeUpPreview {
  reviewer_user_id: string;
  thread_id: number;
  about_phone: string;
  message: string;
}

/**
 * Show the exact words to a named reviewer, inside their own Netai account.
 *
 * The people this message is FOR have never opened Netai, so no thread would
 * ever reach them — the real channel is SMS or WhatsApp, and neither can carry
 * free text today (Twilio is Verify, WhatsApp is locked to the OTP template).
 * A reviewer, though, uses the app: a thread puts the real message in front of
 * the person who has to approve it, with the real numbers of a real candidate,
 * and reaches nobody else.
 */
export async function previewWakeUpMessage(
  reviewerUserIds: readonly string[],
  candidate: WakeUpCandidate,
  name: string,
): Promise<WakeUpPreview[]> {
  const message = buildWakeUpMessage(candidate, name);
  const previews: WakeUpPreview[] = [];
  for (const reviewerId of reviewerUserIds) {
    const thread = await createThread(
      reviewerId,
      'regular',
      `გასაღვიძებელი წერილი — სანიმუშო ტექსტი`,
      undefined,
      { isTask: true, status: 'needs_you', statusLine: 'შენს პასუხს ელოდება' },
    );
    await saveThreadMessage(
      thread.id,
      Number(reviewerId),
      'assistant',
      [
        'ეს არის ის ტექსტი, რომელიც გასაღვიძებელ სიაში მოხვედრილ ადამიანს მიუვიდა.',
        `ნიმუში აგებულია რეალურ ადამიანზე (${name}) და მის რეალურ ციფრებზე.`,
        '**არავისთვის გაგზავნილა.**',
        '',
        '---',
        '',
        message,
        '',
        '---',
        '',
        'თუ ტექსტი მოგწონს — მითხარი და გავაგზავნი. თუ არა — მითხარი რა შევცვალო.',
      ].join('\n'),
    );
    emitThreadCreated(reviewerId, {
      id: thread.id,
      type: thread.type,
      title: thread.title,
      is_task: thread.is_task,
      status: thread.status,
      status_line: thread.status_line,
    });
    void sendPushNotification(reviewerId, {
      title: 'Netai',
      body: 'გასაღვიძებელი წერილის ტექსტი — შენს დასამტკიცებლად.',
      url: `/chat/${thread.id}`,
    }).catch(() => undefined);
    previews.push({
      reviewer_user_id: reviewerId,
      thread_id: thread.id,
      about_phone: candidate.phone,
      message,
    });
  }
  return previews;
}
