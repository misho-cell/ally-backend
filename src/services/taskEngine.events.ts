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
    'შემოწმება. ბოლოს ერთი სტრიქონი: რა მიდის ახლა, ვის ვკითხე, როდის დავბრუნდები.',
  en:
    'The plan has just been approved — this is day one. The first rule of the standard: everything ' +
    'today. From the plan’s "who I will ask" list, write to the first 3–5 people at once — no ' +
    'separate consent is needed, and no showing the texts for confirmation either: the plan is ' +
    'approved and that IS the consent (D119). Run the web search and the network search along the ' +
    'plan’s paths, and set the next check with set_task_wake. End with one line: what is running ' +
    'now, whom I asked, when I come back.',
  ru:
    'План только что утверждён — это первый день. Первое правило стандарта: всё сегодня. Из списка ' +
    '«кого спрошу» напиши первым 3–5 людям сразу — отдельное согласие не нужно, и показывать ' +
    'тексты на подтверждение тоже не нужно: план утверждён, и это и есть согласие (D119). Запусти ' +
    'веб-поиск и поиск по сети путями плана и назначь следующую проверку через set_task_wake. В ' +
    'конце одна строка: что идёт сейчас, кого спросил, когда вернусь.',
  es:
    'El plan acaba de ser aprobado — es el día uno. La primera regla del estándar: todo hoy. De la ' +
    'lista «a quién preguntaré» del plan, escribe a las primeras 3–5 personas a la vez — no hace ' +
    'falta un consentimiento aparte, ni mostrar los textos para confirmarlos: el plan está ' +
    'aprobado y eso ES el consentimiento (D119). Lanza la búsqueda web y la búsqueda en la red por ' +
    'los caminos del plan, y fija la siguiente revisión con set_task_wake. Termina con una línea: ' +
    'qué está en marcha ahora, a quién pregunté, cuándo vuelvo.',
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
 * So the fact is stated rather than offered. `contactHandedOver` comes from
 * the same branch that decides what the other two are told, which is the only
 * way three accounts of one event can be made to agree.
 */
