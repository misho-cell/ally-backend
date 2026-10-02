import { RunLanguage } from './runLanguage';

/**
 * The engine's own event texts, in the language of the conversation they land
 * in.
 *
 * Their own file because they are data with one job, and because they could not
 * be tested where they were: taskEngine.service pulls in processChat and half
 * the product, and a table of strings should not need any of it to be read
 * back.
 */

/**
 * The engine's events are stored with role „user", so to the model they ARE the
 * owner's words — and they were Georgian in every language.
 *
 * The seat's read, 18 September, three threads, each line one stored message
 * with Georgian characters against Latin:
 *
 *   thread 17563  „I need a good tailor in Tbilisi for a suit."
 *     0  user       0 geo /  33 lat
 *     1  assistant  0 geo / 109 lat
 *     2  assistant  0 geo / 165 lat
 *     3  user EVENT 514 geo / 44 lat   <- this file, in Georgian
 *     4  assistant  250 geo / 125 lat  <- the plan card, now Georgian
 *
 * Three clean English messages, one Georgian event, and the assistant switches.
 * It is obeying the rule it was given: answer in the language the user typed.
 * The last thing the „user" typed was five hundred characters of Georgian that
 * we wrote. Two of their three threads went wrong on exactly the message after
 * an event; the third, where no event fired, stayed clean throughout — which
 * also explains why the fault looked intermittent all day, and why it was never
 * the same component twice.
 *
 * So these follow the conversation, like every other fixed string. Translated
 * clause for clause rather than paraphrased, because two of the clauses are
 * load-bearing: D119 (an approved plan IS the consent to write to the people in
 * it) and the „write to nobody" rule, whose wording was already fought over on
 * 16 September when three goals had their first plan name people the owner had
 * asked us not to contact.
 */
export const DAY_ONE_EVENT: Readonly<Record<RunLanguage, string>> = {
  ka:
    'გეგმა ახლახან დამტკიცდა — დღე პირველია. სტანდარტის პირველი წესი: ყველაფერი დღესვე. ' +
    'გეგმის „ვის ვკითხავ" სიიდან მისწერე პირველ 3–5 ადამიანს ერთდროულად — ცალკე თანხმობა არ ' +
    'სჭირდება და ტექსტების ჩვენება-დადასტურებაც არა: გეგმა დამტკიცებულია და ეს თანხმობაა (D119). ' +
    'გაუშვი ვებ-ძებნა და ქსელის ძებნა გეგმის გზებით, და set_task_wake-ით დანიშნე შემდეგი ' +
    'შემოწმება. ბოლოს ერთი სტრიქონი: ვის ვკითხე და შემდეგ ზუსტად ეს — „როგორც კი ვინმე ' +
    'გიპასუხებს, მაშინვე გეტყვი." საათები და დღეები არ ახსენო (D563).',
  en:
    'The plan has just been approved — this is day one. The first rule of the standard: everything ' +
    'today. From the plan’s "who I will ask" list, write to the first 3–5 people at once — no ' +
    'separate consent is needed, and no showing the texts for confirmation either: the plan is ' +
    'approved and that IS the consent (D119). Run the web search and the network search along the ' +
    'plan’s paths, and set the next check with set_task_wake. End with one line: whom I asked, then ' +
    'exactly „As soon as anyone answers, I will tell you." Never name hours or days (D563).',
  ru:
    'План только что утверждён — это первый день. Первое правило стандарта: всё сегодня. Из списка ' +
    '«кого спрошу» напиши первым 3–5 людям сразу — отдельное согласие не нужно, и показывать ' +
    'тексты на подтверждение тоже не нужно: план утверждён, и это и есть согласие (D119). Запусти ' +
    'веб-поиск и поиск по сети путями плана и назначь следующую проверку через set_task_wake. В ' +
    'конце одна строка: кого спросил, и затем ровно «Как только кто-то ответит, сразу скажу.» ' +
    'Не называй часы и дни (D563).',
  es:
    'El plan acaba de ser aprobado — es el día uno. La primera regla del estándar: todo hoy. De la ' +
    'lista «a quién preguntaré» del plan, escribe a las primeras 3–5 personas a la vez — no hace ' +
    'falta un consentimiento aparte, ni mostrar los textos para confirmarlos: el plan está ' +
    'aprobado y eso ES el consentimiento (D119). Lanza la búsqueda web y la búsqueda en la red por ' +
    'los caminos del plan, y fija la siguiente revisión con set_task_wake. Termina con una línea: ' +
    'a quién pregunté y luego exactamente «En cuanto alguien responda, te lo diré.» Nunca ' +
    'menciones horas ni días (D563).',
};

