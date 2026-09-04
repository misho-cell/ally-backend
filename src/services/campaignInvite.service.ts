import { query } from '../db/postgres/client';
import { recordCampaignResponse } from './chorusCampaign.service';
import { getInviteLink } from './referralLink.service';

const INVITE_QUERY_TIMEOUT_MS = 8_000;

/**
 * What the assistant standing in a campaign_invite thread needs to know
 * (ticket 9 tasks 13.3 and 13.7).
 *
 * On 1 September the founder answered three invite threads with exactly the
 * words the message told him to use — „კი", „არა", „ვინ არის ეს და რატომ მე?"
 * — and got three questions back: „რაზე არა?", „4 მიზანი ღიაა, რომელზე
 * გავაგრძელოთ?". The thread's assistant was the ordinary chat assistant: it
 * could not see the invite message, did not know the target, and had no idea
 * it was standing in an invite thread at all. The campaign never learned his
 * answer, and all three stayed open.
 *
 * Nothing here is new data — it is what Chorus already knew when it chose the
 * pair, finally handed to the run that has to talk about it.
 */
export interface CampaignInviteContext {
  readonly participant_id: number;
  readonly campaign_id: number;
  readonly state: string;
  readonly target_label: string;
  /** Public facts about the target — the answer to „who is this?". */
  readonly target_facts: string[];
  /** How many phonebooks hold this number — the crowd's own answer to "who". */
  readonly phonebooks: number;
  /** What this inviter saved them as; their own words, not somebody else's label. */
  readonly saved_as: string | null;
  /** The old-Ally colour of the tie between them — the answer to „why me?". */
  readonly relationship_colour: string | null;
  readonly city: string | null;
}

/** The public fact types worth naming when the user asks who someone is. */
const WHO_FACT_TYPES = ['role', 'occupation', 'employer', 'industry', 'expertise', 'headline'];

/**
 * The live campaign ask behind this thread, or null when the thread carries
 * none (already answered, or not an invite thread at all). Scoped to the
 * inviter: a campaign_invite thread belongs to exactly one participant.
 */
export async function getCampaignInviteContext(
  threadId: number,
  userId: string,
): Promise<CampaignInviteContext | null> {
  const base = await query<{
    participant_id: number;
    campaign_id: number;
    state: string;
    target_phone: string;
    target_label: string | null;
    city: string | null;
  }>(
    `SELECT p.id AS participant_id, p.campaign_id, p.state,
            c.target_phone, c.target_label, c.city
     FROM invite_campaign_participants p
     JOIN invite_campaigns c ON c.id = p.campaign_id
     WHERE p.thread_id = $1 AND p.inviter_user_id = $2::int
     LIMIT 1`,
    [threadId, userId],
    INVITE_QUERY_TIMEOUT_MS,
  );
  const row = base.rows[0];
  if (!row) return null;

  const [facts, phonebooks, tie] = await Promise.all([
    query<{ value: string }>(
      `SELECT DISTINCT field_type || ': ' || COALESCE(canonical_value, value) AS value
       FROM contact_facts
       WHERE neo4j_contact_id = $1 AND is_public = true AND retracted_at IS NULL
         AND field_type = ANY($2::text[])
       LIMIT 12`,
      [row.target_phone, WHO_FACT_TYPES],
      INVITE_QUERY_TIMEOUT_MS,
    ),
    query<{ holders: string }>(
      `SELECT COUNT(DISTINCT "contactId") AS holders FROM "UserAlias" WHERE phone = $1`,
      [row.target_phone],
      INVITE_QUERY_TIMEOUT_MS,
    ),
    // This inviter's OWN record of the person: the label they saved and the
    // colour of the tie. „Livingstoni Maiko" was somebody else's label for a
    // man the founder had saved as „Maiko Gumbaridze" — his own word for them
    // is the one to use.
    query<{ saved_as: string | null; colour: string | null }>(
      `SELECT ua.alias AS saved_as,
              (SELECT uc."relationshipStatus"::text
                 FROM "UserConnectionPhone" ucp
                 JOIN "UserConnection" uc ON uc.id = ucp."connectionId"
                WHERE ucp.phone = $1 AND uc."originUserId" = $2::int
                LIMIT 1) AS colour
       FROM "UserAlias" ua
       WHERE ua.phone = $1 AND ua."contactId" = $2::int
       LIMIT 1`,
      [row.target_phone, userId],
      INVITE_QUERY_TIMEOUT_MS,
    ),
  ]);

  return {
    participant_id: row.participant_id,
    campaign_id: row.campaign_id,
    state: row.state,
    target_label: row.target_label?.trim() || 'ეს კონტაქტი',
    target_facts: facts.rows.map((f) => f.value),
    phonebooks: Number(phonebooks.rows[0]?.holders ?? 0),
    saved_as: tie.rows[0]?.saved_as?.trim() || null,
    relationship_colour: tie.rows[0]?.colour ?? null,
    city: row.city,
  };
}

