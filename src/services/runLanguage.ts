import { geoName } from './georgianCase';

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
   * The same again, when WE killed it — a deploy landed on top of a run that
   * was working perfectly well.
   *
   * 21 September, thread 21121: the owner typed at 23:20:55, my deploy's
   * SIGTERM reached the container at 23:20:56, the platform killed it at
   * 23:21:07, and at 23:22:14 the reaper wrote them `runDied` — „something
   * went wrong on our side, please try again". Every word of that is true and
   * the shape of it is not: it is the sentence for a fault, and this was not a
   * fault. It arrived seventy-eight seconds late, after a spinner that never
   * stopped, and it invites a retry into the same restart.
   *
   * So this one names the cause, promises nothing about resuming — the process
   * that held the run is gone and nothing picks it back up — and says the one
   * thing the owner can act on.
   */
  restartedMidRun: string;
  /**
   * Row 217 — the provider refused us, and no amount of trying again will
   * change that. Says so without saying WHY: our billing is not the owner's
   * to carry, and „your answer failed because we ran out of credit" tells
   * somebody something about us they did not ask for.
   *
   * AND IT NO LONGER PROMISES TO CARRY ON BY ITSELF, because nothing does.
   *
   * The sentence was „I will carry on the moment it is back", and on
   * 22 September that was measured against the thing it promises. Anthropic
   * was dark from 11:15:21 to 13:40:27. Two goals died inside it — threads
   * 21784 and 21789, tasks 8089 and 8094 — and at 13:49, an hour and three
   * quarters after the service returned, both were still `failed`, still two
   * messages long, `next_wake_at` NULL. The condition the sentence named
   * arrived and nothing happened.
   *
   * Nothing retries a dead run: `markRunFailed` sets a status and returns.
   * The `engine_wakes` sweeper re-runs a wake the process lost, not a call the
   * provider refused. And a retry is not the mend — `messageHeldNoTokens`
   * already decided this exact question for the empty wallet: „re-running
   * somebody's message hours later, unasked, could send real messages to real
   * people on a decision they have had all night to change their mind about."
   *
   * So the sentence asks instead of promising, which is a thing the owner can
   * actually cause. Misho's word, 22 September. `restartedMidRun` has said it
   * this way since the day it was written, and these two now agree.
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
   *
   * ROW 221, 21 September — it used to read „top up and I will carry on", and
   * the message underneath it read „send it again and I will pick it up". Two
   * promises about the same moment, and the badge's was the false one: the
   * seat established that a refused message creates no goal, so nothing
   * resumes on its own and the person must resend. They say one thing now.
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
  /**
   * 20 September, the sweep after the introduction was localised: every call
   * site that writes a message a PERSON reads, checked for a Georgian literal.
   * Six were left, and the three worst reach somebody who is not the owner —
   * the ask flow, whose wrapper has been in the reader's own language since
   * the 19th while everything around it stayed Georgian.
   *
   * The forty-eight-hour nudge on an unanswered question. It goes to the
   * RECIPIENT, who is often a stranger: the wrapper above it speaks their
   * language and this did not.
   */
  askReminder: string;
  /** The same nudge on their lock screen, where it is all they see. */
  askReminderPush: { title: string; body: string };
  /**
   * The engine's own step died and WILL RETRY ITSELF — deliberately not
   * `runDied`, which tells the owner to try again. Here nobody needs to.
   */
  stepFailedWillRetry: string;
  /** Too many messages too fast. Written into the thread as an error row. */
  tooManyMessages: string;
  /**
   * The owner paused this goal themselves. Not „done" — a paused goal is
   * stopped-for-now and they are the one who resumes it.
   *
   * On the screen since 20 September, when the client started drawing
   * `status_line` instead of its own generic label. Before that this was a
   * field nobody read; now it is the sentence under the goal's title.
   */
  goalPaused: string;
  /**
   * The chrome around a goal's own push. The BODY is the reply itself and is
   * already in the owner's language; the title above it, and the fallback when
   * the reply is empty, were Georgian on every lock screen in the world.
   */
  goalNewsPush: { title: string; body: string };
}