/**
 * Ticket 20 row 210 — the answer to an introduction, walked back to the goal
 * it was asked for.
 *
 * The seat's run of 18 September. Salome asked at 13:35 to be introduced to
 * Ninia; Lika agreed at 13:41; Salome's goal said nothing until she typed
 * „arapheria akhali?" at 14:06:46 and was told at 14:07:09. Twenty-six minutes
 * with the answer sitting in the system, and it only moved because she poked
 * it. Their sentence, which is the one worth keeping: „good news does not walk
 * to the person waiting for it, and that generalises."
 *
 * A FUNCTION rather than a table, because this event has to name a person and
 * say which way the answer went. Everything else about it follows the same
 * rule as its two neighbours: the conversation's language, clause for clause.
 *
 * NO NUMBER EVER TRAVELS IN HERE (D149). Where a contact was handed over, the
 * requester's request thread already carries it; this event says only that
 * there is one, and the run reads it from the thread rather than from us.
 */
/**
 * WHETHER THE NUMBER MOVED IS A FACT THE SERVER HOLDS, AND THIS EVENT USED TO
 * ASK THE MODEL TO GUESS IT.
 *
 * It said: „if the contact has already been handed over, remind them they can
 * write themselves now; IF NOT, say whom to get it from" — a fork, with
 * nothing to decide it on. Request 1123, 20 September, is what that costs.
 * Three people, one introduction, forty-one seconds:
 *
 *   to the MEDIATOR  „I passed Netai Test 4's contact to Netai Test 1"
 *   to the TARGET    „your number was passed from Netai Test 2's phonebook"
 *   to the ASKER     „they chose to keep it through themselves rather than
 *                     handing over contact details directly"
 *
 * The first two are the server's own templates and they are right. The third
 * is the model filling this fork in, and it filled it in backwards — so the
 * person whose number moved was told it moved, and the person who received it
 * was told it had not. One of them acts on a false belief about where a phone
 * number is.
 *
 * So the fact is stated rather than offered. `contact` comes from the same
 * branch that decides what the other two are told, which is the only way three
 * accounts of one event can be made to agree.
 */
/**
 * What became of the contact — THREE states, because two of them produce the
 * same silence and mean opposite things.
 *
 * ⚠️ ROW 309 — IT WAS A BOOLEAN, AND THE MISSING THIRD STATE PUT A DECISION
 * THE FOUNDER NEVER MADE INTO HIS MOUTH. 29 September: he accepted Giorgi's
 * introduction and chose `direct`. The contact lookup then read a stale row and
 * came back empty, so `contactHandedOver` was false — and false had only one
 * sentence attached to it, „the mediator chose to keep the connection going
 * through them". Giorgi was told the opposite of what the founder chose, and
 * the founder was told his own contact was not in his phonebook.
 *
 * „No number moved" is not a decision. Whether it was a choice or a failure is
 * exactly the thing the reader needs, and a boolean cannot carry it.
 */
export type IntroContactOutcome =
  /** The mediator chose direct and the contact was resolved: the number moved. */
  | 'handed_over'
  /** The mediator chose to stay in the middle. No number moved, and that is the point. */
  | 'kept_by_mediator'
  /** The mediator chose direct and we could not resolve the contact. Ours to fix, not theirs. */
  | 'not_found';

/**
 * ⚠️ THE TESTER'S 992 (F2): the MEDIATOR tapped „connect directly", and the
 * asker was told „<target> agreed". The target had answered nothing. The event
 * said „the introduction to <target> has been agreed", which does not say BY
 * WHOM, and the model filled in the wrong person. On a mediated request the
 * event now opens with who answered, and that the target has not.
 */
