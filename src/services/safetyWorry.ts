import { RunLanguage } from './runLanguage';

/**
 * 3568 (MASTER TEST RUN SA-013 step 5, 2 of 2): in a goal about a friend in
 * deep depression the owner typed „მეშინია, თავს რამე არ დაუშავოს." Both
 * moderation votes blocked the model's reply, and the owner read the
 * internal-check apology — „…შიდა შემოწმებამ შეაჩერა… მომწერე „გაიმეორე""
 * — at the one moment a human word matters. The first reply of the same goal
 * had said the right thing, so the model can answer; the check stops it.
 *
 * When a reply is blocked and the owner's line is a worry about somebody's
 * safety (or their own), the server's own short, warm answer stands in place
 * of the apology: stay with them, 112 when in danger, an offer to find help.
 */

/** Somebody else may hurt themselves. */
const WORRY_ABOUT_OTHER_RE =
  /(თავს\s+(?:რამე\s+)?(?:არ\s+)?(?:დაუშავ|დაიზიან|მოიკლ)|თავის\s+მოკვლ|სუიციდ|თვითმკვლელ|(?:hurt|harm|kill)\s+(?:himself|herself|themselves)|end\s+(?:his|her|their)\s+(?:own\s+)?life|suicid|self[-\s]?harm|покончит\w*\s+с\s+собой|навредит\w*\s+себе|убь[её]т\s+себя|суицид|(?:hacerse|se\s+haga)\s+daño|quitarse\s+la\s+vida)/iu;

/** The owner may hurt themselves. */
const OWN_CRISIS_RE =
  /(თავს\s+(?:მოვიკლავ|მოვიკლა|დავიზიანებ)|სიცოცხლე\s+აღარ\s+მინდა|მოკვდომა\s+მინდა|\bI\s+(?:want\s+to|will|might|am\s+going\s+to)\s+(?:kill|hurt|harm)\s+myself\b|\bI\s+want\s+to\s+die\b|\bI\s+don'?t\s+want\s+to\s+live\b|покончу\s+с\s+собой|хочу\s+умереть|не\s+хочу\s+жить|quiero\s+morir|me\s+voy\s+a\s+matar|no\s+quiero\s+vivir)/iu;

export enum SafetyWorry {
  AboutSomeoneElse = 'about_someone_else',
  AboutThemselves = 'about_themselves',
}

export function safetyWorryIn(ownerLine: string): SafetyWorry | null {
  if (OWN_CRISIS_RE.test(ownerLine)) return SafetyWorry.AboutThemselves;
  if (WORRY_ABOUT_OTHER_RE.test(ownerLine)) return SafetyWorry.AboutSomeoneElse;
  return null;
}

const SAFETY_REPLIES: Readonly<Record<RunLanguage, Readonly<Record<SafetyWorry, string>>>> = {
  ka: {
    [SafetyWorry.AboutSomeoneElse]:
      'მესმის, ეს ძალიან საშიშია. თუ ფიქრობ, რომ ის ახლა საფრთხეშია, დარეკე 112-ზე და მარტო ნუ დატოვებ. დაელაპარაკე და პირდაპირ ჰკითხე, როგორ არის — ასეთი კითხვა ზიანს არ აყენებს. თუ გინდა, შენს კონტაქტებში მოვძებნი ფსიქოლოგს ან ფსიქიატრს, ვინც დახმარებას შეძლებს.',
    [SafetyWorry.AboutThemselves]:
      'კარგია, რომ მომწერე. თუ ახლა საფრთხეში ხარ, დარეკე 112-ზე. ამასთან მარტო არ უნდა იყო — ახლავე უთხარი ვინმე ახლობელს. თუ გინდა, შენს კონტაქტებში მოვძებნი ფსიქოლოგს, ვინც დაგეხმარება.',
  },
  en: {
    [SafetyWorry.AboutSomeoneElse]:
      'I understand, this is frightening. If you think they are in danger right now, call 112 and do not leave them alone. Talk to them and ask directly how they are — asking does not make it worse. If you want, I will look in your contacts for a psychologist or psychiatrist who can help.',
    [SafetyWorry.AboutThemselves]:
      'I am glad you wrote to me. If you are in danger right now, call 112. You do not have to be alone with this — tell someone close to you now. If you want, I will look in your contacts for a psychologist who can help.',
  },
  ru: {
    [SafetyWorry.AboutSomeoneElse]:
      'Понимаю, это очень страшно. Если думаешь, что человек сейчас в опасности, позвони 112 и не оставляй его одного. Поговори с ним и прямо спроси, как он, — такой вопрос не вредит. Если хочешь, я найду в твоих контактах психолога или психиатра, который сможет помочь.',
    [SafetyWorry.AboutThemselves]:
      'Хорошо, что ты написал мне. Если ты сейчас в опасности, позвони 112. Не оставайся с этим один — скажи кому-то близкому прямо сейчас. Если хочешь, я найду в твоих контактах психолога, который поможет.',
  },
  es: {
    [SafetyWorry.AboutSomeoneElse]:
      'Te entiendo, da mucho miedo. Si crees que esa persona está en peligro ahora mismo, llama al 112 y no la dejes sola. Habla con ella y pregúntale directamente cómo está; preguntar no empeora nada. Si quieres, busco en tus contactos un psicólogo o psiquiatra que pueda ayudar.',
    [SafetyWorry.AboutThemselves]:
      'Me alegra que me hayas escrito. Si estás en peligro ahora mismo, llama al 112. No tienes que pasar por esto solo: díselo ahora a alguien cercano. Si quieres, busco en tus contactos un psicólogo que pueda ayudarte.',
  },
};

/** The server's answer to a safety worry; null when the line is no such worry. */
export function safetyReplyFor(ownerLine: string, language: RunLanguage): string | null {
  const worry = safetyWorryIn(ownerLine);
  if (worry === null) return null;
  return (SAFETY_REPLIES[language] ?? SAFETY_REPLIES.ka)[worry];
}
