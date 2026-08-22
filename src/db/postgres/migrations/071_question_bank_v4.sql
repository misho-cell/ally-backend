-- ============================================================================
-- Netai — Part H question bank, v4. 43 rows, Georgian and English, complete.
-- Tester-provided, 24 Aug, signed off by the founder and Lika. Replaces v1
-- (48 stale rows, never run) and the v3 draft.
--
-- No BEGIN/COMMIT here on purpose: the migration runner (migrate.ts) already
-- wraps every pending migration in one outer transaction — nesting a second
-- BEGIN/COMMIT inside it would commit that outer transaction early and break
-- atomicity across whatever else is pending in the same deploy.
--
-- Schema verified against production before this file was written
-- (information_schema.columns on question_bank) — the ALTER block below is
-- confirmed to add only what is actually missing.
-- ============================================================================
--
-- WHAT CHANGED SINCE THE VERSION THE FOUNDER MAY HAVE SEEN
--
-- 1. English is complete on all 43 rows, regenerated from the CURRENT Georgian.
-- 2. Spanish is dropped from this load — founder's call, 24 August. The column
--    stays and stays nullable; Argentine Spanish lands later as plain UPDATEs.
-- 3. FIVE ROWS HAD BROKEN OPTION IDs, fixed by the tester before sending: on
--    val_connection_worth_502 the option ids had drifted off the Georgian
--    text they sit under. Since scoring reads the id and never the display
--    text, those five would have scored the wrong dimension, silently,
--    forever. Two lost options recovered.
--
-- ----------------------------------------------------------------------------
-- OUR OWN CORRECTION BEFORE RUNNING IT
--
-- The tester's score_vector convention does NOT match what the Part H
-- scoring code (services/partH.service.ts) originally assumed. The code's
-- first version scored PER OPTION (vector[optionId] = {dimension: delta}).
-- The real 43-row bank instead uses a FLAT {dimension: delta} vector applied
-- ONCE per answered instance, the same regardless of which option was
-- picked — the question itself carries the signal, not the specific answer
-- — except the two multi-select rows, which score by `_by_count` (how many
-- were picked). Fixed in partH.service.ts's computeDeltas before this
-- migration shipped: the mismatch would have scored nothing on 41 of the 43
-- questions, silently, forever — the exact same class of bug as the tester's
-- own option-id fix above.
-- ----------------------------------------------------------------------------
-- CONVENTIONS
--
-- 1. score_vector: flat {dimension: delta} for single-select and for
--    multi-select rows with no `_by_count`; `_by_count` sub-object for the
--    two multi-select rows that score by HOW MANY options were picked.
--
-- 2. options is an array of {id, ka, en}. The id is what lands in
--    answer_events.raw_answer / option_ids — scoring never depends on
--    display text.
--
-- 3. "other" carries {"free_text": true, "scores": false}; 35 rows have one.
--    An "other" answer moves NO score — it is research data, not profile
--    data, and it feeds the wording bank.
--
-- 4. immediate_use is English only for now, by the founder's decision. The
--    columns immediate_use_ka / immediate_use_es exist and are NULL — the
--    selector's immediateUseFor() falls back to the base immediate_use
--    column for every language until per-language copy arrives.
--
-- 5. surface 'onboarding' rows are the first-session set: ask 5 to 7, never
--    more. Everything else is one per day maximum.
-- ============================================================================

ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS immediate_use_ka TEXT;
ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS immediate_use_es TEXT;
ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS select_mode TEXT NOT NULL DEFAULT 'single';
ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS select_max INTEGER;
ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS goal_bound BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS scoring_note TEXT;

INSERT INTO question_bank (
    question_id, category, surface,
    prompt_ka, prompt_es, prompt_en,
    options,
    signals, score_vector,
    immediate_use, immediate_use_ka, immediate_use_es,
    storage_level, follow_up_rule,
    select_mode, select_max, goal_bound, scoring_note
) VALUES

('onb_primary_goal_001', 'goal', 'onboarding',
 'რაში გჭირდება ჩემი დახმარება ზოგადად? რა ტიპის ამოცანები გინდა რომ მოგიგვარო?',
 NULL,
 'What should Netai help you with in general? What kind of tasks do you want it to handle?',
 '[{"id":"expand_network","ka":"კავშირების გაფართოება","en":"expand my network"},{"id":"discover_opportunities","ka":"ახალი შესაძლებლობების აღმოჩენა ახალი კავშირებით","en":"discover new opportunities through new connections"},{"id":"new_circles","ka":"სხვა ბაბლებში კავშირების აშენება","en":"build connections in other circles"},{"id":"reputation","ka":"რეპუტაციის აშენება","en":"build reputation"},{"id":"customers","ka":"კლიენტების პოვნა","en":"find customers"},{"id":"partners","ka":"პარტნიორების პოვნა","en":"find partners"},{"id":"mentors","ka":"მენტორის/კონსულტანტის პოვნა","en":"find a mentor or advisor"},{"id":"investors","ka":"ინვესტორებთან შეხვედრა","en":"meet investors"},{"id":"hiring","ka":"ადამიანის დაქირავება","en":"hire"},{"id":"learning","ka":"სწავლა","en":"learn"},{"id":"other","ka":"სხვა","en":"other","free_text":true,"scores":false}]',
 '{"goal_clarity"}', '{}',
 'Your first shortlist is built from this, before you type anything.', NULL, NULL,
 'raw+normalized', 'Re-ask after 60 days.',
 'multi', 3, FALSE, 'goal_clarity is derived from the NUMBER of options chosen: 1 pick = +0.7, 2 = +0.3, 3 = -0.1. The chosen option ids are stored as the goal set.'),