function mediatorAnswered(
  mediatorName: string,
  targetName: string,
  accepted: boolean,
): Readonly<Record<RunLanguage, string>> {
  return accepted
    ? {
        ka:
          `შუამავალი ${mediatorName} დათანხმდა ${targetName}-თან გაცნობას; ${targetName}-ს ` +
          `ჯერ არაფერი უპასუხია. ნუ იტყვი, რომ ${targetName} დათანხმდა. `,
        en:
          `The mediator, ${mediatorName}, agreed to the introduction to ${targetName}; ` +
          `${targetName} has not answered anything. Never say ${targetName} agreed. `,
        ru:
          `Посредник ${mediatorName} согласился на знакомство с ${targetName}; ${targetName} ` +
          `пока ничего не ответил. Не говори, что ${targetName} согласился. `,
        es:
          `El intermediario, ${mediatorName}, aceptó la presentación a ${targetName}; ` +
          `${targetName} no ha respondido nada. Nunca digas que ${targetName} aceptó. `,
      }
    : {
        ka: `შუამავალმა ${mediatorName} უარი თქვა ${targetName}-თან გაცნობაზე. `,
        en: `The mediator, ${mediatorName}, declined the introduction to ${targetName}. `,
        ru: `Посредник ${mediatorName} отказался от знакомства с ${targetName}. `,
        es: `El intermediario, ${mediatorName}, rechazó la presentación a ${targetName}. `,
      };
}

/** The outcome event, opened with who answered when a mediator did (F2). */
export function introOutcomeEvent(
  targetName: string,
  accepted: boolean,
  contact: IntroContactOutcome = 'kept_by_mediator',
  mediatorName: string | null = null,
): Readonly<Record<RunLanguage, string>> {
  const event = introOutcomeBody(targetName, accepted, contact);
  if (mediatorName === null) return event;
  const who = mediatorAnswered(mediatorName, targetName, accepted);
  return {
    ka: who.ka + event.ka,
    en: who.en + event.en,
    ru: who.ru + event.ru,
    es: who.es + event.es,
  };
}

