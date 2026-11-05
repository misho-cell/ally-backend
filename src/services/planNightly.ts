import { PlanWithSteps, planHasSteps } from './planSteps';

/**
 * The nightly review's event (moved here from taskEngine.service unchanged for
 * plans without steps).
 *
 * Autonomy stage 2: for a plan with steps, its middle part — „write to the next
 * people on the list; after three silent days propose a new method, which needs
 * a new yes" — pulled against the plan the owner approved. Silence there is a
 * step's own on_silence rule, applied by the server with no new yes, and who is
 * next is the plan's order. So that part is replaced, not added to.
 */

const NIGHTLY_OPENING =
  'ღამის გადახედვა: ქსელში გუშინდელის მერე ახალი ხალხი/ინფორმაცია შეიძლება გაჩნდა. ' +
  'გაიმეორე ძირითადი ძიებები და შეადარე brief-ს — მფლობელს მხოლოდ რეალური სიახლე აცნობე; ' +
  'თუ არაფერია, ჩუმად განაახლე brief-ი და საჭიროებისას set_task_wake-ით გადადე. ';

// The standard, lines 3 and 4 (D117, D119): a silent day widens the circle
// inside the plan; three silent days change the method — a plan change, so a
// new yes, while the rest keeps running.
const NIGHTLY_SILENCE_WITHOUT_STEPS =
  'თუ გუშინდელი კითხვა უპასუხოდ დარჩა — არ დაელოდე: გეგმის „ვის ვკითხავ" სიიდან შემდეგ ' +
  'ადამიანებს მისწერე (რამდენიმეს ერთდროულად). თუ სამი დღეა პასუხი არ არის — მეთოდი შეცვალე: ' +
  'propose_task_plan-ით შესთავაზე ახალი გზა ან ახალი წრე; დამტკიცებული გზები კი გრძელდება. ';

// K9 audit B10 (session 3): with steps, silence is the step's on_silence rule — no new yes.
const NEXT_STEP_OR_NEW_ROUTE =
  'თუ გეგმას შემდეგი ნაბიჯი აქვს — ის ახლავე გააკეთე. ახალი გეგმა მხოლოდ მაშინ, როცა ' +
  'ნაბიჯები ამოიწურა: მფლობელს ერთი ხაზით უთხარი, რა ვცადეთ, და ერთი ახალი გზა შესთავაზე. ';

const NIGHTLY_SILENCE_WITH_STEPS = NEXT_STEP_OR_NEW_ROUTE;

/** K9 audit B10: the closing line for a plan with steps — what happened and what is next. */
const STEPS_CLOSING_LINE = 'ბოლოს ერთი ხაზი: რა მოხდა და რა არის შემდეგი (გეგმის დღეებით).';

const NIGHTLY_CLOSING_LINE =
  'ყოველი პასუხი დაასრულე ერთი სტრიქონით: რა მიდის ახლა და ვის ვკითხე; თუ პასუხს ელოდები, ზუსტად „როგორც კი ვინმე გიპასუხებს, მაშინვე გეტყვი." — საათები და დღეები არ ახსენო (D563). ';

const NIGHTLY_OWNER_BLOCK =
  'თუ წინსვლა მფლობელის პასუხზეა ჩამოკიდებული — გამოიძახე ask_owner_decision ზუსტი ' +
  'კითხვით: ის კითხვას მფლობელის მომდევნო საუბარში იტანს. ეს მაშინაც გააკეთე, როცა ' +
  'ლოდინს თხრობით ამბობ („ველოდები მის გადაწყვეტილებას ორ კანდიდატზე") — მფლობელისგან ' +
  'რაღაცის ლოდინი ბლოკია, როგორც არ უნდა ჟღერდეს წინადადება.';

/** The nightly review's event for this goal's plan. */
export function nightlyReviewEvent(plan: PlanWithSteps | null): string {
  return planHasSteps(plan)
    ? `${NIGHTLY_OPENING}${NIGHTLY_SILENCE_WITH_STEPS}${STEPS_CLOSING_LINE} ${NIGHTLY_OWNER_BLOCK}`
    : `${NIGHTLY_OPENING}${NIGHTLY_SILENCE_WITHOUT_STEPS}${NIGHTLY_CLOSING_LINE}${NIGHTLY_OWNER_BLOCK}`;
}

const SILENT_DAY_OPENING = 'ერთი დღეა კითხვა უპასუხოდ არის და ახალი არავის მისწერია. ';

// Moved from taskEngine.service unchanged for plans without steps.
const SILENT_DAY_WITHOUT_STEPS =
  'სტანდარტის წესია: ჩუმი დღე = ' +
  'მეტ ადამიანს ჰკითხე. გეგმის „ვის ვკითხავ" სიიდან, ვისაც ჯერ არ მისწერია, ახლა მისწერე — ' +
  'რამდენიმეს ერთდროულად, არა თითო-თითოდ. ეს გეგმის ფარგლებშია და ცალკე თანხმობა არ სჭირდება. ' +
  'თუ სიაში ყველას უკვე მისწერე — ეს მეთოდის შეცვლის დროა: propose_task_plan-ით შესთავაზე ' +
  'ახალი წრე ან ახალი გზა. ' +
  NIGHTLY_CLOSING_LINE;

/** The silent-day wake's event (K9 audit B10): a plan with steps follows its next step. */
export function silentDayEvent(plan: PlanWithSteps | null, quietDayRule: string): string {
  const body = planHasSteps(plan)
    ? `${NEXT_STEP_OR_NEW_ROUTE}${STEPS_CLOSING_LINE} `
    : SILENT_DAY_WITHOUT_STEPS;
  return `${SILENT_DAY_OPENING}${body}${quietDayRule}`;
}
