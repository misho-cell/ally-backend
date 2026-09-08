-- 128: the product fact names the provider a user actually sees (Ticket 11
-- Task 12 (a); D140, 8 Sep). Payments moved to Stripe on 6 September; the
-- fact the assistant quotes still said Paddle. Top-ups are still Paddle until
-- the founder moves them; the text says both, plainly.
UPDATE netai_info
SET content = $netai$Pro — $19.99/month (the Georgian tier). Enterprise — $79.00/month. 5-day trial at the start (an invite cohort may carry a longer one); after the trial, access is on or off — there is no free tier yet. Tokens: each tier includes an allowance for the period (monthly today; weekly once the founder switches the window), unused allowance expires when the period ends; top-up packs can be bought ($10.99 / $19.99 / $44.99). Subscriptions and cards run through Stripe (Stripe Checkout to subscribe, the Stripe Customer Portal for card changes and cancellation); token top-up packs run through Paddle. Quote numbers exactly — never round, never guess.$netai$,
    updated_at = NOW()
WHERE topic = 'pricing';