function introOutcomeBody(
  targetName: string,
  accepted: boolean,
  contact: IntroContactOutcome,
): Readonly<Record<RunLanguage, string>> {
  /**
   * ROW 251 / D438 — THIS SENTENCE WAS THE FIRST CAUSE, AND I WROTE IT.
   *
   * It used to say „remind them they can write themselves now", and the tester
   * found two threads (22518, 22476) where the assistant did exactly that —
   * „this is one for you to send yourself rather than through me" — and NOTHING
   * WAS EVER SENT. The founder's rule is the opposite: after the yes, the two
   * assistants carry it, and nobody is pushed off the product to finish their
   * own introduction.
   *
   * AND IT IS CHANGED ONLY NOW, WITH THE CHANNEL, NOT BEFORE IT. Saying „write
   * to them through Netai" while `planAllows` still refused the target would
   * have been the product promising a channel it then fails to provide — row
   * 247's fault exactly, and the one the founder minds most. The gate went in
   * first; this follows it.
   *
   * The OTHER branch is untouched. When the mediator kept the connection, no
   * number was handed over and the owner must not be told they have one.
   *
   * ⚠️ AND THE THIRD BRANCH SAYS WHOSE FAULT IT IS. „Not found" must never
   * borrow „kept_by_mediator"'s sentence: one is a person's decision and the
   * other is our lookup failing, and reporting ours as theirs is what row 309
   * is. It also tells the model NOT to send the owner back to the mediator —
   * the mediator already said yes, and being asked again for something they
   * already granted is how a yes gets worn out.
   */
  const byLanguage: Readonly<Record<RunLanguage, Readonly<Record<IntroContactOutcome, string>>>> = {
    ka: {
      handed_over:
        `${targetName}-თან პირდაპირი არხი გახსნილია — ახლა შეგიძლია მას პირდაპირ მისწერო ` +
        'Netai-ით, შუამავლის გარეშე. დაწერე რისი თქმა უნდა და მე გადავცემ.',
      kept_by_mediator:
        `კონტაქტი არავის გადმოუციათ — შუამავალმა აირჩია, რომ კავშირი მის გავლით გაგრძელდეს. ` +
        'ნუ ეტყვი, რომ ნომერი აქვს.',
      not_found:
        'შუამავალი დათანხმდა პირდაპირ დაკავშირებაზე, მაგრამ კონტაქტი ჯერ არ გადმოსულა. ' +
        'უთხარი მფლობელს მხოლოდ ის, რომ შუამავალი დათანხმდა და კავშირი მის გავლით გაგრძელდება. ' +
        'ხარვეზი, შესწორება ან სისტემის შიდა საქმე არ ახსენო. ნუ ეტყვი, რომ ნომერი აქვს, და ' +
        'ნუ გაგზავნი შუამავალთან თავიდან სათხოვნელად.',
    },
    en: {
      handed_over:
        `The direct channel to ${targetName} is open — you may now write to them directly ` +
        'through Netai, with the mediator out of the loop. Tell me what to say and I will carry it.',
      kept_by_mediator:
        'NO contact was handed over — the mediator chose to keep the connection going through ' +
        'them. Do NOT tell the owner they have the number.',
      not_found:
        'The mediator agreed to connect them DIRECTLY, but the contact has not come through. ' +
        'Tell the owner only that the mediator agreed and the connection continues through ' +
        'them. Never mention a fault, a fix or anything internal. Do NOT tell the owner they ' +
        'have the number, and do NOT send them back to the mediator to ask again.',
    },
    ru: {
      handed_over:
        `Прямой канал к ${targetName} открыт — теперь можно написать напрямую через Netai, ` +
        'без посредника. Скажи, что передать, и я передам.',
      kept_by_mediator:
        'Контакт НИКОМУ не передан — посредник решил, что связь идёт через него. Не говори, ' +
        'что номер у него есть.',
      not_found:
        'Посредник согласился связать их НАПРЯМУЮ, но контакт пока не дошёл. Скажи владельцу ' +
        'только то, что посредник согласился и связь идёт через него. Не упоминай ошибки, ' +
        'исправления или что-либо внутреннее. Не говори, что номер у него есть, и не отправляй ' +
        'его просить посредника снова.',
    },
    es: {
      handed_over:
        `El canal directo con ${targetName} está abierto — ya puedes escribirle directamente ` +
        'por Netai, sin el intermediario. Dime qué decir y yo lo llevo.',
      kept_by_mediator:
        'NO se ha entregado ningún contacto — el intermediario ha decidido que todo pase por ' +
        'él. No le digas al propietario que tiene el número.',
      not_found:
        'El intermediario aceptó conectarlos DIRECTAMENTE, pero el contacto aún no ha llegado. ' +
        'Dile al propietario solo que el intermediario aceptó y que la conexión sigue a través ' +
        'de él. No menciones fallos, arreglos ni nada interno. No le digas que tiene el número, ' +
        'ni le mandes a pedírselo otra vez al intermediario.',
    },
  };
  /**
   * ⚠️ AN UNKNOWN STATE FALLS BACK; IT DOES NOT RENDER `undefined`.
   *
   * This map is indexed by a value, where the boolean it replaced was indexed
   * by a branch — so a value outside the three now reaches a template instead
   * of simply being falsy. Caught while fixing the callers: a stale `true`
   * from a test produced „…es sí. undefined Luego comprueba…", a literal
   * „undefined" in a sentence a person reads. Test files are excluded from
   * `tsconfig`, so the compiler cannot be the only guard here.
   *
   * The fallback is `kept_by_mediator` because it is the one branch that
   * promises the owner nothing and sends them nowhere: wrong but harmless,
   * where „handed_over" would tell somebody they have a number they do not.
   */
  const state: IntroContactOutcome = contact in byLanguage.en ? contact : 'kept_by_mediator';
  // One state chosen once, then read per language — so the four sentences can
  // never drift onto different branches of the same fact.
  const handover: Readonly<Record<RunLanguage, string>> = {
    ka: byLanguage.ka[state],
    en: byLanguage.en[state],
    ru: byLanguage.ru[state],
    es: byLanguage.es[state],
  };
  // ⚠️ ROW 315, THE ACCEPTANCE HALF (seat's 855, 30 Sep): this used to end
  // „then check whether this solves the goal", and the model did exactly that —
  // „მოგვარებულად ითვლება?" with no contact passed and nobody having spoken.
  // The answer events stopped it in 0799665; this is the same rule here.
  return accepted
    ? {
        ka:
          `${targetName}-თან გაცნობაზე დადებითი პასუხი მოვიდა. უთხარი მფლობელს ერთი წინადადებით, ` +
          `ვინ დათანხმდა. ${handover.ka} ` +
          'ახლა ნუ ჰკითხავ, მოგვარდა თუ არა — მიზანი მოგვარებულია მხოლოდ მაშინ, როცა ისინი ' +
          'ნამდვილად დაუკავშირდნენ ერთმანეთს ან კონტაქტი გამოიყენეს. set_task_wake 24 საათზე ' +
          'დააყენე, რომ მაშინ შეამოწმო, ისაუბრეს თუ არა.',
        en:
          `The introduction to ${targetName} got a yes. Tell the owner in one sentence who said ` +
          `yes. ${handover.en} ` +
          'Do NOT ask whether the goal is solved yet — it is solved only once the two have ' +
          'actually spoken or the contact has been used. Set set_task_wake for 24 hours to check ' +
          'then whether they spoke.',
        ru:
          `На знакомство с ${targetName} получено согласие. Скажи владельцу одним предложением, ` +
          `что ответ положительный. ${handover.ru} ` +
          'НЕ спрашивай пока, решена ли цель — она решена, только когда они действительно ' +
          'поговорили или контакт использован. Поставь set_task_wake на 24 часа, чтобы тогда ' +
          'проверить, поговорили ли они.',
        es:
          `La presentación a ${targetName} ha sido aceptada. Dile al propietario en una frase que ` +
          `la respuesta es sí. ${handover.es} ` +
          'NO preguntes todavía si la meta está resuelta: lo está solo cuando los dos hayan ' +
          'hablado de verdad o se haya usado el contacto. Pon set_task_wake a 24 horas para ' +
          'comprobar entonces si hablaron.',
      }
    : {
        ka:
          `${targetName}-თან გაცნობაზე უარი მოვიდა. უთხარი მფლობელს მშვიდად, ერთი წინადადებით, ` +
          'და ნუ გაიმეორებ იმავე თხოვნას. ეს გზა დაიხურა — გეგმის სხვა გზით განაგრძე ან ' +
          'შესთავაზე ახალი შუამავალი.',
        en:
          `The introduction to ${targetName} was declined. Tell the owner plainly, in one ` +
          'sentence, and do not repeat the same request. That route is closed — carry on down ' +
          'another of the plan’s routes, or offer a different go-between.',
        ru:
          `На знакомство с ${targetName} получен отказ. Скажи владельцу спокойно, одним ` +
          'предложением, и не повторяй ту же просьбу. Этот путь закрыт — продолжай другим путём ' +
          'плана или предложи другого посредника.',
        es:
          `La presentación a ${targetName} fue rechazada. Díselo al propietario con calma, en una ` +
          'frase, y no repitas la misma petición. Esa vía está cerrada — sigue por otra vía del ' +
          'plan u ofrece otro intermediario.',
      };
}

