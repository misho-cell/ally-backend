import { query } from '../../db/postgres/client';

// Ticket 5 PART G1: the assistant's product self-knowledge as a TOOL. The
// content lives in the netai_info table, owned and edited by the prompt team
// from the admin console (no deploy) — same philosophy as prompt_blocks. A
// tool is the right home: descriptions load in every mode for free, including
// incoming_ask where no base prompt loads.

export const NETAI_INFO_TOPICS = [
  'about',
  'doors',
  'pricing',
  'earnings',
  'intro_flow',
  'privacy',
  'limits',
  'capabilities',
  // The app map — grounds "where do I…" answers (ticket 6 close, task 2).
  'screens',
] as const;

export async function getNetaiInfo(topic: string): Promise<object> {
  const key = topic.trim().toLowerCase();
  const result = await query<{ topic: string; content: string; updated_at: string }>(
    'SELECT topic, content, updated_at FROM netai_info WHERE topic = $1 LIMIT 1',
    [key],
  );
  const row = result.rows[0];
  if (!row) {
    return {
      found: false,
      available_topics: NETAI_INFO_TOPICS,
      note: 'Topic not covered — say plainly you do not know and that the team can answer. Never improvise product facts.',
    };
  }
  return {
    found: true,
    topic: row.topic,
    content: row.content,
    as_of: row.updated_at,
    note: "Answer FROM this text, in the user's language. Quote numbers exactly. If the answer is not here, say you don't know.",
  };
}
