// Ticket 6, task 22 (g)/(h): the run's FIXED strings — step lines, the
// working/failure lines, the status captions — must follow the conversation's
// language, server-side. Every English thread used to carry Georgian chrome:
// "Almaty connections check" → „შენი პასუხი სჭირდება". The language is the
// language of the user's LAST message, same rule the reply itself follows.

export type RunLanguage = 'ka' | 'en' | 'ru' | 'es';

export function detectRunLanguage(text: string): RunLanguage {
  if (/[ა-ჿ]/.test(text)) return 'ka';
  if (/[а-яё]/i.test(text)) return 'ru';
  if (/[áéíóúñ¿¡]/i.test(text)) return 'es';
  return 'en';
}

/**
 * Ticket 20 row 155 — „Ok" turned a Georgian conversation English.
 *
 * Thread 16539, Lika's meeting request, read end to end:
 *
 *   11:41:19  the ask, in Georgian, 174 characters
 *   12:06:46  the owner replies „Ok"
 *   12:07:13  gpt-5.6-terra: „I would send: “Yes, tomorrow, 18 September at
 *             13:00 online works for me.” Send it, and should I handle similar
 *             meeting requests this way in future?"  — 148 characters, not one
 *             Georgian letter
 *   12:09:06  the owner writes „გაუგზავნე"
 *   12:09:40  and the next reply is Georgian again
 *
 * The script guard in finalAnswer.service is not what failed: it refuses a
 * Latin-only reply in a Georgian thread and would have refused this one. It
 * was never asked, because the run's language is detected from the LATEST
 * message alone and „Ok" is two Latin characters. The conversation flipped to
 * English on an acknowledgement and flipped back on the next real word.
 *
 * THE RULE: a message decides the language when it CARRIES one. Georgian,
 * Cyrillic or Spanish letters are a positive signal at any length. Plain Latin
 * is only a signal once there is enough of it to be a sentence rather than a
 * „yes" — below that the conversation keeps the language it was already in.
 *
 * Right in both directions, which is why it is a fallback and not a Georgian
 * special case: „Ok" in an English thread finds English behind it and „Ok" in
 * a Georgian thread finds Georgian.
 */
const SIGNAL = /[ა-ჿ]|[а-яё]|[áéíóúñ¿¡]/i;

/**
 * Enough Latin to be a sentence. „Send it and remember this" is 25; „ok",
 * „yes", „sure", „send it" are all far below. Deliberately generous: mistaking
 * a short English line for the thread's Georgian costs a Georgian reply in an
 * English thread, which the owner can read either way — while the reverse cost
 * is what happened on 16539.
 */
const MIN_LATIN_CHARS_TO_SWITCH = 25;

export function languageOfConversation(
  latest: string,
  /** The thread's earlier messages, newest first. */
  earlier: readonly string[] = [],
): RunLanguage {
  const trimmed = latest.trim();
  if (SIGNAL.test(trimmed) || trimmed.length >= MIN_LATIN_CHARS_TO_SWITCH) {
    return detectRunLanguage(trimmed);
  }
  const spoken = earlier.find((text) => SIGNAL.test(text));
  return detectRunLanguage(spoken ?? trimmed);
}

interface RunStrings {
  opening: string;
  heartbeat: string;
  choicesOnly: string;
  emptyFinalFailure: string;
  /**
   * The line a person reads when their run died — and the one message they are
   * most likely to read carefully, because it is the one saying something went
   * wrong. It was Georgian in every language until 18 September, found on an
   * English thread whose run the reaper killed: 57 Georgian characters, zero
   * Latin, in a conversation with no Georgian anywhere else in it.
   */
  runDied: string;
  /** The same, when it died of the clock rather than a fault. */
  tookTooLong: string;
  /**
   * Row 217 — the provider refused us, and no amount of trying again will
   * change that. Says so without saying WHY: our billing is not the owner's
   * to carry, and „your answer failed because we ran out of credit" tells
   * somebody something about us they did not ask for.
   */
  serviceUnavailable: string;
  moderationBlocked: string;
  /** Ticket 12 Task 46 (D151): stands in for an officeholder's name no read page carried. */
  nameNotVerified: string;
  /**
   * Row 157, the engine's half: the line written INTO the thread when a goal's
   * own wake finds the wallet empty. It lived in taskEngine as one hardcoded
   * Georgian sentence, which is the seat's #4061 (h) again — an English
   * conversation would have been told, in Georgian, that its goal had stopped.
   * The status line beside it already had four languages here; the sentence
   * under it did not, and the two were different wordings of the same fact.
   */
  goalPausedNoTokens: string;
  /**
   * `needs_topup` is the P0 of 18 September: a run refused for an empty wallet
   * used to leave the thread reading „finished", because the thread was created
   * with the default done status and no goal ever contradicted it. A goal that
   * never started is not a completed goal, so the thread says what is actually
   * true and what the owner can do about it.
   */
  statusLines: {
    working: string;
    waiting: string;
    needs_you: string;
    needs_topup: string;
    failed: string;
    /**
     * Row 217, second half — the badge above the message must not contradict
     * it. `failed` says „try again", which is right for a run that broke and
     * wrong for a provider that has refused us: during the outage of
     * 18 September the message said „trying again will not help" with a badge
     * over it saying to try again.
     */
    unavailable: string;
  };
}

