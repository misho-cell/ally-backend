-- 063: the app map as a get_netai_info topic (ticket 6 close, task 2) — the
-- tester's text verbatim. Grounds the prompt rule against invented screens
-- and addresses (their Part B row 3): the assistant answers "where do I…"
-- FROM this instead of improvising a support@ address or a nonexistent page.
INSERT INTO netai_info (topic, content) VALUES ('screens', $netai$
/chat — conversations and goals · /profile — referral code, tokens, subscription, sign out · /profile/data — everything Netai stores about the user, and account deletion · /profile/earnings — referral earnings. The only contact address is contact@netai.guru. There is no other address, channel or screen.
$netai$)
ON CONFLICT (topic) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW();
