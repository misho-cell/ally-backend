-- Founder's two decisions on top of the 43-row load (071): rename one
-- val_connection_worth_502 option and add one new option to it and to
-- val_project_pull_505. The tester's own draft SQL used `id` and
-- `dimensions` as column names — this table has neither (its key is
-- question_id, its tag array is signals, confirmed via
-- information_schema before writing this) — corrected here.

UPDATE question_bank SET
  options = '[{"id": "expertise", "ka": "საქმის მცოდნე და პროფესიონალი", "en": "Someone who really knows their work"}, {"id": "integrity", "ka": "პატიოსანი და სანდო", "en": "Honest and reliable"}, {"id": "doer", "ka": "საქმის გამკეთებელი", "en": "Someone who gets things done"}, {"id": "access", "ka": "ვინც სწორ ადამიანებთან დამაკავშირებს", "en": "Someone who connects me to the right people"}, {"id": "complementary", "ka": "ვინც ავსებს იმას, რაც მე არ შემიძლია", "en": "Someone who covers what I can''t do"}, {"id": "shared_goals", "ka": "ვისთანაც საერთო მიზნები მაქვს", "en": "Someone whose goals are the same as mine"}, {"id": "counsel", "ka": "ვინც საქმეს კარგად იცნობს და ვისთანაც შემიძლია ყველაფერი განვიხილო", "en": "Someone who knows the field and who I can think things through with"}, {"id": "other", "ka": "სხვა", "free_text": true, "scores": false, "en": "Someone else"}]'::jsonb,
  signals = ARRAY['value_driver:expertise','value_driver:access','value_driver:integrity','value_driver:doer','value_driver:complementary','value_driver:shared_goals','value_driver:counsel']::text[]
WHERE question_id = 'val_connection_worth_502';

UPDATE question_bank SET
  options = '[{"id": "scalable", "ka": "მასშტაბირებადი ბიზნესი", "en": "A business that can scale"}, {"id": "creative", "ka": "შემოქმედებითი", "en": "Something creative"}, {"id": "social", "ka": "სოციალური გავლენა", "en": "Social impact"}, {"id": "technical", "ka": "ტექნიკური გამოწვევა", "en": "A technical challenge"}, {"id": "community", "ka": "საზოგადოება", "en": "Community"}, {"id": "premium", "ka": "პრემიუმ კლიენტები", "en": "Premium clients"}, {"id": "global", "ka": "ბიზნესი, რომელიც ერთ ქვეყანას სცდება", "en": "A business that goes beyond one country"}, {"id": "other", "ka": "სხვა", "free_text": true, "scores": false, "en": "Something else"}]'::jsonb,
  signals = ARRAY['value_driver:scalable','value_driver:expertise','value_driver:creative','value_driver:social','value_driver:technical','value_driver:community','value_driver:premium','value_driver:global']::text[]
WHERE question_id = 'val_project_pull_505';