export const RUN_STRINGS: Readonly<Record<RunLanguage, RunStrings>> = {
  ka: {
    opening: '🔎 ვიწყებ — ვარკვევ, რა გვჭირდება...',
    heartbeat: '⏳ ისევ ვმუშაობ — ღრმა ძებნა დროს მოითხოვს...',
    choicesOnly: 'აირჩიე ერთ-ერთი:',
    emptyFinalFailure: 'პასუხი ვერ ჩამოყალიბდა — სცადე თავიდან, ან სხვანაირად დასვი კითხვა.',
    runDied: 'ტექნიკური შეფერხება მოხდა — პასუხი ვერ დასრულდა. გთხოვ, სცადე თავიდან.',
    serviceUnavailable:
      'სერვისი დროებით მიუწვდომელია — ეს ჩვენი მხრიდანაა და შენი ბრალი არ არის. ხელახლა ცდა ახლა არ დაგეხმარება; როგორც კი აღდგება, დაუყოვნებლივ გავაგრძელებ.',
    tookTooLong: 'პასუხის მომზადებას ძალიან დიდი დრო დასჭირდა. გთხოვ, სცადე თავიდან.',
    moderationBlocked:
      'პასუხის ტექსტი შიდა შემოწმებამ შეაჩერა — ეს ჩვენი მხრიდანაა და შენი ფორმულირების ბრალი არ არის. შესრულებული სამუშაო არ დაკარგულა; მომწერე „გაიმეორე" და თავიდან ჩამოგიყალიბებ.',
    nameNotVerified: '(სახელი ვერ დავადასტურე ოფიციალურ გვერდზე)',
    goalPausedNoTokens:
      'დავალებაზე მუშაობა შევაჩერე — ტოკენები ამოიწურა. შევსების შემდეგ გავაგრძელებ.',
    statusLines: {
      working: 'ვმუშაობ…',
      waiting: 'ველოდები პასუხს',
      needs_you: 'შენი პასუხი სჭირდება',
      needs_topup: 'ტოკენები ამოიწურა — შეავსე და გავაგრძელებ',
      failed: 'შეფერხდა — სცადე თავიდან',
      unavailable: 'სერვისი დროებით მიუწვდომელია',
    },
  },
  en: {
    opening: '🔎 Starting — working out what we need...',
    heartbeat: '⏳ Still working — deep search takes a moment...',
    choicesOnly: 'Pick one:',
    emptyFinalFailure: 'The reply did not come together — try again, or rephrase the question.',
    runDied: 'Something went wrong on our side and the answer did not finish. Please try again.',
    serviceUnavailable:
      'The service is temporarily unavailable — that is on us, not on you. Trying again now will not help; I will carry on the moment it is back.',
    tookTooLong: 'The answer took too long to put together. Please try again.',
    moderationBlocked:
      'An internal check held this reply back — that is on us, not on your wording. Nothing was lost; say "again" and I will rewrite it.',
    nameNotVerified: '(name not verified on an official page)',
    goalPausedNoTokens:
      'I have paused work on this goal — the tokens have run out. I will carry on once it is topped up.',
    statusLines: {
      working: 'Working…',
      waiting: 'Waiting for a reply',
      needs_you: 'Needs your answer',
      needs_topup: 'Out of tokens — top up and I will carry on',
      failed: 'Hit a snag — try again',
      unavailable: 'Service temporarily unavailable',
    },
  },
  ru: {
    opening: '🔎 Начинаю — разбираюсь, что нужно...',
    heartbeat: '⏳ Всё ещё работаю — глубокий поиск занимает время...',
    choicesOnly: 'Выбери один вариант:',
    emptyFinalFailure: 'Ответ не сложился — попробуй ещё раз или переформулируй вопрос.',
    runDied:
      'На нашей стороне произошёл сбой, и ответ не завершился. Пожалуйста, попробуй ещё раз.',
    tookTooLong: 'Ответ готовился слишком долго. Пожалуйста, попробуй ещё раз.',
    serviceUnavailable:
      'Сервис временно недоступен — это на нашей стороне, не на твоей. Повторять сейчас бесполезно; как только он вернётся, я сразу продолжу.',
    moderationBlocked:
      'Внутренняя проверка остановила этот ответ — это наша сторона, не твоя формулировка. Ничего не потеряно; напиши «повтори», и я перепишу.',
    nameNotVerified: '(имя не подтверждено на официальной странице)',
    goalPausedNoTokens:
      'Я приостановил работу над этой целью — токены закончились. Продолжу после пополнения.',
    statusLines: {
      working: 'Работаю…',
      waiting: 'Жду ответа',
      needs_you: 'Нужен твой ответ',
      needs_topup: 'Токены закончились — пополни, и я продолжу',
      failed: 'Сбой — попробуй ещё раз',
      unavailable: 'Сервис временно недоступен',
    },
  },
  es: {
    opening: '🔎 Empiezo — viendo qué necesitamos...',
    heartbeat: '⏳ Sigo trabajando — la búsqueda profunda toma un momento...',
    choicesOnly: 'Elige una opción:',
    emptyFinalFailure: 'La respuesta no salió — inténtalo de nuevo o reformula la pregunta.',
    runDied:
      'Algo falló de nuestro lado y la respuesta no se completó. Inténtalo de nuevo, por favor.',
    tookTooLong: 'La respuesta tardó demasiado en prepararse. Inténtalo de nuevo, por favor.',
    serviceUnavailable:
      'El servicio no está disponible ahora mismo — es cosa nuestra, no tuya. Reintentar no ayudará; en cuanto vuelva, sigo de inmediato.',
    moderationBlocked:
      'Una revisión interna detuvo esta respuesta — es cosa nuestra, no de tu redacción. No se perdió nada; escribe «repite» y la reescribo.',
    nameNotVerified: '(nombre no verificado en una página oficial)',
    goalPausedNoTokens:
      'He pausado el trabajo en este objetivo: se acabaron los tokens. Continuaré tras la recarga.',
    statusLines: {
      working: 'Trabajando…',
      waiting: 'Esperando respuesta',
      needs_you: 'Necesita tu respuesta',
      needs_topup: 'Sin tokens — recarga y sigo',
      failed: 'Algo falló — inténtalo de nuevo',
      unavailable: 'Servicio no disponible ahora',
    },
  },
};

