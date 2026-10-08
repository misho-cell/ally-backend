-- 2182 (Lika, 7 Oct, „very important"): asked what Netai needs to know about
-- her, she got questions that had nothing to do with anything useful. The five
-- that help Netai work for her come first: what she does and where, what she
-- can help others with, what she is looking for now, which topics she must not
-- be asked about, how and when she wants to be reached. Each is answered in her
-- own words (no options), one at a time, with its plain reason beside it.
INSERT INTO question_bank
  (question_id, category, surface, prompt_ka, prompt_en, options, score_vector,
   immediate_use, immediate_use_ka, immediate_use_en, select_mode, goal_bound)
VALUES
  ('core_what_where_001', 'core', 'any',
   'რას საქმიანობ და სად? (პროფესია, კომპანია, ქალაქი)',
   'What do you do, and where? (work, company, city)',
   '[]', '{}',
   'So I know whom you can help, and who can help you.',
   'ასე ვიცი, ვის შეიძლება დაეხმარო შენ და ვინ შეიძლება დაგეხმაროს.',
   'So I know whom you can help, and who can help you.',
   'single', FALSE),
  ('core_can_help_002', 'core', 'any',
   'რაში შეგიძლია სხვებს დაეხმარო?',
   'What can you help other people with?',
   '[]', '{}',
   'When somebody needs exactly that, I will think of you first.',
   'როცა ვინმეს სწორედ ეს სჭირდება, პირველად შენზე ვიფიქრებ.',
   'When somebody needs exactly that, I will think of you first.',
   'single', FALSE),
  ('core_looking_for_003', 'core', 'any',
   'ახლა რას ეძებ ან რა გჭირდება?',
   'What are you looking for right now?',
   '[]', '{}',
   'I look for the right people for that.',
   'ამისთვის საჭირო ხალხს მოვძებნი.',
   'I look for the right people for that.',
   'single', FALSE),
  ('core_dont_ask_004', 'core', 'any',
   'რა თემებზე არ გინდა, რომ შეგეკითხონ?',
   'Which topics do you not want to be asked about?',
   '[]', '{}',
   'Questions on those topics will not reach you.',
   'ამ თემებზე კითხვებს შენამდე აღარ მოვიტან.',
   'Questions on those topics will not reach you.',
   'single', FALSE),
  ('core_reach_005', 'core', 'any',
   'როდის და როგორ გირჩევნია, რომ დაგიკავშირდე?',
   'When and how would you rather I reach you?',
   '[]', '{}',
   'I write to you when it suits you.',
   'შენთვის მოსახერხებელ დროს მოგწერ.',
   'I write to you when it suits you.',
   'single', FALSE)
ON CONFLICT (question_id) DO NOTHING;
