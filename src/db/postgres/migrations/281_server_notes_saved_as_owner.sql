-- 281: tester 77502 (#6304). The far-find and foreign-word notes carry names or a
-- word, so the run trail did not recognise them and saved them as the owner's own
-- message: 80 rows (4 real people, 76 test seats) show a server note as if the
-- owner typed it, and the model reads it as theirs. The trail is fixed in code;
-- these rows become the events they always were. Register §85; the ids are kept
-- for the undo:
--   UPDATE conversations SET kind = 'message'
--    WHERE id IN (SELECT id FROM server_notes_fixed_281);
CREATE TABLE IF NOT EXISTS server_notes_fixed_281 (id UUID PRIMARY KEY);

INSERT INTO server_notes_fixed_281 (id)
SELECT id FROM conversations
 WHERE role = 'user' AND kind = 'message'
   AND (content LIKE '(სისტემური შენიშვნა: ძებნამ შენი კონტაქტების გავლით იპოვა: %'
        OR content LIKE '(სისტემური შენიშვნა: პასუხში სიტყვა „%')
ON CONFLICT (id) DO NOTHING;

UPDATE conversations SET kind = 'event'
 WHERE id IN (SELECT id FROM server_notes_fixed_281) AND kind = 'message';