// Step captions per tool. Georgian is the base map in chat.service; these
// override per language. A tool missing here falls back to the generic line —
// wrong-language chrome is the failure, a generic caption is not.
const GENERIC_STEP: Record<RunLanguage, string> = {
  ka: '⚙️ ვმუშაობ...',
  en: '⚙️ Working on it...',
  ru: '⚙️ Работаю...',
  es: '⚙️ Trabajando...',
};

const TOOL_STEPS_EN: Record<string, string> = {
  web_search: '🌐 Searching the web...',
  search_by_tag: '🔍 Searching your contacts...',
  search_contact_by_name: '🔍 Searching by name...',
  search_by_insight: '🔍 Searching saved info...',
  search_second_degree: '👥 Checking second-degree contacts...',
  search_contacts_by_country: '🌍 Searching by country...',
  get_contact_full_profile: '👤 Loading the profile...',
  lookup_contact_by_phone: '📱 Looking up the number...',
  get_contact_count: '📊 Counting contacts...',
  request_introduction: '📨 Sending the introduction request...',
  respond_to_introduction: '📬 Answering the request...',
  block_contact: '🚫 Blocking...',
  unblock_contact: '✅ Unblocking...',
  list_blocked_contacts: '📋 Loading the blocked list...',
  save_contact_fact: '💾 Saving the fact...',
  get_contact_facts: '📋 Loading facts...',
  save_contact_insight: '💾 Saving...',
  get_contact_insight: '📋 Loading...',
  update_user_profile: '💾 Updating your profile...',
  save_private_context: '💾 Saving...',
  get_thread_context: '💬 Checking other conversations...',
  set_task_result: '📌 Recording the result...',
  ask_contact: '✉️ Writing to the contact...',
  set_task_brief: '🗂 Updating the plan...',
  set_task_wake: '⏰ Scheduling a check-back...',
  finish_task: '🏁 Closing the goal...',
  relay_ask: '↪️ Passing the question on...',
  get_country_channels: '🌍 Checking channels...',
  get_netai_info: 'ℹ️ Reading Netai info...',
  get_intro_status: '📬 Checking introduction status...',
  stop_contacting_me: '🔕 Stopping messages...',
  allow_contacting_me: '🔔 Turning messages back on...',
  exclude_contact: '📝 Noting the decision...',
  remove_contact_exclusion: '📝 Lifting the exclusion...',
  retract_contact_fact: '✏️ Correcting the record...',
  remove_contact_from_network: '🗑 Removing from your network...',
  invite_contact: '💌 Preparing the invite...',
};