/**
 * Same reason as DAY_ONE_EVENT above — and this is the 514-character one the
 * seat caught switching thread 17563 into Georgian.
 *
 * The buttons it names were „დამტკიცებულია" and „შევცვალოთ". The first is the
 * OLD approve label, replaced by „ვამტკიცებ" — so this text has been telling
 * the model to offer a wording the product no longer uses, which is exactly how
 * unrecognised labels get onto plan cards. Each language now names its own
 * current pair.
 */
/**
 * ROW 104 — A GOAL THAT IS AN INSTRUCTION GETS THIS INSTEAD OF THE PLAN EVENT.
 *
 * The first version of the row 104 fix simply SUPPRESSED the plan wake for such
 * a goal, and the tester's run showed what silence buys: „Tell Netai Test 9 I
 * can do Thursday" produced no plan card and no message either — the model
 * asked „I do not see any open goal about a meeting or a date. Could you tell
 * me what this is about?" Instruction → question → plan → one more yes. No
 * better for the owner than before.
 *
 * That is the same lesson as the card refusal an hour earlier: A REFUSAL THAT
 * ONLY REFUSES LEAVES THE MODEL TO INVENT THE NEXT MOVE. Taking the plan away
 * without saying what to do instead is a refusal.
 *
 * D316, the founder, 19 September: a typed instruction naming one person and
 * one action IS the yes. It goes, with one line afterwards saying who it went
 * to. So the words to relay are the OWNER'S OWN — „Thursday works for me" needs
 * no context from us, and asking what it is about is asking the owner to
 * explain a sentence they have already finished writing.
 */
