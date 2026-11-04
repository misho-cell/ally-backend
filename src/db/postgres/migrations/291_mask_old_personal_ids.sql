-- 291: #8618 (DR5) for rows stored before the mask shipped (Misho's yes, 4 Nov:
-- „ყვეკა შენი რეკომენდაციით გააკეთე"). A standalone 11-digit personal ID in an
-- owner's line is replaced with the marker the server now writes on arrival.
-- Seven rows when written. Every changed row is copied first, so the change can
-- be undone (docs/ADMIN_WRITE_OPERATIONS.md, entry 103).
CREATE TABLE IF NOT EXISTS conversations_pid_backup (
  conversation_id BIGINT PRIMARY KEY,
  content         TEXT,
  content_json    JSONB,
  masked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO conversations_pid_backup (conversation_id, content, content_json)
SELECT id, content, content_json
  FROM conversations
 WHERE role = 'user'
   AND content ~ '(^|[^+[:alnum:]_/.-])[0-9]{11}($|[^[:alnum:]_/])'
ON CONFLICT (conversation_id) DO NOTHING;

UPDATE conversations c
   SET content = regexp_replace(
         c.content,
         '(^|[^+[:alnum:]_/.-])[0-9]{11}(?=$|[^[:alnum:]_/])',
         '\1[პირადი ნომერი დამალულია]',
         'g')
  FROM conversations_pid_backup b
 WHERE b.conversation_id = c.id;

UPDATE conversations c
   SET content_json = to_jsonb(c.content)
  FROM conversations_pid_backup b
 WHERE b.conversation_id = c.id
   AND jsonb_typeof(c.content_json) = 'string';