const TOOL_STEPS_RU: Record<string, string> = {
  web_search: '🌐 Ищу в интернете...',
  search_by_tag: '🔍 Ищу в контактах...',
  search_contact_by_name: '🔍 Ищу по имени...',
  search_by_insight: '🔍 Ищу в сохранённом...',
  search_second_degree: '👥 Проверяю второй круг...',
  search_contacts_by_country: '🌍 Ищу по стране...',
  get_contact_full_profile: '👤 Загружаю профиль...',
  lookup_contact_by_phone: '📱 Ищу по номеру...',
  get_contact_count: '📊 Считаю контакты...',
  request_introduction: '📨 Отправляю запрос на знакомство...',
  respond_to_introduction: '📬 Отвечаю на запрос...',
  ask_contact: '✉️ Пишу контакту...',
  finish_task: '🏁 Закрываю цель...',
  get_netai_info: 'ℹ️ Читаю справку Netai...',
  get_intro_status: '📬 Проверяю статус знакомства...',
};

const TOOL_STEPS_ES: Record<string, string> = {
  web_search: '🌐 Buscando en la web...',
  search_by_tag: '🔍 Buscando en tus contactos...',
  search_contact_by_name: '🔍 Buscando por nombre...',
  search_by_insight: '🔍 Buscando en lo guardado...',
  search_second_degree: '👥 Revisando el segundo círculo...',
  search_contacts_by_country: '🌍 Buscando por país...',
  get_contact_full_profile: '👤 Cargando el perfil...',
  lookup_contact_by_phone: '📱 Buscando el número...',
  get_contact_count: '📊 Contando contactos...',
  request_introduction: '📨 Enviando la solicitud...',
  respond_to_introduction: '📬 Respondiendo la solicitud...',
  ask_contact: '✉️ Escribiendo al contacto...',
  finish_task: '🏁 Cerrando la meta...',
  get_netai_info: 'ℹ️ Leyendo la info de Netai...',
  get_intro_status: '📬 Revisando el estado...',
};

const TOOL_STEPS_BY_LANG: Record<Exclude<RunLanguage, 'ka'>, Record<string, string>> = {
  en: TOOL_STEPS_EN,
  ru: TOOL_STEPS_RU,
  es: TOOL_STEPS_ES,
};

/** The step caption for a tool in the run's language; null = caller's Georgian base map decides. */
export function toolStepCaption(tool: string, lang: RunLanguage): string | null {
  if (lang === 'ka') return null;
  return TOOL_STEPS_BY_LANG[lang][tool] ?? GENERIC_STEP[lang];
}

/**
 * The same pause, when the wake it is refusing was carrying NEWS.
 *
 * Goal 6205, 19 September, the seat's 290. The owner asked for an
 * introduction. Test 2 agreed, Test 3 was reached, Test 3 accepted and offered
 * his week — and the entire chain worked. The wake that would have told him so
 * arrived at 19:10:21, found the wallet empty, and was answered with
 * `goalPausedNoTokens`. So the only thing the product has ever said to him
 * about work that succeeded is that he owes money.
 *
 * NOTHING IS LOST — `sweepUnwokenAnswers` marks an ask delivered only on
 * 'woken', so the answer is re-offered every sweep and arrives in full once
 * there is an allowance. But „held" and „nothing happened" are different
 * facts, and the person is entitled to the first one.
 *
 * The name and no more. Writing the answer itself here would mean composing
 * the owner's update without a run, which is the thing this branch exists
 * because it cannot do — and a name is what turns an invoice back into news.
 */
export function answerHeldNoTokens(language: RunLanguage, who: string): string {
  switch (language) {
    case 'en':
      return `${who} has answered. I cannot write up their reply until the tokens are topped up — nothing is lost, it is waiting.`;
    case 'ru':
      return `${who} ответил. Я не могу подготовить ответ, пока не пополнены токены — ничего не потеряно, он ждёт.`;
    case 'es':
      return `${who} ha respondido. No puedo redactar su respuesta hasta que recargues los tokens: no se ha perdido nada, está esperando.`;
    default:
      return `${who}-მა გიპასუხა. პასუხის ჩამოყალიბებას ტოკენების შევსება სჭირდება — არაფერი დაკარგულა, გელოდება.`;
  }
}

/**
 * „Stopped" — the caption under a thread whose goal its owner stopped.
 *
 * Lives here rather than in goalStop because two places need it now: the write
 * at the moment of the stop, and the READ that supplies it when the write has
 * since been erased. A thread's caption is nulled by any later
 * `setThreadStatus(..., 'done')`, so the stored one is not a reliable record of
 * anything and the reader has to be able to say it too.
 */
export const STOPPED_STATUS_LINE: Readonly<Record<RunLanguage, string>> = {
  ka: 'შეჩერებულია',
  en: 'Stopped',
  ru: 'Остановлено',
  es: 'Detenido',
};
