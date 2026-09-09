-- 132: the pricing fact says what is true since 9 September 10:31 UTC (D133,
-- Ticket 12 Task 34): the token allowance is WEEKLY, reset Monday 00:00 UTC.
UPDATE netai_info
SET content = $netai$Pro — $19.99/month (the Georgian tier). Enterprise — $79.00/month. 5-day trial at the start (an invitation from the founding team carries 20 days during the launch window, to 15 October 2026); after the trial, access is on or off — there is no free tier yet. Tokens: each tier includes a WEEKLY allowance — 250 tokens a week on Pro and Premium, 1,375 on Enterprise — that resets every Monday at 00:00 UTC; unused allowance expires when the week ends; when it runs out, work waits for a top-up or the reset (a goal is never closed for it); top-up packs can be bought ($10.99 / $19.99 / $44.99). Subscriptions and cards run through Stripe (Stripe Checkout to subscribe, the Stripe Customer Portal for card changes and cancellation); token top-up packs run through Paddle. Quote numbers exactly — never round, never guess.$netai$,
    updated_at = NOW()
WHERE topic = 'pricing';
