import { FactAboutMe } from './factsAboutMe.service';
import { SetupStep } from './setupState.service';

/**
 * #7729 / #7757, the founder's rules for a joiner's first message (tester,
 * box 78825, 30 Oct; „ოკ" 13:23 Tbilisi): one message, in the joiner's
 * language, by first name —
 *   1. one true line about what they do now, from research with a source,
 *      skipped when research found nothing;
 *   2. what Netai is for them, one sentence;
 *   3. one concrete offer that fits their work, answered in one word;
 *   4. only the ONE missing step that matters most, with its link.
 * Never „someone here needs exactly you" (Misho, 26 Oct), never another
 * member or their goal, no „welcome back", „შენ". Nothing more until they
 * answer.
 *
 * The server picks the fact and the step; the model only words them. A fact
 * the model was not handed is a fact it may not state.
 */
/** The product event that records a joiner's first message (one per person, ever). */
export const JOINER_FIRST_MESSAGE_EVENT = 'joiner_first_message';
const APP_URL = 'https://www.netai.guru';
const SETUP_URL = `${APP_URL}/setup`;
const CONTACTS_LINK_TOOL = 'get_contacts_upload_link';

/** The joiner's own fact fields that say what they do now. */
const WORK_FACT_FIELDS: readonly string[] = ['occupation', 'employer', 'headline', 'other_role'];
const CONFIRMED = 'confirmed';

/** The steps a joiner's first message may name, most important first. */
const FIRST_MESSAGE_STEPS: readonly SetupStep[] = [
  SetupStep.Contacts,
  SetupStep.Notifications,
  SetupStep.Install,
];

export interface JoinerBrief {
  /** One researched fact about their work now, with a page behind it; null when none. */
  readonly workFact: string | null;
  readonly missingStep: SetupStep | null;
}

/** The first confirmed, sourced fact about the joiner's work, in field order. */
export function researchedWorkFact(facts: readonly FactAboutMe[]): string | null {
  for (const field of WORK_FACT_FIELDS) {
    const fact = facts.find(
      (f) =>
        f.field === field &&
        f.source_url !== null &&
        f.status === CONFIRMED &&
        f.value.trim() !== '',
    );
    if (fact !== undefined) return fact.value.trim();
  }
  return null;
}

/** The one missing step that matters most; null when all three are done. */
export function mostImportantMissingStep(missing: readonly SetupStep[]): SetupStep | null {
  return FIRST_MESSAGE_STEPS.find((step) => missing.includes(step)) ?? null;
}

function workPart(workFact: string | null): string {
  return workFact === null
    ? '(1) მის საქმიანობაზე გადამოწმებული არაფერი ვიცი — ეს ნაწილი გამოტოვე და არაფერი ივარაუდო.'
    : `(1) ერთი წინადადება იმაზე, რასაც ახლა აკეთებს, მხოლოდ ამ გადამოწმებული ფაქტით: „${workFact}". ` +
        'სხვა არაფერი ივარაუდო.';
}

function stepPart(step: SetupStep | null): string {
  switch (step) {
    case SetupStep.Contacts:
      return (
        `(4) კონტაქტები ჯერ არ აქვს ატვირთული: ${CONTACTS_LINK_TOOL}-ით აიღე ბმული, ჩასვი და ` +
        'ერთი წინადადებით უთხარი, რას მისცემს — ვნახავ, ვის იცნობს იმ ადამიანებთან ახლოს.'
      );
    case SetupStep.Notifications:
      return (
        `(4) შეტყობინებები ჯერ არ აქვს ჩართული: ჩასვი ბმული ${SETUP_URL} და ერთი წინადადებით ` +
        'უთხარი, რას მისცემს — პასუხს მაშინვე გაიგებს.'
      );
    case SetupStep.Install:
      return (
        `(4) Netai ჯერ არ აქვს ეკრანზე დამატებული: ჩასვი ბმული ${SETUP_URL} და ერთი წინადადებით ` +
        'უთხარი, რას მისცემს — ერთი შეხებით გახსნის.'
      );
    default:
      return '(4) ყველა საჭირო ნაბიჯი გავლილი აქვს — ამაზე არაფერი თქვა.';
  }
}

/** What the model is told for the joiner's first message under the founder's rules. */
export function joinerRulesEventBody(brief: JoinerBrief): string {
  return [
    'ეს ადამიანი ახლახან შემოვიდა Netai-ზე და ეს მისი პირველი შეტყობინებაა Netai-სგან. დაწერე ' +
      'ერთი მოკლე შეტყობინება მისივე ენაზე, სახელით მიმართე და „შენ"-ით. ოთხი ნაწილი, ამ რიგით:',
    workPart(brief.workFact),
    '(2) ერთი წინადადება იმაზე, რაში გამოადგება Netai: მომეცი ნებისმიერი საქმე — კლიენტი, ' +
      'მომწოდებელი, საჭირო ადამიანი თუ რჩევა — და ბოლომდე მივიყვან; ხალხის პოვნა მხოლოდ საშუალებაა.',
    '(3) ერთი კონკრეტული შეთავაზება, რომელიც მის საქმეს ერგება, კითხვად, რომელზეც ერთი სიტყვით ' +
      'უპასუხებს.',
    stepPart(brief.missingStep),
    'არ დაიწყო „აქ ვიღაცას ზუსტად შენ სჭირდები"-თი, არ ახსენო სხვა წევრი ან მისი მიზანი და არ ' +
      'თქვა „კეთილი იყოს შენი დაბრუნება". მეტი არაფერი, სანამ არ გიპასუხებს. არაფერი მოძებნო და ' +
      'არავის მისწერო.',
  ].join('\n');
}
