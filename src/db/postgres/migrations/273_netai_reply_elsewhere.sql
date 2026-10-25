-- 273 (#7825, founder 26 Oct): an answer to a Netai message typed in another
-- chat (the goal thread, the main chat) is still its answer. reply_thread_id
-- is the chat it was typed in; NULL when it came in the Netai chat itself.
ALTER TABLE netai_messages ADD COLUMN IF NOT EXISTS reply_thread_id INTEGER;
