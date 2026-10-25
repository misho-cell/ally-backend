-- 267: three more accounts that never vouch (tester 75684, 25 Oct; same family as 266):
-- +549 test accounts ("Ally Arg", "Ag Pay Test", "Al Test"), never active in Netai, still
-- listed as people who know real members. Not deleted; only never read as a bridge.
INSERT INTO excluded_holders (user_id, reason)
SELECT id, 'test_account_never_active'
  FROM unnest(ARRAY[129171, 141180, 168207]) AS id
ON CONFLICT (user_id) DO NOTHING;
