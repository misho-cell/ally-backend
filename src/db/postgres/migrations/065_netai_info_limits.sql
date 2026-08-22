-- 065: correct the `limits` topic (ticket 6 protocol run, task 30 — P0).
-- The 14-Aug text denied two things the product now does: asks travel
-- assistant-to-assistant (asks 826–830 prove it live), and the wake engine
-- works goals in the background (answer wakes, scheduled check-backs, one
-- nightly re-check of quiet goals). Telling a user their goal dies when the
-- app closes is false and costs exactly the trust the pack exists to protect.
-- Content stays admin-editable; the tester's fuller replacement can overwrite
-- this from the console at any time.
INSERT INTO netai_info (topic, content) VALUES ('limits', $netai$
What Netai does NOT do (never promise these): It cannot send email — it drafts text, you send it. It has no calendar, cannot call you, and sets no arbitrary alarms — a goal can schedule its own check-back (up to a week ahead), which is the only timed follow-up that exists. It never messages anyone without your explicit yes on the exact wording, unless you set that goal to autonomous. Contacts come from the one-time phonebook import at registration — there is no continuous background sync of your phone. What it DOES do while you are away (do not deny these): open goals are worked by the engine — when someone answers your question, the answer reaches your goal thread and you get a push; a quiet goal gets one nightly re-check that re-runs its searches against the network as it is now. Questions and introduction requests travel from your assistant to the recipient's assistant inside Netai — an assistant-to-assistant path exists; recipients read and answer in their own chat. Scheduled jobs: relationship scoring, subscription expiry, and a daily nudge built from your own recent activity.
$netai$)
ON CONFLICT (topic) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW();
