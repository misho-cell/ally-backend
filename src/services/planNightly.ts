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

const NIGHTLY_SILENCE_WITH_STEPS =
  'გეგმა ნაბიჯებად მიდის: სიჩუმეზე სერვერი თვითონ გადადის ნაბიჯის on_silence წესით, ' +
  'უარზე — on_no წესით, და ამას მფლობელის ახალი „კი" არ სჭირდება. ვინ არის შემდეგი, ' +
  '„სად ვართ"-ში წერია — მის გარეთ არავის მისწერო და ახალ გეგმას ნუ შესთავაზებ, სანამ ' +
  'გეგმის ნაბიჯები არ ამოიწურა. ';

const NIGHTLY_CLOSING =
  'ყოველი პასუხი დაასრულე ერთი სტრიქონით: რა მიდის ახლა და ვის ვკითხე; თუ პასუხს ელოდები, ზუსტად „როგორც კი ვინმე გიპასუხებს, მაშინვე გეტყვი." — საათები და დღეები არ ახსენო (D563). ' +
  'თუ წინსვლა მფლობელის პასუხზეა ჩამოკიდებული — გამოიძახე ask_owner_decision ზუსტი ' +
  'კითხვით: ის კითხვას მფლობელის მომდევნო საუბარში იტანს. ეს მაშინაც გააკეთე, როცა ' +
  'ლოდინს თხრობით ამბობ („ველოდები მის გადაწყვეტილებას ორ კანდიდატზე") — მფლობელისგან ' +
  'რაღაცის ლოდინი ბლოკია, როგორც არ უნდა ჟღერდეს წინადადება.';

/** The nightly review's event for this goal's plan. */
export function nightlyReviewEvent(plan: PlanWithSteps | null): string {
  const silence = planHasSteps(plan) ? NIGHTLY_SILENCE_WITH_STEPS : NIGHTLY_SILENCE_WITHOUT_STEPS;
  return `${NIGHTLY_OPENING}${silence}${NIGHTLY_CLOSING}`;
}
