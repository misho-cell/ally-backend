-- 107: the payoff line in Georgian. (Ticket 9 task 32.4, change 1 — asked
-- 18 August, restated 3 September.)
--
-- The founder's words: "this part should be shown to the user, that he
-- understands, what he gains from answering that question honestly. It has to
-- be written somewhere, while question asked."
--
-- The schema half has been done for a while: `immediate_use_ka/_es/_en` exist
-- and partH.service picks the language, falling back to the legacy English
-- `immediate_use`. What nobody noticed is that all three localised columns were
-- NULL on all 43 rows — so the fallback ran every single time, and that is the
-- whole of Ticket 9 Task 31.7 ("get_profile_question in ka still returns
-- immediate_use in English"). The bug was empty content, not broken code.
--
-- These are the 43 Georgian lines. They are written to be read by the person
-- in the second before they tap: what changes for THEM, in one clause, no
-- product vocabulary. Spanish stays on the English fallback deliberately —
-- inventing 43 Spanish lines nobody on the team can review would be worse than
-- an honest fallback.
UPDATE question_bank SET immediate_use_ka = v.line, updated_at = NOW()
FROM (VALUES
  ('col_avoid_intro_704',        'ასეთ გაცნობებს აღარასდროს შემოგთავაზებ.'),
  ('col_frustrates_703',         'ახალ კონტაქტზე ეს გამაფრთხილებელ ნიშნად დაიდება, სანამ შემოგთავაზებ.'),
  ('col_new_contact_worth_705',  'ამის მიხედვით დალაგდება ყველა შემდეგი სია.'),
  ('col_values_most_702',        'ამის მიხედვით შევარჩევ, როგორ თანამშრომელს გირჩევ.'),
  ('comm_challenge_me_206',      'სწორედ ამ სიმკაცრით დაგიწყებ კამათს.'),
  ('comm_draft_wrong_205',       'სწორედ ეს შეცდომა გასწორდება იმ წერილში, რომელიც ახლა დაგიწერე.'),
  ('comm_intro_request_204',     'შენი სახელით გაგზავნილი გაცნობა ზუსტად ასე დაიწერება.'),
  ('comm_no_reply_203',          'ეს გახდება წესი ყველა უპასუხო წერილისთვის.'),
  ('cs_capacity_903',            'კვირის დარჩენილ დღეებში ნაკლებს შემოგთავაზებ.'),
  ('fb_meeting_outcome_803',     'ამ ადამიანის მსგავსი ყველა კონტაქტი ხელახლა შეფასდება.'),
  ('fb_misunderstood_804',       'არასწორი დასკვნა გასასწორებლად მოინიშნება და აღარ გამყარდება.'),
  ('fb_proactivity_805',         'შეიცვლება, რამდენს ვაკეთებ შენი კითხვის გარეშე.'),
  ('fb_sounded_like_you_802',    'შემდეგი წერილი გასწორდება, არა მომავალ თვეს, არამედ შემდეგსავე შეტყობინებაზე.'),
  ('fb_useful_801',              'გაიზრდება ან დაიკლებს ჩემი ნდობა იმის მიმართ, რამაც ეს რჩევა დაბადა.'),
  ('goal_bottleneck_103',        'სწორედ ამ ნაწილს შენ ნაცვლად გავაკეთებ.'),
  ('goal_first_task_104',        'შემდეგ ჯერზე ამით დავიწყებ, კითხვის გარეშე.'),
  ('goal_relationship_type_102', 'ამ კვირის სია ასეთი ხალხისკენ გადაიხრება.'),
  ('goal_stability_105',         'აღარ ვიმუშავებ მიზანზე, რომელიც უკვე მიატოვე.'),
  ('goal_week_success_101',      'ეს გახდება ერთადერთი შედეგი, რომელსაც ამ კვირაში შენთან ერთად გავყვები.'),
  ('net_after_conversation_302', 'შემდეგი შეხვედრის შემდეგ ამას თავად მოგიმზადებ.'),
  ('net_curation_vs_volume_303', 'კვირის ბოლომდე მოგემატება ან მოგაკლდება შემოთავაზებები.'),
  ('net_drains_you_305',         'ასეთებს აღარ მოგიყვან.'),
  ('net_meeting_energy_304',     'შემდეგი შეხვედრის დღის წესრიგს ზუსტად ამაზე ავაგებ.'),
  ('onb_connection_type_002',    'პირველივე სია ასეთი ხალხით გაიფილტრება.'),
  ('onb_default_tone_007',       'შემდეგი წერილი სწორედ ამ ხმით დაიწერება.'),
  ('onb_event_friction_004',     'შემდეგი ღონისძიების გეგმას ზუსტად ამ ფორმით ავაწყობ.'),
  ('onb_help_style_005',         'გაჩვენებ იმ თხოვნებს, რაც შენს გაცემას ერგება; დანარჩენი გაჩუმდება.'),
  ('onb_outreach_style_003',     'ყველა წერილი, რასაც შენთვის ვწერ, ამ სტილით დაიწყება.'),
  ('onb_primary_goal_001',       'პირველივე სია ამის მიხედვით აიგება, სანამ ერთ სიტყვას დაწერ.'),
  ('onb_value_driver_006',       'ამიერიდან შესაძლებლობები ამის მიხედვით დალაგდება.'),
  ('pr_after_no_901',            'უარყოფილ თხოვნას ზუსტად ასე მოვექცევი.'),
  ('pr_high_stakes_902',         'წინ რომ წერილი გიდევს, სწორედ ასე გადაიწერება.'),
  ('sup_beneficiary_605',        'შემომავალი თხოვნები პირველ რიგში ამ თავსებადობით შეგერჩევა.'),
  ('sup_filter_out_603',         'ეს იქნება ნამდვილი ფილტრი შენს ინბოქსზე, არა ჩანაწერი ფაილში.'),
  ('sup_help_trigger_602',       'შესაბამისი თხოვნები მოინიშნება; დანარჩენი ჩუმად დარჩება.'),
  ('sup_micro_help_604',         'ღია ზარის ნაცვლად მთხოვნელს სწორედ ამას შევთავაზებ.'),
  ('val_connection_worth_502',   'ახალი კონტაქტები ამის მიხედვით შეფასდება.'),
  ('val_project_pull_505',       'შეიცვლება, რას მოგიტან შენი თხოვნის გარეშე.'),
  ('work_autonomy_405',          'განისაზღვრება, რამდენს გავაკეთებ შენს კითხვამდე.'),
  ('work_decision_style_402',    'წინ რომ შესაძლებლობა გიდევს, სწორედ ამ შემოწმებას გავუკეთებ.'),
  ('work_meeting_prep_401',      'შემდეგ მნიშვნელოვან შეხვედრამდე ზუსტად ამას მოგიმზადებ.'),
  ('work_planning_style_404',    'კვირის შეჯამება ფორმას შეიცვლის.'),
  ('work_reminder_type_403',     'მიიღებ სწორედ ასეთ შეხსენებას, დანარჩენი შეწყდება.')
) AS v(question_id, line)
WHERE question_bank.question_id = v.question_id
  AND question_bank.immediate_use_ka IS DISTINCT FROM v.line;