export const INSTRUCTION_EVENT: Readonly<Record<RunLanguage, string>> = {
  ka:
    'ეს მიზანი თავად არის ინსტრუქცია: მფლობელმა დაასახელა ერთი ადამიანი და ერთი მოქმედება. ' +
    'მისი სიტყვები თავად არის თანხმობა (D316) — გეგმა არ შეადგინო, ღილაკები არ აჩვენო და ' +
    'ხელახლა ნუ ჰკითხავ. გადაეცი ის, რაც მფლობელმა თქვა, მისივე სიტყვებით. თუ არ იცი რას ' +
    'ნიშნავს მისი ნათქვამი — არ გჭირდება: გადაეცი როგორც არის. მერე ერთი წინადადება: ვის ' +
    'მიუვიდა. მხოლოდ მაშინ იკითხე, თუ ვერ ხვდები ვის უნდა მისწერო.',
  en:
    'This goal IS an instruction: the owner named one person and one action. Their words are ' +
    'themselves the consent (D316) — do not draw up a plan, do not show buttons, and do not ask ' +
    'again. Pass on what the owner said, in their own words. If you do not know what they meant ' +
    'by it, you do not need to: relay it as it stands. Then one sentence saying who it went to. ' +
    'Ask only if you cannot tell WHICH person they meant.',
  ru:
    'Эта цель САМА является поручением: владелец назвал одного человека и одно действие. Его ' +
    'слова и есть согласие (D316) — не составляй план, не показывай кнопки и не переспрашивай. ' +
    'Передай то, что он сказал, его же словами. Если не понимаешь, что он имел в виду, это и не ' +
    'нужно: передай как есть. Потом одно предложение — кому ушло. Спрашивай только если не ' +
    'понимаешь, КОГО он имел в виду.',
  es:
    'Esta meta ES una instrucción: el propietario nombró a una persona y una acción. Sus palabras ' +
    'son el consentimiento (D316) — no hagas un plan, no muestres botones y no vuelvas a ' +
    'preguntar. Transmite lo que dijo, con sus propias palabras. Si no sabes qué quiso decir, no ' +
    'hace falta: pásalo tal cual. Luego una frase diciendo a quién le llegó. Pregunta sólo si no ' +
    'sabes A QUIÉN se refería.',
};

/**
 * ⚠️ ROW 287 — SEARCHES WERE BEING OFFERED FOR APPROVAL.
 *
 * The plan asked the owner's yes for „your contacts" and „the second circle",
 * because this event said „start nothing until the plan is approved" — and a
 * search is something. The founder's order is the other way round: every
 * search runs by itself BEFORE the plan, and the yes is asked only for what
 * goes out to people.
 */
