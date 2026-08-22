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

interface RunStrings {
  opening: string;
  heartbeat: string;
  choicesOnly: string;
  emptyFinalFailure: string;
  moderationBlocked: string;
  statusLines: { working: string; waiting: string; needs_you: string; failed: string };
}

export const RUN_STRINGS: Readonly<Record<RunLanguage, RunStrings>> = {
  ka: {
    opening: '🔎 ვიწყებ — ვარკვევ, რა გვჭირდება...',
    heartbeat: '⏳ ისევ ვმუშაობ — ღრმა ძებნა დროს მოითხოვს...',
    choicesOnly: 'აირჩიე ერთ-ერთი:',
    emptyFinalFailure: 'პასუხი ვერ ჩამოყალიბდა — სცადე თავიდან, ან სხვანაირად დასვი კითხვა.',
    moderationBlocked:
      'პასუხის ტექსტი შიდა შემოწმებამ შეაჩერა — ეს ჩვენი მხრიდანაა და შენი ფორმულირების ბრალი არ არის. შესრულებული სამუშაო არ დაკარგულა; მომწერე „გაიმეორე" და თავიდან ჩამოგიყალიბებ.',
    statusLines: {
      working: 'ვმუშაობ…',
      waiting: 'ველოდები პასუხს',
      needs_you: 'შენი პასუხი სჭირდება',
      failed: 'შეფერხდა — სცადე თავიდან',
    },
  },
  en: {
    opening: '🔎 Starting — working out what we need...',
    heartbeat: '⏳ Still working — deep search takes a moment...',
    choicesOnly: 'Pick one:',
    emptyFinalFailure: 'The reply did not come together — try again, or rephrase the question.',
    moderationBlocked:
      'An internal check held this reply back — that is on us, not on your wording. Nothing was lost; say "again" and I will rewrite it.',
    statusLines: {
      working: 'Working…',
      waiting: 'Waiting for a reply',
      needs_you: 'Needs your answer',
      failed: 'Hit a snag — try again',
    },
  },
  ru: {
    opening: '🔎 Начинаю — разбираюсь, что нужно...',
    heartbeat: '⏳ Всё ещё работаю — глубокий поиск занимает время...',
    choicesOnly: 'Выбери один вариант:',
    emptyFinalFailure: 'Ответ не сложился — попробуй ещё раз или переформулируй вопрос.',
    moderationBlocked:
      'Внутренняя проверка остановила этот ответ — это наша сторона, не твоя формулировка. Ничего не потеряно; напиши «повтори», и я перепишу.',
    statusLines: {
      working: 'Работаю…',
      waiting: 'Жду ответа',
      needs_you: 'Нужен твой ответ',
      failed: 'Сбой — попробуй ещё раз',
    },
  },
  es: {
    opening: '🔎 Empiezo — viendo qué necesitamos...',
    heartbeat: '⏳ Sigo trabajando — la búsqueda profunda toma un momento...',
    choicesOnly: 'Elige una opción:',
    emptyFinalFailure: 'La respuesta no salió — inténtalo de nuevo o reformula la pregunta.',
    moderationBlocked:
      'Una revisión interna detuvo esta respuesta — es cosa nuestra, no de tu redacción. No se perdió nada; escribe «repite» y la reescribo.',
    statusLines: {
      working: 'Trabajando…',
      waiting: 'Esperando respuesta',
      needs_you: 'Necesita tu respuesta',
      failed: 'Algo falló — inténtalo de nuevo',
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
