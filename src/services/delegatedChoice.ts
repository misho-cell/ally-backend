/**
 * DR2 (#8615, the tester's 81317; thread 76858, 2 Nov 14:09): the owner wrote
 * „შენით გადაწყვიტე ვის მიწერ …" — decide yourself whom to write — and both
 * approve_task_plan and grant_task_permission refused it as „nothing reads as
 * a yes", so nothing went out. Handing the choice of people to the assistant
 * is the owner's yes to writing to the people it picks for this goal.
 */
const DELEGATES_THE_CHOICE_RE =
  /(?:შენით|შენ თვითონ|შენ)\s+(?:გადაწყვიტე|აირჩიე|შეარჩიე)|როგორც\s+(?:გინდა|ჩათვლი|გადაწყვეტ)|\byou\s+(?:decide|choose|pick)\b|\bup\s+to\s+you\b|\byour\s+(?:call|choice)\b|(?:реши|выбери|решай)\s+сам|на\s+твой\s+выбор/iu;

/** „what do you decide?" asks; it hands nothing over. */
const ENDS_AS_A_QUESTION_RE = /[?？]\s*$/u;

/** Does the owner's line leave to the assistant whom to write? */
export function delegatesTheChoiceOfPeople(said: string): boolean {
  return DELEGATES_THE_CHOICE_RE.test(said) && !ENDS_AS_A_QUESTION_RE.test(said);
}