export const PLAN_PROPOSAL_EVENT: Readonly<Record<RunLanguage, string>> = {
  ka:
    'მიზანი ახლახან შეინახა და გეგმა ჯერ არ არსებობს. ჯერ მოძებნე — მფლობელის კონტაქტები, მეორე ' +
    'წრე, ვები — ახლავე, თანხმობის გარეშე: ძებნა არავის სწერს და დასტურს არ საჭიროებს. მერე ' +
    'შეადგინე გეგმა ნაპოვნით და დადე propose_task_plan-ით: ' +
    'ვინ წყვეტს ამას (რამდენიმე თუა — ყველა), რომელი გზებით მივალთ (მფლობელის ქსელი, მეორე წრე, ვები), ' +
    'ვის ვკითხავთ სახელებით, დასრულების ნიშანი. მერე მოკლედ აჩვენე მფლობელს და სთხოვე დასტური — ' +
    'ბოლოს present_choices-ით ორი ღილაკი: „ვამტკიცებ" და „შევცვალოთ". ' +
    'დასტური მხოლოდ იმაზეა, რაც გადის: ვის მივწერთ, ვის გავაცნობთ, ვის მოვიწვევთ — ძებნა მას ' +
    'არ სთხოვო. არავის არ მისწერო, სანამ გეგმა არ დამტკიცდება. ' +
    'თუ მფლობელმა თავად თქვა, რომ არავის არ მივწეროთ („არავის არ მისწერო", „მე თვითონ ' +
    'მივწერ/დავურეკ") — people_to_involve ცარიელი რჩება პირველივე გეგმაში. ნაპოვნი ადამიანები ' +
    'მხოლოდ შეტყობინებაში ჩამოთვალე, როგორც ლიდები მისთვის. „ვის ვკითხავთ" ამ შემთხვევაში ' +
    'ნიშნავს „არავის".',
  en:
    'A goal has just been saved and there is no plan yet. SEARCH FIRST — the owner’s contacts, ' +
    'the second circle, the web — now, with no approval: searching writes to nobody and needs no ' +
    'yes. Then draw up the plan from what you found and submit it with ' +
    'propose_task_plan: who decides this (if several — all of them), which paths we take (the ' +
    'owner’s network, the second circle, the web), whom we will ask by name, and the sign that it ' +
    'is done. Then show the owner briefly and ask for confirmation — end with present_choices and ' +
    'two buttons: "I approve" and "Change it". The yes is ONLY for what goes out — whom we write ' +
    'to, introduce or invite; never offer a search for approval. Write to nobody until the plan ' +
    'is approved. If the owner said themselves that we are to write to nobody ("do not contact ' +
    'anyone", "I will call them myself") — people_to_involve stays empty in the very first plan. ' +
    'List the people you found in your message only, as leads for them. "Whom we will ask" means ' +
    '"nobody" in that case.',
  ru:
    'Цель только что сохранена, плана ещё нет. СНАЧАЛА ИЩИ — контакты владельца, второй круг, ' +
    'веб — сейчас, без согласия: поиск никому не пишет и подтверждения не требует. Потом составь ' +
    'план из найденного и отправь его через propose_task_plan: ' +
    'кто это решает (если несколько — все), какими путями идём (сеть владельца, второй круг, веб), ' +
    'кого спросим поимённо, признак завершения. Затем коротко покажи владельцу и попроси ' +
    'подтверждение — в конце present_choices с двумя кнопками: «Подтверждаю» и «Изменить». ' +
    'Подтверждение нужно ТОЛЬКО для того, что уходит наружу — кому пишем, кого знакомим, кого ' +
    'приглашаем; поиск на подтверждение не предлагай. Никому не пиши, пока план не утверждён. Если владелец сам сказал никому не ' +
    'писать («никому не пиши», «я сам напишу/позвоню») — people_to_involve остаётся пустым в самом ' +
    'первом плане. Найденных людей перечисли только в сообщении, как зацепки для него. «Кого ' +
    'спросим» в этом случае значит «никого».',
  es:
    'Se acaba de guardar una meta y todavía no hay plan. BUSCA PRIMERO — los contactos del ' +
    'propietario, el segundo círculo, la web — ahora, sin aprobación: buscar no escribe a nadie ' +
    'ni necesita un sí. Luego redacta el plan con lo encontrado y envíalo con ' +
    'propose_task_plan: quién decide esto (si son varios — todos), por qué caminos vamos (la red ' +
    'del propietario, el segundo círculo, la web), a quién preguntaremos por nombre, y la señal de ' +
    'que está resuelto. Luego muéstraselo brevemente al propietario y pide confirmación — termina ' +
    'con present_choices y dos botones: «Lo apruebo» y «Cambiarlo». El sí es SOLO para lo que ' +
    'sale — a quién escribimos, presentamos o invitamos; nunca ofrezcas una búsqueda para ' +
    'aprobar. No escribas a nadie hasta que el plan esté aprobado. Si el propietario dijo él mismo que no ' +
    'escribamos a nadie («no contactes a nadie», «yo mismo les escribo/llamo») — people_to_involve ' +
    'queda vacío en el primer plan. Enumera a las personas encontradas solo en tu mensaje, como ' +
    'pistas para él. «A quién preguntaremos» significa «a nadie» en ese caso.',
};

