-- Row 210, reopened by the seat's 394 — and the reason is not the one either
-- of us named first.
--
-- Migration 156 connected an introduction to the GOAL it was raised for, and
-- its own comment allowed the hole this closes: „a request can legitimately be
-- raised in a conversation with no goal at all — an absent link must read as
-- 'no goal', not as a broken one." True as a data statement. What it did not
-- say is that such a request then has NOTHING to carry its answer back.
--
-- 21 September, 10:19, a real person on a phone. She typed „სთხოვე ლიკას
-- გამაცნოს ნიტა ჩხეიძე" into an ordinary chat, thread 20131. The request went
-- at 10:20:16, the mediator agreed at 10:22:50, and the outcome was written
-- into thread 20133 — a thread she was not looking at. Her own chat said the
-- request had been sent and then nothing. At 10:45 she asked „ეს ჩემი
-- მიზანია?" and was told, correctly, „არა, ეს ცალკე გაცნობის მოთხოვნა იყო, არ
-- არის შენახული როგორც მიმდინარე მიზანი." Request 1156: requester_task_id
-- NULL. `wakeRequestersGoal` returns on the first line.
--
-- MEASURED, and the split is not the one the seat proposed. They read it as
-- „with an approved plan the watched chat is told, without one it never is",
-- from three cases. Two of those three WERE told, in their own threads:
--
--   goal 7162, thread 20560   accepted 13:24:57   told 13:25:20   23 s
--   goal 7195, thread 20594   accepted 13:43:38   told 13:44:19   41 s
--
-- Both had no plan. What the three genuinely share is nothing about plans:
-- since column 156 shipped there have been six requests, five from test seats
-- — every one inside a goal, every one told — and ONE from a real account,
-- with no goal, which was not. The plan is a coincidence of the sample; the
-- goal is the mechanism.
--
-- So the request remembers the thread it was asked in, and when there is no
-- goal to wake, the answer is written there.
ALTER TABLE introduction_requests
  ADD COLUMN IF NOT EXISTS origin_thread_id INTEGER;

-- Read once, on resolve, by the request's primary key — no index of its own.
COMMENT ON COLUMN introduction_requests.origin_thread_id IS
  'The thread the request was asked in, so an introduction with no goal behind '
  'it can still answer into the chat the person is watching (row 210).';