export const RUN_STRINGS: Readonly<Record<RunLanguage, RunStrings>> = {
  ka: {
    opening: '🔎 ვიწყებ — ვარკვევ, რა გვჭირდება...',
    heartbeat: '⏳ ისევ ვმუშაობ — ღრმა ძებნა დროს მოითხოვს...',
    choicesOnly: 'აირჩიე ერთ-ერთი:',
    emptyFinalFailure: 'პასუხი ვერ ჩამოყალიბდა — სცადე თავიდან, ან სხვანაირად დასვი კითხვა.',
    runDied: 'ტექნიკური შეფერხება მოხდა — პასუხი ვერ დასრულდა. გთხოვ, სცადე თავიდან.',
    serviceUnavailable:
      'სერვისი დროებით მიუწვდომელია — ეს ჩვენი მხრიდანაა და შენი ბრალი არ არის. ხელახლა ცდა ახლა არ დაგეხმარება. როცა აღდგება, გამომიგზავნე ხელახლა და მაშინვე ავიღებ.',
    tookTooLong: 'პასუხის მომზადებას ძალიან დიდი დრო დასჭირდა. გთხოვ, სცადე თავიდან.',
    restartedMidRun:
      'სერვერი განახლდა და ეს პასუხი შუა გზაზე შეწყდა — ეს ჩვენი მხრიდანაა და შენი ბრალი არ არის. გამომიგზავნე ხელახლა და მაშინვე ავიღებ.',
    moderationBlocked:
      'პასუხის ტექსტი შიდა შემოწმებამ შეაჩერა — ეს ჩვენი მხრიდანაა და შენი ფორმულირების ბრალი არ არის. შესრულებული სამუშაო არ დაკარგულა; მომწერე „გაიმეორე" და თავიდან ჩამოგიყალიბებ.',
    nameNotVerified: '(სახელი ვერ დავადასტურე ოფიციალურ გვერდზე)',
    goalPausedNoTokens:
      'დავალებაზე მუშაობა შევაჩერე — ტოკენები ამოიწურა. შევსების შემდეგ გავაგრძელებ.',
    statusLines: {
      working: 'ვმუშაობ…',
      waiting: 'ველოდები პასუხს',
      needs_you: 'შენი პასუხი სჭირდება',
      needs_topup: 'ტოკენები ამოიწურა — შეავსე და ხელახლა გამომიგზავნე',
      failed: 'შეფერხდა — სცადე თავიდან',
      unavailable: 'სერვისი დროებით მიუწვდომელია',
    },
    askReminder:
      'შეხსენება: ეს კითხვა ჯერ უპასუხოა — თუ ერთი წუთი გაქვს, პასუხი ძალიან გამოადგება. თუ არ იცი, ისიც მომწერე და აღარ შეგაწუხებ.',
    askReminderPush: { title: 'Netai — შეხსენება', body: 'უპასუხო კითხვა გელოდება.' },
    stepFailedWillRetry: 'დავალების ნაბიჯი ვერ დასრულდა — მოგვიანებით თავად ვცდი ხელახლა.',
    tooManyMessages: 'შეტყობინება ვერ მივიღე — ძალიან ბევრი ზედიზედ. ერთ წუთში ისევ სცადე.',
    goalPaused: 'პაუზაზეა',
    goalNewsPush: { title: 'Netai — დავალებაზე სიახლეა', body: 'დავალებაზე სიახლეა' },
  },
  en: {
    opening: '🔎 Starting — working out what we need...',
    heartbeat: '⏳ Still working — deep search takes a moment...',
    choicesOnly: 'Pick one:',
    emptyFinalFailure: 'The reply did not come together — try again, or rephrase the question.',
    runDied: 'Something went wrong on our side and the answer did not finish. Please try again.',
    serviceUnavailable:
      'The service is temporarily unavailable — that is on us, not on you. Trying again now will not help. When it is back, send it to me again and I will pick it straight up.',
    tookTooLong: 'The answer took too long to put together. Please try again.',
    restartedMidRun:
      'The server restarted and this answer was cut off partway — that is on us, not on you. Send it again and I will pick it straight back up.',
    moderationBlocked:
      'An internal check held this reply back — that is on us, not on your wording. Nothing was lost; say "again" and I will rewrite it.',
    nameNotVerified: '(name not verified on an official page)',
    goalPausedNoTokens:
      'I have paused work on this goal — the tokens have run out. I will carry on once it is topped up.',
    statusLines: {
      working: 'Working…',
      waiting: 'Waiting for a reply',
      needs_you: 'Needs your answer',
      needs_topup: 'Out of tokens — top up and send it again',
      failed: 'Hit a snag — try again',
      unavailable: 'Service temporarily unavailable',
    },
    askReminder:
      'A reminder: this question is still unanswered — if you have a minute, your answer would really help. If you do not know, tell me that too and I will stop bothering you.',
    askReminderPush: { title: 'Netai — reminder', body: 'A question is waiting for your answer.' },
    stepFailedWillRetry: 'That step could not be finished — I will try again myself later.',
    tooManyMessages: 'I could not take that message — too many at once. Try again in a minute.',
    goalPaused: 'Paused',
    goalNewsPush: { title: 'Netai — goal update', body: 'There is news on your goal' },
  },
  ru: {
    opening: '🔎 Начинаю — разбираюсь, что нужно...',
    heartbeat: '⏳ Всё ещё работаю — глубокий поиск занимает время...',
    choicesOnly: 'Выбери один вариант:',
    emptyFinalFailure: 'Ответ не сложился — попробуй ещё раз или переформулируй вопрос.',
    runDied:
      'На нашей стороне произошёл сбой, и ответ не завершился. Пожалуйста, попробуй ещё раз.',
    tookTooLong: 'Ответ готовился слишком долго. Пожалуйста, попробуй ещё раз.',
    restartedMidRun:
      'Сервер перезапустился, и этот ответ прервался на середине — это на нашей стороне, не на твоей. Отправь его ещё раз, и я сразу продолжу.',
    serviceUnavailable:
      'Сервис временно недоступен — это на нашей стороне, не на твоей. Повторять сейчас бесполезно. Когда он вернётся, отправь мне сообщение ещё раз, и я сразу его возьму.',
    moderationBlocked:
      'Внутренняя проверка остановила этот ответ — это наша сторона, не твоя формулировка. Ничего не потеряно; напиши «повтори», и я перепишу.',
    nameNotVerified: '(имя не подтверждено на официальной странице)',
    goalPausedNoTokens:
      'Я приостановил работу над этой целью — токены закончились. Продолжу после пополнения.',
    statusLines: {
      working: 'Работаю…',
      waiting: 'Жду ответа',
      needs_you: 'Нужен твой ответ',
      needs_topup: 'Токены закончились — пополни и отправь ещё раз',
      failed: 'Сбой — попробуй ещё раз',
      unavailable: 'Сервис временно недоступен',
    },
    askReminder:
      'Напоминание: на этот вопрос пока нет ответа — если найдётся минута, твой ответ очень поможет. Если не знаешь, тоже напиши, и я больше не побеспокою.',
    askReminderPush: { title: 'Netai — напоминание', body: 'Вопрос ждёт твоего ответа.' },
    stepFailedWillRetry: 'Шаг задачи не удалось завершить — позже попробую сам ещё раз.',
    tooManyMessages: 'Не смог принять сообщение — слишком много подряд. Попробуй через минуту.',
    goalPaused: 'На паузе',
    goalNewsPush: { title: 'Netai — новости по задаче', body: 'Есть новости по задаче' },
  },
  es: {
    opening: '🔎 Empiezo — viendo qué necesitamos...',
    heartbeat: '⏳ Sigo trabajando — la búsqueda profunda toma un momento...',
    choicesOnly: 'Elige una opción:',
    emptyFinalFailure: 'La respuesta no salió — inténtalo de nuevo o reformula la pregunta.',
    runDied:
      'Algo falló de nuestro lado y la respuesta no se completó. Inténtalo de nuevo, por favor.',
    tookTooLong: 'La respuesta tardó demasiado en prepararse. Inténtalo de nuevo, por favor.',
    restartedMidRun:
      'El servidor se reinició y esta respuesta se cortó a medias — es cosa nuestra, no tuya. Envíala otra vez y la retomo enseguida.',
    serviceUnavailable:
      'El servicio no está disponible ahora mismo — es cosa nuestra, no tuya. Reintentar ahora no ayudará. Cuando vuelva, envíamelo otra vez y lo retomo enseguida.',
    moderationBlocked:
      'Una revisión interna detuvo esta respuesta — es cosa nuestra, no de tu redacción. No se perdió nada; escribe «repite» y la reescribo.',
    nameNotVerified: '(nombre no verificado en una página oficial)',
    goalPausedNoTokens:
      'He pausado el trabajo en este objetivo: se acabaron los tokens. Continuaré tras la recarga.',
    statusLines: {
      working: 'Trabajando…',
      waiting: 'Esperando respuesta',
      needs_you: 'Necesita tu respuesta',
      needs_topup: 'Sin tokens — recarga y envíalo otra vez',
      failed: 'Algo falló — inténtalo de nuevo',
      unavailable: 'Servicio no disponible ahora',
    },
    askReminder:
      'Un recordatorio: esta pregunta sigue sin respuesta — si tienes un minuto, tu respuesta ayudaría mucho. Si no lo sabes, dímelo también y no te molesto más.',
    askReminderPush: { title: 'Netai — recordatorio', body: 'Una pregunta espera tu respuesta.' },
    stepFailedWillRetry: 'No se pudo terminar ese paso — lo intentaré yo mismo más tarde.',
    tooManyMessages: 'No pude recibir el mensaje — demasiados seguidos. Inténtalo en un minuto.',
    goalPaused: 'En pausa',
    goalNewsPush: { title: 'Netai — novedades', body: 'Hay novedades en tu objetivo' },
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
 * The goal is closed, and the person who ANSWERED is finally told so.
 *
 * The seat's reading, 22 September, from one goal closed at 10:32:58:
 *
 *   10:32:57  Netai Test 7, who NEVER ANSWERED, got „this question is no
 *             longer needed, no reply necessary. Thank you!" and went to done
 *   10:32:19  Netai Test 9, who DID answer, last heard anything at the moment
 *             he sent it. Nothing at the finish. Nothing since.
 *
 * „The person who ignored the question is thanked, and the person who actually
 * helped is not." That is their sentence and it is the right way to put it.
 *
 * ONE LINE, NOT TWO, AND THE MISSING HALF IS SAID OUT LOUD. They wrote two —
 * one for „your answer is what settled it" and one for „they got there another
 * way" — and were right that no single line can honestly carry both. But
 * NOTHING RECORDS WHICH IT WAS: `tasks` has no link from its result to an ask,
 * and `record_debrief_outcome` only asks three days later, after this has to
 * be said. So this is their wording with the one clause removed that neither
 * of us can support, rather than a guess dressed as either.
 *
 * It thanks them, it closes, and it asks nothing — which is the rest of what
 * they specified.
 */
export function askAnsweredAndGoalClosed(language: RunLanguage, asker: string): string {
  switch (language) {
    case 'en':
      return `${asker} has finished with this. Thank you for taking the time to answer.`;
    case 'ru':
      return `${asker} закрыл этот вопрос. Спасибо, что нашёл время ответить.`;
    case 'es':
      return `${asker} ya ha cerrado esto. Gracias por tomarte el tiempo de responder.`;
    default:
      return `${geoName(asker, 'erg')} ეს საკითხი დახურა. მადლობა, რომ დრო დაუთმე და გვიპასუხე.`;
  }
}

/**
 * The asker's question died because the person he asked switched questions
 * off — and until today nobody told him, ever.
 *
 * The seat asked whether he is ever told and would not report it until one of
 * us knew. Read from the live table: ask 3665 went to `cancelled` at 09:27:40
 * and account 171937's held updates that morning are two debriefs and two
 * search follow-ups, none of them about it. The 3-day debrief for that ask
 * WOULD have said „no answer for 3 days … keep waiting", which is false about
 * a withdrawn question — and it will not be said, because `debriefStillDue`
 * keeps a relayed-ask debrief only while the ask is still `sent`. So: silence,
 * correctly, and permanently.
 *
 * WHY THIS SAYS NOTHING ABOUT WHY, and that is the whole of it: the other
 * person's refusal to be contacted is theirs, and a line explaining it would
 * publish one person's choice to another. He is told his question is gone and
 * offered the only thing he can act on.
 *
 * The seat's wording, not mine — I said I would not invent it and they wrote
 * it. The Georgian, Russian and Spanish are mine from their English, which is
 * worth knowing before anybody treats the Georgian as reviewed.
 */
export function askWithdrawnAfterOptOut(language: RunLanguage, who: string): string {
  switch (language) {
    case 'en':
      return `I have withdrawn your question to ${who} — it will not be answered. Would you like me to ask somebody else?`;
    case 'ru':
      return `Я отозвал твой вопрос к ${who} — ответа не будет. Хочешь, спрошу кого-то другого?`;
    case 'es':
      return `He retirado tu pregunta a ${who}: no habrá respuesta. ¿Quieres que pregunte a otra persona?`;
    default:
      return `${geoName(who, 'gen')}თვის გაგზავნილი შენი კითხვა გავაუქმე — პასუხი აღარ მოვა. გინდა სხვას ვკითხო?`;
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

/**
 * „New conversation" — the placeholder title a thread is born with, replaced
 * by a real one as soon as the first message arrives.
 *
 * It was one Georgian constant, so an English account's new chat appeared in
 * its own sidebar as „ახალი საუბარი". The seat's fifth locale sighting and the
 * fourth that is the server's: a thread cannot be born titleless (a null title
 * rendered as a row with no rename or delete control at all — an unremovable
 * ghost) so every account gets this word, and until now every account got it
 * in Georgian.
 */
export const NEW_THREAD_TITLE: Readonly<Record<RunLanguage, string>> = {
  ka: 'ახალი საუბარი',
  en: 'New conversation',
  ru: 'Новый разговор',
  es: 'Nueva conversación',
};

/**
 * Is this title still the placeholder, in ANY language?
 *
 * Asked by the route that decides whether a thread still needs a provisional
 * title. It has to accept all four, and the Georgian one doubles as the value
 * every thread created before this existed carries.
 */
export function isPlaceholderThreadTitle(title: string | null): boolean {
  return title !== null && Object.values(NEW_THREAD_TITLE).includes(title);
}

/**
 * What the owner is told when the wallet refuses the run that their words
 * were about — said in the thread, under the words themselves.
 *
 * Ticket 20 row 217, and it is the completion of Lika's P0 of 18 September.
 * That fix stopped the refusal throwing her sentence away; `keepUserMessage`
 * stores it and it renders. What nobody built is anything that ever comes back
 * for it.
 *
 * Goal 6271, thread 18811. „go ahead", eight characters, stored 18:18:01 while
 * the balance was negative. The top-up landed at 21:04. Six hours later the
 * owner asked „are you still there?" and was told „I'm just waiting on your
 * go-ahead" — with the go-ahead sitting in that same conversation, visible on
 * the screen of the person being told it had not arrived.
 *
 * The thread's badge said „top up and I will carry on". It did not carry on,
 * and it could not: nothing re-reads a kept message once there is money. So
 * the badge was a promise and this line is the truth beside it — the words are
 * kept, and they have to be sent again.
 *
 * WHAT THIS DELIBERATELY IS NOT is a fix for the underlying gap. Re-running
 * somebody's message hours later, unasked, could send real messages to real
 * people on a decision they have had all night to change their mind about.
 * That is a product decision and not one to take inside a 402 handler.
 *
 * ⚠️ ROW 270(b), 25 September — „KEPT" WAS HEARD AS „QUEUED".
 *
 * The tester, Test 7 thread 24852: „„I have kept what you wrote" and „send it
 * again" contradict." They are both true and that is exactly the problem —
 * „kept" meant „your words are still on the screen", and a person reads it as
 * „it is in hand, it will run". Then nothing runs, and the next sentence
 * asking them to resend reads as the software forgetting what it just said it
 * had.
 *
 * So the line now says which of the two it means, and says the part that was
 * only ever implied: NOTHING IS QUEUED AND NOTHING HAPPENS ON ITS OWN. Same
 * fact, no promise inside it.
 *
 * AND WHAT IS STILL NOT SAID, ON PURPOSE: the weekly refill. Row 270(a) asks
 * for „it will carry on at Monday's refill", and I will not write that until
 * it is true. `waiting_topup` is DERIVED at read time from the balance — it is
 * not a stored state and nothing wakes the goal when the balance rises. The
 * tester is testing exactly that on 28 September. Writing the sentence first
 * would repeat row 221's own fault: a badge promising something the code
 * underneath it does not do.
 */
export function messageHeldNoTokens(language: RunLanguage): string {
  switch (language) {
    case 'en':
      return (
        'Your message is still here in the conversation, but I have not started on it — the ' +
        'tokens ran out. Nothing is queued and nothing will happen on its own: once they are ' +
        'topped up, send it again and I will start then.'
      );
    case 'ru':
      return (
        'Твоё сообщение осталось здесь, в переписке, но я к нему не приступил — закончились ' +
        'токены. Ничего не стоит в очереди и само по себе не начнётся: после пополнения ' +
        'отправь ещё раз, и тогда я начну.'
      );
    case 'es':
      return (
        'Tu mensaje sigue aquí en la conversación, pero no he empezado con él: se acabaron los ' +
        'tokens. No hay nada en cola y nada ocurrirá por sí solo; cuando recargues, envíalo ' +
        'otra vez y entonces empiezo.'
      );
    default:
      return (
        'შენი შეტყობინება აქვე რჩება, მაგრამ საქმე არ დამიწყია — ტოკენები ამოიწურა. რიგში ' +
        'არაფერია და თავისით არაფერი მოხდება: შევსების შემდეგ ხელახლა გამომიგზავნე და მაშინ ' +
        'დავიწყებ.'
      );
  }
}