/**
 * The tester's 1044, thread 30726 (2 October): the owner's own run searched,
 * answered with what it found (14:34:43), and proposed no plan; the plan wake
 * fired ten seconds later, searched everything again, and wrote a second full
 * reply of the same findings (14:35:51). The owner read the answer twice.
 *
 * When the goal's thread has already been searched and answered, the plan
 * turn gets THIS text instead: the findings are on the screen, so it builds
 * the plan from them and says only the plan. The rules on what needs a yes are
 * the same as PLAN_PROPOSAL_EVENT's.
 */
export const PLAN_FROM_FINDINGS_EVENT: Readonly<Record<RunLanguage, string>> = {
  ka:
    'მიზანი ახლახან შეინახა, გეგმა ჯერ არ არსებობს, და ძებნა უკვე გაკეთდა — მფლობელმა ' +
    'ნაპოვნი წინა პასუხში უკვე წაიკითხა. თავიდან ნუ მოძებნი და ნაპოვნს ნუ გაიმეორებ. ' +
    'შეადგინე გეგმა იმ ნაპოვნიდან და დადე propose_task_plan-ით: ვინ წყვეტს ამას, რომელი ' +
    'გზებით მივალთ, ვის ვკითხავთ სახელებით, დასრულების ნიშანი. მფლობელს ორ-სამ წინადადებაში ' +
    'უთხარი მხოლოდ გეგმა — ვის ვკითხავთ და რატომ — და ბოლოს present_choices-ით ორი ღილაკი: ' +
    '„ვამტკიცებ" და „შევცვალოთ". დასტური მხოლოდ იმაზეა, რაც გადის. არავის არ მისწერო, ' +
    'სანამ გეგმა არ დამტკიცდება. თუ მფლობელმა თქვა, რომ არავის არ მივწეროთ — ' +
    'people_to_involve ცარიელი რჩება.',
  en:
    'A goal has just been saved, there is no plan yet, and the search is ALREADY done — the ' +
    'owner has read the findings in the previous reply. Do not search again and do not repeat ' +
    'the findings. Draw up the plan from those findings and submit it with propose_task_plan: ' +
    'who decides this, which paths we take, whom we will ask by name, and the sign that it is ' +
    'done. Tell the owner only the plan, in two or three sentences — whom we would ask and why ' +
    '— and end with present_choices and two buttons: "I approve" and "Change it". The yes is ' +
    'only for what goes out. Write to nobody until the plan is approved. If the owner said to ' +
    'write to nobody, people_to_involve stays empty.',
  ru:
    'Цель только что сохранена, плана ещё нет, и поиск УЖЕ сделан — владелец прочитал ' +
    'найденное в предыдущем ответе. Не ищи заново и не повторяй найденное. Составь план из ' +
    'этого найденного и отправь через propose_task_plan: кто это решает, какими путями идём, ' +
    'кого спросим поимённо, признак завершения. Владельцу скажи только план, в двух-трёх ' +
    'предложениях — кого спросим и почему — и в конце present_choices с двумя кнопками: ' +
    '«Подтверждаю» и «Изменить». Подтверждение нужно только для того, что уходит наружу. Никому ' +
    'не пиши, пока план не утверждён. Если владелец сказал никому не писать — people_to_involve ' +
    'остаётся пустым.',
  es:
    'Se acaba de guardar una meta, todavía no hay plan y la búsqueda YA está hecha — el ' +
    'propietario leyó lo encontrado en la respuesta anterior. No vuelvas a buscar ni repitas lo ' +
    'encontrado. Redacta el plan con eso y envíalo con propose_task_plan: quién decide esto, ' +
    'por qué caminos vamos, a quién preguntaremos por nombre, y la señal de que está resuelto. ' +
    'Dile al propietario solo el plan, en dos o tres frases — a quién preguntaríamos y por qué ' +
    '— y termina con present_choices y dos botones: «Lo apruebo» y «Cambiarlo». El sí es solo ' +
    'para lo que sale. No escribas a nadie hasta que el plan esté aprobado. Si el propietario ' +
    'dijo que no escribamos a nadie, people_to_involve queda vacío.',
};