('onb_connection_type_002', 'match', 'onboarding',
 'როცა საქმე გინდა რომ დაიძრას, ვის ურეკავ პირველად?',
 NULL,
 'What type of professional connection would be most useful this week?',
 '[{"id":"decision_maker","ka":"ვინც გადაწყვეტს","en":"the one who decides"},{"id":"operator","ka":"ვინც ხელით გააკეთებს","en":"the one who will do it"},{"id":"connector","ka":"ვინც სხვას გამაცნობს","en":"the one who introduces me onward"},{"id":"advisor","ka":"ვინც მირჩევს, როგორ მოვიქცე","en":"the one who advises me how to act"},{"id":"client","ka":"ვისაც ჩემი საქმე სჭირდება","en":"someone who needs what I do"},{"id":"other","ka":"სხვა","en":"other","free_text":true,"scores":false}]',
 '{"match_target","goal_clarity"}', '{"goal_clarity":0.3}',
 'The first list of names is filtered to that kind of person.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, TRUE, NULL),

('onb_outreach_style_003', 'communication', 'onboarding',
 'როცა უცნობს სწერ, რომელი გზაა შენთვის უფრო კომფორტული?',
 NULL,
 'When you write to someone you don''t know, which way feels more comfortable?',
 '[{"id":"warm_context","ka":"ჯერ ვუხსნი, რა გვაკავშირებს და რატომ ვწერ","en":"I explain first what connects us and why I''m writing"},{"id":"direct_ask","ka":"პირდაპირ ვამბობ, რა მინდა","en":"I say straight out what I want"},{"id":"value_first","ka":"ჯერ ვაჩვენებ, რა სარგებელი ექნება","en":"I show first what they get out of it"},{"id":"mutual_intro","ka":"საერთო ნაცნობის მეშვეობით ვუკავშირდები","en":"I reach them through someone we both know"},{"id":"short_businesslike","ka":"მოკლედ და საქმიანად","en":"Short and businesslike"},{"id":"other","ka":"სხვა","en":"Something else","free_text":true,"scores":false}]',
 '{"communication_directness"}', '{"communication_directness":0.6,"social_approach":0.2}',
 'Every message Netai drafts for you starts in that style.', NULL, NULL,
 'raw+normalized', 'If a draft is edited twice in the same direction, re-ask.',
 'single', NULL, FALSE, NULL),

('onb_event_friction_004', 'networking', 'onboarding',
 'ხალხმრავალ ღონისძიებაზე რა გაგიადვილებს საქმეს?',
 NULL,
 'At a crowded event, what would make it easier for you?',
 '[{"id":"shortlist","ka":"წინასწარ ვიცოდე, ვის შევხვდე","en":"Knowing in advance who to meet"},{"id":"opener","ka":"ვიცოდე, როგორ დავიწყო საუბარი","en":"Knowing how to start the conversation"},{"id":"mutual_path","ka":"საერთო ნაცნობმა გამაცნოს","en":"Being introduced by someone we both know"},{"id":"followup_later","ka":"მქონდეს მიზეზი, რომ შემდეგ დავუკავშირდე","en":"Having a reason to get back in touch afterwards"},{"id":"quiet_1to1","ka":"პირისპირ შეხვედრა მირჩევნია","en":"I''d rather meet one to one"},{"id":"other","ka":"სხვა","en":"Something else","free_text":true,"scores":false}]',
 '{"social_approach","network_curation","structure_need"}', '{"social_approach":-0.3,"network_curation":0.5,"structure_need":0.4}',
 'Netai builds your next event plan in that exact shape.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('onb_help_style_005', 'support', 'onboarding',
 'როცა ვინმე დახმარებას გთხოვს, რას სთავაზობ პირველ რიგში?',
 NULL,
 'When someone asks you for help, what do you offer first?',
 '[{"id":"strategist","ka":"კონკრეტულ გეგმას","en":"A concrete plan"},{"id":"connector","ka":"საჭირო ადამიანთან გაცნობას","en":"An introduction to the right person"},{"id":"analyst","ka":"პირდაპირ შეფასებას","en":"A straight assessment"},{"id":"mentor","ka":"რჩევას","en":"Advice"},{"id":"operator","ka":"სასარგებლო მასალას ან შაბლონს","en":"Something useful — a document or a template"},{"id":"other","ka":"სხვა","en":"Something else","free_text":true,"scores":false}]',
 '{"support_style:strategist","support_style:connector","support_style:analyst","support_style:mentor","support_style:operator"}', '{}',
 'Requests that fit what you give get shown; the rest go quiet.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('onb_value_driver_006', 'values', 'onboarding',
 'რომელი შესაძლებლობის გამოვლენისთვის ღირს შენი დროის გამოყოფა?',
 NULL,
 'What kind of opportunity is worth your time?',
 '[{"id":"upside","ka":"დიდი პოტენციალი","en":"Big potential"},{"id":"trust","ka":"სანდო ადამიანები","en":"Trustworthy people"},{"id":"roi","ka":"ფინანსური სარგებელი","en":"Financial return"},{"id":"learning","ka":"სწავლა","en":"Learning"},{"id":"impact","ka":"რეალური გავლენა","en":"Real impact"},{"id":"visibility","ka":"ხილვადობა","en":"Visibility"},{"id":"stability","ka":"გრძელვადიანი სტაბილურობა","en":"Long-term stability"},{"id":"other","ka":"სხვა","en":"Something else","free_text":true,"scores":false}]',
 '{"value_driver:upside","value_driver:trust","value_driver:roi","value_driver:learning","value_driver:impact","value_driver:visibility","value_driver:stability"}', '{"opportunity_appetite":0.4}',
 'Opportunities are ranked by this from now on.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('onb_default_tone_007', 'communication', 'onboarding',
 'როგორ სტილში მივწერო ხალხს შენ ნაცვლად?',
 NULL,
 'How should Netai write for you by default?',
 '[{"id":"concise","ka":"მოკლედ და საქმიანად","en":"very concise"},{"id":"warm","ka":"თბილად","en":"warm"},{"id":"polished","ka":"ოფიციალურად და ზრდილობიანად","en":"polished"},{"id":"bold","ka":"პირდაპირ, თხოვნა პირველივე წინადადებაში","en":"bold"},{"id":"diplomatic","ka":"ფრთხილად, რომ არავის ეწყინოს","en":"diplomatic"},{"id":"depends","ka":"განსხვავებული ყოველ კონკრეტულ შემთხვევაში","en":"different every time"},{"id":"other","ka":"სხვა","en":"other","free_text":true,"scores":false}]',
 '{"communication_directness"}', '{"communication_directness":0.5}',
 'The next message Netai writes is in that voice.', NULL, NULL,
 'raw+normalized', 'If they rewrite tone twice, re-ask.',
 'single', NULL, FALSE, NULL),

('goal_week_success_101', 'goal', 'weekly_review',
 'რა შედეგი დადგომა გჭირდება ამ კვირაში?',
 NULL,
 'Which result would make this week successful?',
 '[{"id":"one_intro","ka":"ერთი სასარგებლო გაცნობა","en":"one useful intro"},{"id":"one_meeting","ka":"ერთი შეხვედრა დანიშნული","en":"one meeting booked"},{"id":"one_followup","ka":"ერთი გაგზავნილი შეხსენება","en":"one follow-up sent"},{"id":"one_opportunity","ka":"ერთი შესაძლებლობა შეფასებული","en":"one opportunity evaluated"},{"id":"one_revival","ka":"ერთი ძველი კავშირის გამოცოცხლება","en":"one relationship revived"},{"id":"other","ka":"სხვა","en":"other","free_text":true,"scores":false}]',
 '{"goal_clarity"}', '{"goal_clarity":0.5}',
 'That becomes the one outcome Netai tracks with you this week.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('goal_relationship_type_102', 'goal', 'any',
 'ახლა რომელი ტიპის ხალხი გჭირდება მეტად?',
 NULL,
 'Which kind of people do you need most right now?',
 '[{"id":"clients","ka":"პოტენციური კლიენტები","en":"Potential clients"},{"id":"investors","ka":"ინვესტორები","en":"Investors"},{"id":"partners","ka":"პარტნიორები","en":"Partners"},{"id":"mentors","ka":"მენტორები / მრჩევლები","en":"Mentors or advisers"},{"id":"experts","ka":"ჩემი სფეროს პროფესიონალები","en":"Professionals in my own field"},{"id":"operators","ka":"კონკრეტული საქმის შემსრულებლები","en":"People who can do a specific job"},{"id":"connectors","ka":"ადამიანები, რომლებიც სხვებთან დამაკავშირებენ","en":"People who can connect me to others"},{"id":"peers","ka":"ვისაც იგივე გამოწვევები აქვს, რაც მე","en":"People facing the same challenges as me"},{"id":"other","ka":"სხვა","en":"Someone else","free_text":true,"scores":false}]',
 '{"match_target"}', '{"goal_clarity":0.2}',
 'This week''s shortlist tilts toward that kind of person.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, TRUE, NULL),

('goal_bottleneck_103', 'goal', 'any',
 'როცა გიწევს უცხო ან არა-ახლობლებთან ურთიერთობა, რა გიშლის ხელს ყველაზე მეტად?',
 NULL,
 'When you have to deal with strangers, or people you barely know, what gets in your way most?',
 '[{"id":"who_to_meet","ka":"სწორი ადამიანის პოვნა","en":"Finding the right person"},{"id":"starting","ka":"საუბრის დაწყება","en":"Starting the conversation"},{"id":"asking","ka":"ნათლად თქმა, რა მინდა","en":"Saying clearly what I want"},{"id":"followup","ka":"ხელახლა მიწერა / შეხსენება","en":"Writing again, or following up"},{"id":"choosing","ka":"იმის შეფასება, ვისთან ღირს დროის დახარჯვა","en":"Judging who is worth my time"},{"id":"other","ka":"სხვა","en":"Something else","free_text":true,"scores":false}]',
 '{"structure_need","social_approach"}', '{"structure_need":0.4,"social_approach":-0.2}',
 'Netai starts doing that specific part for you.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('goal_first_task_104', 'goal', 'any',
 'რომელი საქმე ავიღო პირველ რიგში?',
 NULL,
 'Which task should Netai handle first?',
 '[{"id":"find_people","ka":"ადამიანების პოვნა","en":"find people"},{"id":"draft_outreach","ka":"წერილის დაწერა","en":"draft outreach"},{"id":"meeting_prep","ka":"შეხვედრისთვის მომზადება","en":"prepare for a meeting"},{"id":"remind_followup","ka":"შეხსენება","en":"remind me to follow up"},{"id":"evaluate","ka":"შესაძლებლობის შეფასება","en":"evaluate an opportunity"},{"id":"other","ka":"სხვა","en":"other","free_text":true,"scores":false}]',
 '{"structure_need"}', '{"structure_need":0.3}',
 'Netai opens with that next time instead of asking.', NULL, NULL,
 'normalized_only', NULL,
 'single', NULL, TRUE, NULL),

('goal_stability_105', 'goal', 'weekly_review',
 'ეს მიზანი კიდევ ძალაშია?',
 NULL,
 'Is this goal still on?',
 '[{"id":"same","ka":"კი, იგივე მიზანია","en":"Yes, same goal"},{"id":"narrower","ka":"კი, მაგრამ უფრო კონკრეტული გახდა","en":"Yes, but it has got more specific"},{"id":"changed","ka":"არა, მიზანი შეიცვალა","en":"No, the goal has changed"},{"id":"paused","ka":"ჯერ შევაჩეროთ","en":"Let''s pause it for now"}]',
 '{"goal_clarity"}', '{"goal_clarity":0.6}',
 'Netai stops working a goal you have quietly dropped.', NULL, NULL,
 'raw+normalized', 'Ask every 14 days while a goal is open.',
 'single', NULL, FALSE, NULL),

('comm_no_reply_203', 'communication', 'any',
 'პასუხი არ მოვიდა. რომელია შენთვის მისღები მიდგომა?',
 NULL,
 'No reply came. What would you be comfortable doing?',
 '[{"id":"short_bump","ka":"მოკლე შეხსენება","en":"A short nudge"},{"id":"add_value","ka":"ახალი სარგებელი შევთავაზოთ","en":"Offer them something new"},{"id":"wait","ka":"დაველოდოთ","en":"Wait"},{"id":"other_channel","ka":"სხვა გზით ვცადოთ","en":"Try another channel"},{"id":"let_go","ka":"თავი დავანებოთ","en":"Let it go"},{"id":"via_mutual","ka":"ნაცნობი (ან სხვა ნაცნობი) ჩავრთოთ","en":"Bring in someone we both know"},{"id":"other","ka":"სხვა","en":"Something else","free_text":true,"scores":false}]',
 '{"boundary_style","communication_directness"}', '{"boundary_style":0.4,"communication_directness":0.2}',
 'Sets the follow-up rule for every message that goes unanswered.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('comm_intro_request_204', 'communication', 'any',
 'როცა ვინმეს გაცნობა გჭირდება, რა გირჩევნია?',
 NULL,
 'When you need an introduction, what do you prefer?',
 '[{"id":"explain_reason","ka":"ავუხსნა, რატომ მინდა გაცნობა","en":"To explain why I want to meet them"},{"id":"keep_short","ka":"მოკლედ ვუთხრა, ვინ ვარ და რა მინდა","en":"To say briefly who I am and what I want"},{"id":"value_both","ka":"ვაჩვენო, რა სარგებელი გვექნება ორივეს","en":"To show what both sides get out of it"},{"id":"ask_advice","ka":"ჯერ რჩევა ვთხოვო","en":"To ask for advice first"},{"id":"trusted_only","ka":"სანდო ადამიანის მეშვეობით მივმართო","en":"To go through someone they trust"},{"id":"other","ka":"სხვა","en":"Something else","free_text":true,"scores":false}]',
 '{"communication_directness","network_curation"}', '{"communication_directness":0.3,"network_curation":0.3}',
 'The introduction Netai sends on your behalf is shaped like that.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('comm_draft_wrong_205', 'communication', 'message_draft',
 'როცა ჩემი დაწერილი წერილი შენს სტილს არ ჰგავს, ყველაზე ხშირად რა არის მიზეზი?',
 NULL,
 'A draft feels slightly wrong. What is usually the issue?',
 '[{"id":"too_long","ka":"გრძელია","en":"too long"},{"id":"too_cold","ka":"ცივია","en":"too cold"},{"id":"too_soft","ka":"რბილია","en":"too soft"},{"id":"too_aggressive","ka":"აგრესიულია","en":"too aggressive"},{"id":"unclear_ask","ka":"თხოვნა ბუნდოვანია","en":"unclear ask"},{"id":"no_context","ka":"კონტექსტი აკლია","en":"not enough context"},{"id":"other","ka":"სხვა","en":"other","free_text":true,"scores":false}]',
 '{"communication_directness"}', '{"communication_directness":0.5}',
 'That exact fault is fixed in the draft Netai just wrote for you.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('comm_challenge_me_206', 'feedback', 'any',
 'თუ არ გეთანხმები, როგორ გირჩევნია მოვიქცე?',
 NULL,
 'If I disagree with you, how would you rather I put it?',
 '[{"id":"directly","ka":"პირდაპირ და მიზეზის ახსნით","en":"Straight, with the reason"},{"id":"gently","ka":"რბილად და ფრთხილად","en":"Gently and carefully"},{"id":"with_data","ka":"ფაქტებით და რიცხვებით","en":"With facts and numbers"},{"id":"with_options","ka":"ალტერნატივების შეთავაზებით","en":"By offering alternatives"}]',
 '{"communication_directness"}', '{"communication_directness":0.6}',
 'Netai starts pushing back at that strength.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('net_after_conversation_302', 'networking', 'any',
 'სასარგებლო საუბრის შემდეგ, ჩვეულებრივ რას აკეთებ?',
 NULL,
 'After a useful conversation, what do you usually do?',
 '[{"id":"send_recap","ka":"შემაჯამებელ წერილს ვწერ","en":"I send a summary message"},{"id":"next_step","ka":"შემდეგ ნაბიჯს ვთავაზობ","en":"I propose the next step"},{"id":"make_intro","ka":"სასარგებლო ადამიანთან ვაკავშირებ","en":"I introduce them to someone useful"},{"id":"wait_natural","ka":"ველოდები ბუნებრივ მიზეზს, რომ ისევ დავუკავშირდე","en":"I wait for a natural reason to get back in touch"},{"id":"notes_only","ka":"მხოლოდ ჩანაწერს ვინახავ","en":"I just keep a note"},{"id":"other","ka":"სხვა","en":"Something else","free_text":true,"scores":false}]',
 '{"structure_need","communication_directness"}', '{"structure_need":0.4}',
 'Netai prepares that after your next meeting, unasked.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('net_curation_vs_volume_303', 'current_state', 'weekly_review',
 'ამ კვირაში რამდენი ახალი შეხვედრისთვის გაქვს დრო?',
 NULL,
 'Which networking plan sounds best?',
 '[{"id":"one_two","ka":"1–2","en":"1–2"},{"id":"three_five","ka":"3–5","en":"3–5"},{"id":"six_plus","ka":"6 და მეტი","en":"6 or more"},{"id":"none_written","ka":"არცერთი, მხოლოდ მიმოწერა","en":"none, messages only"}]',
 '{"network_curation","social_approach"}', '{"network_curation":0.7,"social_approach":0.2}',
 'Netai raises or lowers how much it puts in front of you for the rest of this week.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('net_meeting_energy_304', 'networking', 'meeting_prep',
 'პირველი შეხვედრა როდის მიგაჩნია წარმატებულად?',
 NULL,
 'When do you count a first meeting as a success?',
 '[{"id":"agreement","ka":"კონკრეტულ შეთანხმებამდე მივედით","en":"We reached a concrete agreement"},{"id":"learned_fit","ka":"გავიგე, ღირს თუ არა გაგრძელება","en":"I learned whether it is worth continuing"},{"id":"next_step","ka":"შემდეგ ნაბიჯზე შევთანხმდით","en":"We agreed on a next step"},{"id":"onward_intro","ka":"სხვა სასარგებლო ადამიანთან დამაკავშირა","en":"They connected me to someone else useful"},{"id":"good_contact","ka":"კარგი კონტაქტი დამრჩა","en":"I came away with a good contact"},{"id":"other","ka":"სხვა","en":"Something else","free_text":true,"scores":false}]',
 '{"opportunity_appetite","collaboration_style"}', '{"opportunity_appetite":0.3,"collaboration_style":0.3}',
 'The agenda Netai writes for your next meeting aims at exactly that.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('net_drains_you_305', 'networking', 'any',
 'რომელი სიტუაცია გღლის ყველაზე მეტად?',
 NULL,
 'Which situation drains you most?',
 '[{"id":"small_talk","ka":"უშინაარსო საუბარი","en":"Empty small talk"},{"id":"no_agenda","ka":"შეხვედრა კონკრეტული მიზნის გარეშე","en":"A meeting with no clear purpose"},{"id":"one_sided","ka":"ერთმხრივი თხოვნები","en":"One-sided requests"},{"id":"slow_decisions","ka":"გაჭიანურებული გადაწყვეტილებები","en":"Decisions that drag on"},{"id":"hard_selling","ka":"ზედმეტად აგრესიული გაყიდვა","en":"Pushy selling"},{"id":"too_many_followups","ka":"ხშირი შეხსენებები","en":"Constant follow-ups"},{"id":"other","ka":"სხვა","en":"Something else","free_text":true,"scores":false}]',
 '{"boundary_style"}', '{"boundary_style":0.6}',
 'Netai stops bringing you those.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('work_meeting_prep_401', 'workstyle', 'meeting_prep',
 'მნიშვნელოვან შეხვედრამდე რა მოგიმზადო?',
 NULL,
 'Before an important meeting, what should I prepare for you?',
 '[{"id":"agenda","ka":"შეხვედრის გეგმა","en":"A plan for the meeting"},{"id":"background","ka":"ინფორმაცია ადამიანზე","en":"Background on the person"},{"id":"talking_points","ka":"მთავარი საკითხები","en":"The main points to cover"},{"id":"questions","ka":"დასასმელი კითხვები","en":"Questions to ask"},{"id":"risk_notes","ka":"შესაძლო რისკები","en":"Possible risks"},{"id":"all_of_above","ka":"ყველაფერი ერთად","en":"All of it together"},{"id":"other","ka":"სხვა","en":"Something else","free_text":true,"scores":false}]',
 '{"structure_need"}', '{"structure_need":0.7}',
 'Netai prepares exactly that before your next important meeting.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('work_decision_style_402', 'workstyle', 'any',
 'თუ მოულოდნელად კარგი შესაძლებლობა გამოჩნდა. რა ნაბიჯს დგამ პირველად?',
 NULL,
 'A good opportunity turns up out of nowhere. What do you do first?',
 '[{"id":"quick_test","ka":"სწრაფად ვამოწმებ, ღირს თუ არა გაგრძელება","en":"I check quickly whether it is worth pursuing"},{"id":"research","ka":"ჯერ კარგად ვიკვლევ","en":"I research it properly first"},{"id":"trusted_opinion","ka":"სანდო ადამიანს ვეკითხები","en":"I ask someone I trust"},{"id":"financial_check","ka":"ფინანსურ მხარეს ვამოწმებ","en":"I check the money side"},{"id":"calendar_check","ka":"ვაფასებ, მაქვს თუ არა ამის დრო","en":"I work out whether I have time for it"},{"id":"values_check","ka":"ვაფასებ, შეესაბამება თუ არა ჩემს პრინციპებს","en":"I check whether it fits my principles"},{"id":"expert_opinion","ka":"ექსპერტის აზრს ვეკითხები","en":"I ask an expert"},{"id":"other","ka":"სხვა","en":"Something else","free_text":true,"scores":false}]',
 '{"opportunity_appetite","structure_need"}', '{"opportunity_appetite":0.4,"structure_need":0.3}',
 'Netai runs that check on the opportunity in front of you.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('work_reminder_type_403', 'workstyle', 'any',
 'როგორი ტიპის შეხსენებები გირჩევნია?',
 NULL,
 'What kind of reminders do you want?',
 '[{"id":"exact_time","ka":"კონკრეტულ დროს","en":"At a set time"},{"id":"morning_summary","ka":"დილით, შეჯამების სახით","en":"In the morning, as one summary"},{"id":"weekly","ka":"კვირის მიმოხილვა","en":"A weekly review"},{"id":"urgent_only","ka":"მხოლოდ გადაუდებელი","en":"Urgent ones only"},{"id":"other","ka":"სხვა","en":"Something else","free_text":true,"scores":false}]',
 '{"structure_need"}', '{"structure_need":0.5}',
 'You get that reminder, and the other kinds stop.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('work_planning_style_404', 'workstyle', 'weekly_review',
 'რომელი დაგეგმვის სტილი მოგწონს?',
 NULL,
 'Which way of planning suits you?',
 '[{"id":"weekly_plan","ka":"კვირის მკაფიო გეგმა","en":"A clear plan for the week"},{"id":"flexible","ka":"რამდენიმე მოქნილი ვარიანტი","en":"A few flexible options"},{"id":"one_priority","ka":"ერთი მთავარი პრიორიტეტი","en":"One main priority"},{"id":"checklist","ka":"საქმეების მოკლე სია","en":"A short list of things to do"},{"id":"no_plan","ka":"გეგმა მხოლოდ საჭიროებისას","en":"A plan only when I need one"},{"id":"other","ka":"სხვა","en":"Something else","free_text":true,"scores":false}]',
 '{"structure_need"}', '{"structure_need":0.6}',
 'Your weekly summary changes shape.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('work_autonomy_405', 'workstyle', 'any',
 'შეხვედრამ კარგად ჩაიარა. რა გავაკეთო შემდეგ?',
 NULL,
 'The meeting went well. What should I do next?',
 '[{"id":"write_followup","ka":"შემდგომი წერილი დაწერე","en":"Draft the follow-up message"},{"id":"create_task","ka":"მიზანი შექმენი","en":"Create a goal"},{"id":"suggest_ask","ka":"შემდეგი თხოვნა შემომთავაზე","en":"Suggest the next thing to ask for"},{"id":"update_notes","ka":"ჩანაწერი განაახლე","en":"Update the notes"},{"id":"wait","ka":"დაელოდოს ჩემს მითითებას","en":"Wait until I say so"},{"id":"other","ka":"სხვა","en":"Something else","free_text":true,"scores":false}]',
 '{"structure_need","boundary_style"}', '{"structure_need":0.3}',
 'Sets how much Netai does before asking you.', NULL, NULL,
 'raw+normalized', 'Re-ask if they undo an automatic action twice.',
 'single', NULL, FALSE, NULL),

('val_connection_worth_502', 'values', 'any',
 'როგორი ტიპის ადამიანს აფასებ ყველაზე მეტად?',
 NULL,
 'What kind of person do you value most?',
 '[{"id":"expertise","ka":"საქმის მცოდნე და პროფესიონალი","en":"Someone who really knows their work"},{"id":"integrity","ka":"პატიოსანი და სანდო","en":"Honest and reliable"},{"id":"energy","ka":"საქმის გამკეთებელი","en":"Someone who gets things done"},{"id":"access","ka":"ვინც სწორ ადამიანებთან დამაკავშირებს","en":"Someone who connects me to the right people"},{"id":"complementary","ka":"ვინც ავსებს იმას, რაც მე არ შემიძლია","en":"Someone who covers what I can''t do"},{"id":"shared_goals","ka":"ვისთანაც საერთო მიზნები მაქვს","en":"Someone whose goals are the same as mine"},{"id":"other","ka":"სხვა","en":"Someone else","free_text":true,"scores":false}]',
 '{"value_driver:expertise","value_driver:access","value_driver:integrity","value_driver:energy","value_driver:complementary","value_driver:shared_goals"}', '{"network_curation":0.3}',
 'New contacts are scored against that.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('val_project_pull_505', 'values', 'any',
 'რომელი პროექტი გიზიდავს ყველაზე სწრაფად?',
 NULL,
 'Which kind of project pulls you in fastest?',
 '[{"id":"scalable","ka":"მასშტაბირებადი ბიზნესი","en":"A business that can scale"},{"id":"creative","ka":"შემოქმედებითი","en":"Something creative"},{"id":"social","ka":"სოციალური გავლენა","en":"Social impact"},{"id":"technical","ka":"ტექნიკური გამოწვევა","en":"A technical challenge"},{"id":"community","ka":"საზოგადოება","en":"Community"},{"id":"premium","ka":"პრემიუმ კლიენტები","en":"Premium clients"},{"id":"other","ka":"სხვა","en":"Something else","free_text":true,"scores":false}]',
 '{"value_driver:scalable","value_driver:expertise","value_driver:creative","value_driver:social","value_driver:technical","value_driver:community","value_driver:premium"}', '{"opportunity_appetite":0.3}',
 'Changes what Netai brings you unprompted.', NULL, NULL,
 'raw+normalized', NULL,
 'multi', 2, FALSE, NULL),

('sup_help_trigger_602', 'support', 'any',
 'რომელი თხოვნა გიღვიძებს სურვილს რომ დაეხმარო?',
 NULL,
 'Which kind of request makes you want to help?',
 '[{"id":"clear_ask","ka":"კონკრეტული და გასაგები თხოვნა","en":"A clear, specific ask"},{"id":"strong_mission","ka":"მნიშვნელოვანი მიზანი","en":"A cause that matters"},{"id":"trusted_person","ka":"სანდო ადამიანის თხოვნა","en":"An ask from someone I trust"},{"id":"high_potential","ka":"საქმე, რომელსაც კარგი შედეგის პოტენციალი აქვს","en":"Something with a real chance of working"},{"id":"reciprocal","ka":"ორმხრივი სარგებელი","en":"Something both sides gain from"},{"id":"urgent_focused","ka":"რეალურად გადაუდებელი საქმე","en":"Something genuinely urgent"},{"id":"other","ka":"სხვა","en":"Something else","free_text":true,"scores":false}]',
 '{"boundary_style"}', '{"boundary_style":-0.3}',
 'Requests that match get flagged; the rest stay quiet.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('sup_filter_out_603', 'support', 'any',
 'რომელი ტიპის თხოვნები გავფილტრო?',
 NULL,
 'Which kind of requests should I filter out?',
 '[{"id":"vague","ka":"ბუნდოვანი","en":"Vague ones"},{"id":"one_sided","ka":"ერთმხრივი","en":"One-sided ones"},{"id":"too_urgent","ka":"ცრუ „სასწრაფო“","en":"Fake “urgent” ones"},{"id":"outside_expertise","ka":"ჩემს სფეროს გარეთ","en":"Outside my field"},{"id":"repetitive","ka":"განმეორებადი","en":"Repeat asks"},{"id":"reputation_risk","ka":"რეპუტაციული რისკი","en":"Anything risky for my reputation"},{"id":"time_heavy","ka":"დიდ დროს რომ მოითხოვს","en":"Anything that eats a lot of time"},{"id":"other","ka":"სხვა","en":"Something else","free_text":true,"scores":false}]',
 '{"boundary_style"}', '{"boundary_style":0.7}',
 'A real filter on your inbox, not a note in a file.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('sup_micro_help_604', 'support', 'any',
 'თუ მხოლოდ 15 წუთი გაქვს, რა შევთავაზო მთხოვნელს შენს ნაცვლად?',
 NULL,
 'If you only have 15 minutes, what should I offer on your behalf?',
 '[{"id":"intro","ka":"საჭირო ადამიანთან გაცნობა","en":"An introduction to the right person"},{"id":"feedback","ka":"მოკლე შეფასება","en":"A short piece of feedback"},{"id":"framework","ka":"რჩევა, როგორ მოიქცეს","en":"Advice on how to go about it"},{"id":"template","ka":"სასარგებლო შაბლონი","en":"A template they can use"},{"id":"next_step","ka":"კონკრეტული შემდეგი ნაბიჯი","en":"One concrete next step"},{"id":"resources","ka":"საჭირო მასალა","en":"The material they need"},{"id":"other","ka":"სხვა","en":"Something else","free_text":true,"scores":false}]',
 '{"boundary_style","support_style:connector"}', '{"boundary_style":0.4}',
 'Netai offers that instead of an open-ended call.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('sup_beneficiary_605', 'support', 'any',
 'ვის დაეხმარები ყველაზე მეტად?',
 NULL,
 'Which person would benefit most from you?',
 '[{"id":"early_founder","ka":"ადრეული ეტაპის დამფუძნებელს","en":"an early founder"},{"id":"sales_lead","ka":"გაყიდვების ხელმძღვანელს","en":"a sales lead"},{"id":"junior","ka":"ახალბედა სპეციალისტს","en":"junior talent"},{"id":"expert_peer","ka":"თანასწორ ექსპერტს","en":"an expert peer"},{"id":"creative","ka":"შემოქმედს","en":"a creative builder"},{"id":"operator","ka":"ოპერატორს","en":"an operator"},{"id":"community_leader","ka":"საზოგადოების ლიდერს","en":"a community leader"},{"id":"other","ka":"სხვა","en":"other","free_text":true,"scores":false}]',
 '{"support_style:strategist","support_style:mentor"}', '{}',
 'Incoming asks are matched to you by that fit first.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('col_values_most_702', 'match', 'any',
 'ერთად მუშაობის დროს, რას აფასებ ყველაზე მეტად სხვებში?',
 NULL,
 'In collaboration, what do you value most?',
 '[{"id":"speed","ka":"სისწრაფეს","en":"speed"},{"id":"clarity","ka":"სიცხადეს","en":"clarity"},{"id":"trust","ka":"ნდობას","en":"trust"},{"id":"creativity","ka":"შემოქმედებას","en":"creativity"},{"id":"ownership","ka":"პასუხისმგებლობის აღებას","en":"ownership"},{"id":"high_standards","ka":"მაღალ სტანდარტს","en":"high standards"},{"id":"independence","ka":"დამოუკიდებლობას","en":"independence"},{"id":"other","ka":"სხვა","en":"other","free_text":true,"scores":false}]',
 '{"collaboration_style"}', '{"collaboration_style":0.6}',
 'Filters which kind of collaborator Netai recommends.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('col_frustrates_703', 'match', 'any',
 'როგორი პარტნიორი გაღიზიანებს?',
 NULL,
 'Which collaborator frustrates you?',
 '[{"id":"vague","ka":"ბუნდოვანი","en":"vague"},{"id":"slow","ka":"ნელი","en":"slow"},{"id":"controlling","ka":"მაკონტროლებელი","en":"controlling"},{"id":"chaotic","ka":"ქაოტური","en":"chaotic"},{"id":"over_cautious","ka":"ზედმეტად ფრთხილი","en":"overly cautious"},{"id":"political","ka":"ზედმეტად პოლიტიკური","en":"too political"},{"id":"unresponsive","ka":"რომელიც არ პასუხობს","en":"unresponsive"},{"id":"other","ka":"სხვა","en":"other","free_text":true,"scores":false}]',
 '{"collaboration_style","boundary_style"}', '{"collaboration_style":-0.4,"boundary_style":0.3}',
 'Becomes a warning flag on a new contact before Netai suggests them.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('col_avoid_intro_704', 'match', 'any',
 'რომელი ტიპის გაცნობა არ გავაკეთო?',
 NULL,
 'Which introductions should I never make?',
 '[{"id":"unclear_fit","ka":"თუ შესაბამისობა არ ჩანს","en":"When there is no visible fit"},{"id":"reputation_risk","ka":"თუ რეპუტაციული რისკია","en":"When there is a reputation risk"},{"id":"cold_transactional","ka":"თუ ორმხრივი სარგებელი არ ჩანს","en":"When only one side gains"},{"id":"low_urgency","ka":"თუ ჩემს მიმდინარე მიზანს არ უკავშირდება","en":"When it has nothing to do with my current goal"},{"id":"other","ka":"სხვა","en":"Something else","free_text":true,"scores":false}]',
 '{"boundary_style","network_curation"}', '{"boundary_style":0.5,"network_curation":0.3}',
 'A hard stop on introductions of that kind.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('col_new_contact_worth_705', 'match', 'any',
 'როგორ გადავწყვიტო, ღირს თუ არა ახალი ადამიანის შენთან დაკავშირება?',
 NULL,
 'How should Netai decide whether a new contact is worth it?',
 '[{"id":"goal_relevance","ka":"მიზანთან კავშირით","en":"goal relevance"},{"id":"trusted_source","ka":"სანდო წყაროთი","en":"a trusted source"},{"id":"mutual_value","ka":"ორმხრივი სარგებლით","en":"clear mutual value"},{"id":"learning","ka":"რამე ახალს ვისწავლი თუ არა","en":"learning value"},{"id":"leverage","ka":"მას ბევრ სხვა საჭირო ადამიანთან მივყავარ","en":"network leverage"},{"id":"timing","ka":"ახლა მაქვს თუ არა ამის დრო","en":"timing"},{"id":"other","ka":"სხვა","en":"other","free_text":true,"scores":false}]',
 '{"network_curation"}', '{"network_curation":0.5}',
 'Sets the ranking for every shortlist after this one.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, TRUE, NULL),

('fb_useful_801', 'feedback', 'any',
 'გამოგადგა ეს რეკომენდაცია?',
 NULL,
 'Was this suggestion any use?',
 '[{"id":"yes","ka":"დიახ","en":"Yes"},{"id":"partly","ka":"ნაწილობრივ","en":"Partly"},{"id":"no","ka":"არა","en":"No"},{"id":"too_generic","ka":"ზედმეტად ზოგადია","en":"Too generic"},{"id":"wrong_tone","ka":"არასწორი ტონი","en":"Wrong tone"},{"id":"wrong_priority","ka":"არასწორი პრიორიტეტი","en":"Wrong priority"}]',
 '{"recommendation_quality"}', '{}',
 'Raises or lowers Netai''s confidence in whatever produced that advice.', NULL, NULL,
 'raw+normalized', 'Ask after any recommendation the user acted on or ignored.',
 'single', NULL, FALSE, NULL),

('fb_sounded_like_you_802', 'feedback', 'message_draft',
 'ამ წერილს სწორი ტონალობა და სტილი ჰქონდა?',
 NULL,
 'Did this message sound like you?',
 '[{"id":"yes","ka":"დიახ","en":"yes"},{"id":"too_formal","ka":"ზედმეტად ოფიციალური","en":"too formal"},{"id":"too_casual","ka":"ზედმეტად თავისუფალი","en":"too casual"},{"id":"too_direct","ka":"ზედმეტად პირდაპირი","en":"too direct"},{"id":"too_soft","ka":"ზედმეტად რბილი","en":"too soft"},{"id":"too_long","ka":"გრძელი","en":"too long"},{"id":"too_short","ka":"მოკლე","en":"too short"}]',
 '{"communication_directness"}', '{"communication_directness":0.4}',
 'The next draft is corrected — not next month, next message.', NULL, NULL,
 'raw+normalized', 'Ask after the first three drafts, then only on edits.',
 'single', NULL, FALSE, NULL),

('fb_meeting_outcome_803', 'feedback', 'any',
 'რამდენად შედეგიანი იყო შეხვედრა?',
 NULL,
 'How much did the meeting achieve?',
 '[{"id":"strong_fit","ka":"ძალიან შედეგიანი — გაგრძელება ღირს","en":"Very productive — worth continuing"},{"id":"useful_not_urgent","ka":"სასარგებლო, მაგრამ არა ახლა","en":"Useful, but not now"},{"id":"unclear","ka":"ჯერ გაურკვეველია","en":"Too early to tell"},{"id":"low_fit","ka":"სუსტი შესაბამისობა","en":"Weak fit"},{"id":"no_followup","ka":"გაგრძელება არ ღირს","en":"Not worth continuing"}]',
 '{"match_outcome"}', '{"network_curation":0.3}',
 'Everyone similar to that person is re-scored.', NULL, NULL,
 'raw+normalized', 'Ask once, the day after any meeting Netai arranged.',
 'single', NULL, FALSE, NULL),

('fb_misunderstood_804', 'feedback', 'any',
 'რა გავიგე არასწორად?',
 NULL,
 'What did I get wrong?',
 '[{"id":"my_goal","ka":"ჩემი მიზანი","en":"My goal"},{"id":"my_tone","ka":"ჩემი ტონი","en":"My tone"},{"id":"my_schedule","ka":"ჩემი დრო","en":"My time"},{"id":"the_person","ka":"რამდენად შემეფერებოდა ის ადამიანი","en":"How well that person suited me"},{"id":"the_opportunity","ka":"რამდენად კარგი იყო ის შესაძლებლობა","en":"How good that opportunity was"},{"id":"the_risk","ka":"რისკის დონე","en":"The level of risk"},{"id":"nothing","ka":"არაფერი","en":"Nothing","scores":false},{"id":"other","ka":"სხვა","en":"Something else","free_text":true,"scores":false}]',
 '{"correction_category"}', '{}',
 'The wrong belief is marked for correction instead of hardening.', NULL, NULL,
 'raw+normalized', 'Offer whenever the user rejects a recommendation.',
 'single', NULL, FALSE, NULL),

('fb_proactivity_805', 'feedback', 'weekly_review',
 'უფრო აქტიური ვიყო თუ ნაკლებად?',
 NULL,
 'Should I be more active, or less?',
 '[{"id":"more","ka":"უფრო აქტიური","en":"More active"},{"id":"same","ka":"კარგია ეს ტემპი","en":"This pace is right"},{"id":"less","ka":"ნაკლებად","en":"Less"},{"id":"ask_first","ka":"ჯერ მკითხე","en":"Ask me first"},{"id":"automate_low_risk","ka":"მცირე რისკის საქმეები თავად გააკეთე","en":"Do the low-risk things yourself"}]',
 '{"boundary_style"}', '{"boundary_style":0.3}',
 'Changes how much Netai does without asking you.', NULL, NULL,
 'raw+normalized', 'Ask at day 7 and day 14, then monthly.',
 'single', NULL, FALSE, NULL),

('pr_after_no_901', 'pressure', 'after_rejection',
 'უარი მიიღე. რა გირჩევნია ახლა?',
 NULL,
 'You got a no. What do you prefer now?',
 '[{"id":"another_route","ka":"სხვა გზა ვიპოვოთ იმავე ადამიანთან","en":"find another route to the same person"},{"id":"someone_else","ka":"სხვა ადამიანზე გადავიდეთ","en":"move to someone else"},{"id":"pause","ka":"ცოტა ხნით გადავდოთ","en":"pause it for a while"},{"id":"tell_why","ka":"ჯერ მითხარი, რატომ არ გამოვიდა","en":"first tell me why it did not work"},{"id":"drop_it","ka":"თავი დავანებოთ","en":"let it go"},{"id":"other","ka":"სხვა","en":"other","free_text":true,"scores":false}]',
 '{"pressure_response"}', '{"pressure_response":0.6}',
 'Netai does exactly that with the request that was refused.', NULL, NULL,
 'raw+normalized', 'Ask after any refused request, at most once a week.',
 'single', NULL, FALSE, NULL),

('pr_high_stakes_902', 'pressure', 'message_draft',
 'ეს წერილი მნიშვნელოვან ადამიანს მისდის. როგორ გირჩევნია?',
 NULL,
 'This message is going to someone important. How do you want it?',
 '[{"id":"send_direct","ka":"პირდაპირ ვთხოვოთ, რისკი მაინტერესებს","en":"ask directly, I will take the risk"},{"id":"warm_first","ka":"ჯერ გავეცნოთ, თხოვნა მოგვიანებით","en":"get acquainted first, ask later"},{"id":"via_person","ka":"სანდო ადამიანის გავლით","en":"through someone trusted"},{"id":"show_first","ka":"ჯერ მაჩვენე, მერე გავგზავნოთ","en":"show me first, then send"},{"id":"other","ka":"სხვა","en":"other","free_text":true,"scores":false}]',
 '{"pressure_response","communication_directness"}', '{"pressure_response":0.5,"communication_directness":0.3}',
 'The draft in front of you is rebuilt that way.', NULL, NULL,
 'raw+normalized', NULL,
 'single', NULL, FALSE, NULL),

('cs_capacity_903', 'current_state', 'weekly_review',
 'ამ კვირაში რამდენად დატვირთული ხარ?',
 NULL,
 'How loaded are you this week?',
 '[{"id":"free","ka":"თავისუფალი ვარ, მომეცი საქმე","en":"free — give me work"},{"id":"normal","ka":"ჩვეულებრივად","en":"normal"},{"id":"busy","ka":"დატვირთული, მხოლოდ მნიშვნელოვანი","en":"busy — important things only"},{"id":"blocked","ka":"ამ კვირას ვერაფერს მოვასწრებ","en":"nothing fits this week"}]',
 '{"current_state"}', '{}',
 'Netai drops the volume of what it suggests for the rest of the week.', NULL, NULL,
 'normalized_only', 'Every Monday.',
 'single', NULL, FALSE, NULL)

ON CONFLICT (question_id) DO UPDATE SET
    category       = EXCLUDED.category,
    surface        = EXCLUDED.surface,
    prompt_ka      = EXCLUDED.prompt_ka,
    prompt_en      = EXCLUDED.prompt_en,
    options        = EXCLUDED.options,
    signals        = EXCLUDED.signals,
    score_vector   = EXCLUDED.score_vector,
    immediate_use  = EXCLUDED.immediate_use,
    storage_level  = EXCLUDED.storage_level,
    follow_up_rule = EXCLUDED.follow_up_rule,
    select_mode    = EXCLUDED.select_mode,
    select_max     = EXCLUDED.select_max,
    goal_bound     = EXCLUDED.goal_bound,
    scoring_note   = EXCLUDED.scoring_note;