/**
 * The three words the invite message itself prints, and the handful of ways a
 * person actually types them. Whole-message matches only: „არა, მაგრამ სხვას
 * ვიცნობ" is a conversation, not a protocol answer, and must reach the model
 * rather than be classified here.
 */
const PROTOCOL_WORDS: Readonly<Record<string, 'agreed' | 'declined' | 'told'>> = {
  კი: 'agreed',
  დიახ: 'agreed',
  ki: 'agreed',
  yes: 'agreed',
  'თანახმა ვარ': 'agreed',
  არა: 'declined',
  ara: 'declined',
  no: 'declined',
  'ამჯერად არა': 'declined',
  უთხარი: 'told',
  ვუთხარი: 'told',
  'უკვე ვუთხარი': 'told',
};

/** Trailing decoration a person adds to a one-word answer. */
const ANSWER_DECOR_RE = /[\s.!,?;:„""''\p{Extended_Pictographic}️‍]+/gu;

export function protocolResponse(message: string): 'agreed' | 'declined' | 'told' | null {
  const bare = message.replace(ANSWER_DECOR_RE, ' ').trim().toLowerCase();
  return PROTOCOL_WORDS[bare] ?? null;
}

/**
 * The server's own guarantee that the three words reach the campaign (ticket 9
 * task 13.7).
 *
 * Proved live on 4 September, on the deployed fix: „კი" worked — the model
 * called the tool and handed over the link — and a bare „არა" in a thread
 * whose owner also had an introduction request waiting did not. The reply was
 * polite and correct („გასაგებია, პრობლემა არ არის"), the model simply moved
 * on to the other item and never called the tool, so the campaign stayed
 * `asked` exactly as it did on 1 September.
 *
 * Prompt text cannot make that certain; this can. Same philosophy as
 * ensureVerbatimQuote and wrapAllowedNumbers: the model is asked, the server
 * makes it true. The model's own call still wins — this only fires when the
 * participant is still waiting after the run.
 */
export async function ensureInviteAnswerRecorded(
  threadId: number,
  userId: string,
  userMessage: string,
): Promise<'agreed' | 'declined' | 'told' | null> {
  const response = protocolResponse(userMessage);
  if (response === null) return null;
  const participant = await query<{ id: number }>(
    `SELECT id FROM invite_campaign_participants
     WHERE thread_id = $1 AND inviter_user_id = $2::int AND state = 'asked'
     LIMIT 1`,
    [threadId, userId],
    INVITE_QUERY_TIMEOUT_MS,
  );
  if (participant.rows.length === 0) return null;
  const { recorded } = await recordCampaignResponse(threadId, userId, response);
  return recorded ? response : null;
}

/** The link, appended when the user said yes and the reply forgot to carry one. */
export async function ensureInviteLinkInReply(reply: string, userId: string): Promise<string> {
  if (INVITE_LINK_RE.test(reply)) return reply;
  const invite = await getInviteLink(userId);
  if (!invite.link) return reply;
  return `${reply}\n\n${invite.link}`;
}