export function introOutcomeEvent(
  targetName: string,
  accepted: boolean,
  contactHandedOver = false,
): Readonly<Record<RunLanguage, string>> {
  const handover = {
    ka: contactHandedOver
      ? `${targetName}-ის კონტაქტი უკვე გადმოცემულია — შეახსენე, რომ ახლა თავად შეუძლია მისწეროს.`
      : `კონტაქტი არავის გადმოუციათ — შუამავალმა აირჩია, რომ კავშირი მის გავლით გაგრძელდეს. ` +
        'ნუ ეტყვი, რომ ნომერი აქვს.',
    en: contactHandedOver
      ? `${targetName}'s contact has ALREADY been handed over — remind them they can write themselves now.`
      : 'NO contact was handed over — the mediator chose to keep the connection going through ' +
        'them. Do NOT tell the owner they have the number.',
    ru: contactHandedOver
      ? `Контакт ${targetName} УЖЕ передан — напомни, что теперь он может написать сам.`
      : 'Контакт НИКОМУ не передан — посредник решил, что связь идёт через него. Не говори, ' +
        'что номер у него есть.',
    es: contactHandedOver
      ? `El contacto de ${targetName} YA ha sido entregado — recuérdale que ya puede escribir él mismo.`
      : 'NO se ha entregado ningún contacto — el intermediario ha decidido que todo pase por ' +
        'él. No le digas al propietario que tiene el número.',
  };
  return accepted
    ? {
        ka:
          `${targetName}-თან გაცნობაზე თანხმობა მოვიდა. უთხარი მფლობელს ერთი წინადადებით, რომ ` +
          `პასუხი დადებითია. ${handover.ka} ` +
          'მერე შეამოწმე, მიზანი ამით მოგვარდა თუ კიდევ რჩება გასაკეთებელი.',
        en:
          `The introduction to ${targetName} has been agreed. Tell the owner in one sentence that ` +
          `the answer is yes. ${handover.en} ` +
          'Then check whether this solves the goal or whether something is still open.',
        ru:
          `На знакомство с ${targetName} получено согласие. Скажи владельцу одним предложением, ` +
          `что ответ положительный. ${handover.ru} ` +
          'Затем проверь, закрывает ли это цель или осталось что-то ещё.',
        es:
          `La presentación a ${targetName} ha sido aceptada. Dile al propietario en una frase que ` +
          `la respuesta es sí. ${handover.es} ` +
          'Luego comprueba si esto resuelve la meta o si queda algo abierto.',
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
export const PLAN_PROPOSAL_EVENT: Readonly<Record<RunLanguage, string>> = {
  ka:
    'მიზანი ახლახან შეინახა და გეგმა ჯერ არ არსებობს. შეადგინე გეგმა და დადე propose_task_plan-ით: ' +
    'ვინ წყვეტს ამას (რამდენიმე თუა — ყველა), რომელი გზებით მივალთ (მფლობელის ქსელი, მეორე წრე, ვები), ' +
    'ვის ვკითხავთ სახელებით, დასრულების ნიშანი. მერე მოკლედ აჩვენე მფლობელს და სთხოვე დასტური — ' +
    'ბოლოს present_choices-ით ორი ღილაკი: „ვამტკიცებ" და „შევცვალოთ". ' +
    'არავის არ მისწერო და არაფერი გაუშვა, სანამ გეგმა არ დამტკიცდება. ' +
    'თუ მფლობელმა თავად თქვა, რომ არავის არ მივწეროთ („არავის არ მისწერო", „მე თვითონ ' +
    'მივწერ/დავურეკ") — people_to_involve ცარიელი რჩება პირველივე გეგმაში. ნაპოვნი ადამიანები ' +
    'მხოლოდ შეტყობინებაში ჩამოთვალე, როგორც ლიდები მისთვის. „ვის ვკითხავთ" ამ შემთხვევაში ' +
    'ნიშნავს „არავის".',
  en:
    'A goal has just been saved and there is no plan yet. Draw one up and submit it with ' +
    'propose_task_plan: who decides this (if several — all of them), which paths we take (the ' +
    'owner’s network, the second circle, the web), whom we will ask by name, and the sign that it ' +
    'is done. Then show the owner briefly and ask for confirmation — end with present_choices and ' +
    'two buttons: "I approve" and "Change it". Write to nobody and start nothing until the plan is ' +
    'approved. If the owner said themselves that we are to write to nobody ("do not contact ' +
    'anyone", "I will call them myself") — people_to_involve stays empty in the very first plan. ' +
    'List the people you found in your message only, as leads for them. "Whom we will ask" means ' +
    '"nobody" in that case.',
  ru:
    'Цель только что сохранена, плана ещё нет. Составь план и отправь его через propose_task_plan: ' +
    'кто это решает (если несколько — все), какими путями идём (сеть владельца, второй круг, веб), ' +
    'кого спросим поимённо, признак завершения. Затем коротко покажи владельцу и попроси ' +
    'подтверждение — в конце present_choices с двумя кнопками: «Подтверждаю» и «Изменить». Никому ' +
    'не пиши и ничего не запускай, пока план не утверждён. Если владелец сам сказал никому не ' +
    'писать («никому не пиши», «я сам напишу/позвоню») — people_to_involve остаётся пустым в самом ' +
    'первом плане. Найденных людей перечисли только в сообщении, как зацепки для него. «Кого ' +
    'спросим» в этом случае значит «никого».',
  es:
    'Se acaba de guardar una meta y todavía no hay plan. Redacta uno y envíalo con ' +
    'propose_task_plan: quién decide esto (si son varios — todos), por qué caminos vamos (la red ' +
    'del propietario, el segundo círculo, la web), a quién preguntaremos por nombre, y la señal de ' +
    'que está resuelto. Luego muéstraselo brevemente al propietario y pide confirmación — termina ' +
    'con present_choices y dos botones: «Lo apruebo» y «Cambiarlo». No escribas a nadie ni pongas ' +
    'nada en marcha hasta que el plan esté aprobado. Si el propietario dijo él mismo que no ' +
    'escribamos a nadie («no contactes a nadie», «yo mismo les escribo/llamo») — people_to_involve ' +
    'queda vacío en el primer plan. Enumera a las personas encontradas solo en tu mensaje, como ' +
    'pistas para él. «A quién preguntaremos» significa «a nadie» en ese caso.',
};