const INVITE_LINK_RE = /netai\.guru\/join/i;

/** The old-Ally colours, in the words a person would use for them. */
const COLOUR_WORDS: Readonly<Record<string, string>> = {
  allies: 'ყველაზე ახლო წრე (მწვანე)',
  loyal: 'ახლო, სანდო კავშირი (ლურჯი)',
  connections: 'ნაცნობი',
  contacts: 'შორეული ნაცნობი',
};

/**
 * The section the run receives when it is standing in an invite thread. It
 * answers the two questions the user is invited to ask — „who is this?" and
 * „why me?" — from the record, and it says which tool carries the answer back
 * to the campaign, because a „კი" that reaches nobody is worse than no ask.
 */
export function buildCampaignInviteSection(ctx: CampaignInviteContext): string {
  const who = ctx.target_label;
  const known = ctx.saved_as && ctx.saved_as !== who ? ` (შენს ტელეფონში: „${ctx.saved_as}")` : '';
  const facts =
    ctx.target_facts.length > 0
      ? ctx.target_facts.map((f) => `  - ${f}`).join('\n')
      : '  - საჯარო ჩანაწერი არ გვაქვს — ეს პირდაპირ თქვი, ნუ გამოიგონებ.';
  const colour = ctx.relationship_colour
    ? (COLOUR_WORDS[ctx.relationship_colour] ?? ctx.relationship_colour)
    : 'ძველი Ally-ს ფერი არ არის ჩაწერილი';
  return (
    `\n\n## მოწვევის თხოვნა [შიდა: participant=${ctx.participant_id}, campaign=${ctx.campaign_id} — პასუხის ტექსტში არასდროს ახსენო]\n` +
    `ამ თრედში Netai-მ სთხოვა მომხმარებელს, მოიწვიოს **${who}**${known}. მიმდინარე მდგომარეობა: ${ctx.state}.\n` +
    `ვინ არის ის (საჯარო ჩანაწერიდან):\n${facts}\n` +
    `- ამ ნომერს ${ctx.phonebooks} ადამიანი ინახავს ტელეფონში${ctx.city ? `; ქალაქი: ${ctx.city}` : ''}.\n` +
    `- რატომ სთხოვეს სწორედ ამ მომხმარებელს: მათ შორის კავშირი — ${colour}.\n` +
    `\nწესები:\n` +
    `- „კი"/„თანახმა ვარ" → გამოიძახე respond_to_invite_campaign(response="agreed") და **იმავე პასუხში** გადაეცი მოსაწვევი ბმული (get_invite_link). დაპირება „გამოგიგზავნი" საკმარისი არაა — ბმული ახლავე უნდა იყოს ტექსტში.\n` +
    `- „არა"/„ამჯერად არა" → respond_to_invite_campaign(response="declined"). მადლობა უთხარი, აღარ დაჟინდე და ამ ადამიანზე აღარ ჰკითხო.\n` +
    `- „უთხარი"/„უკვე ვუთხარი" → respond_to_invite_campaign(response="told").\n` +
    `- „ვინ არის ეს?" / „რატომ მე?" → უპასუხე ზემოთ მოცემული ჩანაწერიდან, მარტივი წინადადებებით. რაც აქ არ წერია, არ იცი — ნუ გამოიგონებ. ეს კითხვები არ არის უარი: პასუხის მერე ისევ შესთავაზე მოწვევა ერთხელ.\n` +
    `- ერთსიტყვიანი „კი" ან „არა" ამ თრედში სწორედ ამ თხოვნაზეა. სხვა თემას ნუ მოძებნი და ნუ დაუბრუნებ კითხვას („რაზე არა?") — ეს პასუხია, არა გაუგებრობა.\n` +
    `- თუ იტყვის, რომ ასეთი შეთავაზებები აღარ სურს — stop_contacting_me.`
  );
}
