import anthropic from '../config/anthropic';
import { query } from '../db/postgres/client';

const ADMIN_SYSTEM_PROMPT = `შენ ხარ Ally-ს AI ასისტენტის კონფიგურატორი.
ადმინისტრატორი გეტყვის როგორ მოიქცეს user-ის AI ასისტენტი.

შენი სამუშაო პროცესი:
1. გაიგე რა ქცევა სურს ადმინს
2. წაიკითხე მიმდინარე prompt get_current_prompt tool-ით
3. შეადგინე განახლებული prompt — შეინარჩუნე ძველი ინსტრუქციები, დაამატე ახალი
4. აჩვენე ადმინს სრული განახლებული prompt ასე:

"აი ახალი prompt რომელსაც შევინახავ:

---
[სრული prompt ტექსტი]
---

გადახედეთ და დამიდასტურეთ შევინახო?"

5. დაელოდე ადმინის პასუხს — "კი", "დიახ", "yes", "დამეთანხმები" ან მსგავსი
6. დადასტურების შემდეგ გამოიყენე update_user_assistant_prompt tool
7. ადმინს უთხარი: "განახლდა! user-ის ასისტენტი ახალ ინსტრუქციებით მუშაობს."

თუ ადმინი უარს იტყვის ან შესწორებას სთხოვს — შეასწორე და კვლავ აჩვენე დასადასტურებლად.

მნიშვნელოვანი: update_user_assistant_prompt tool ᲐᲠᲐᲡᲝᲓᲔᲡ გამოიყენო სანამ ადმინი არ დაადასტურებს.`;

const adminTools = [
  {
    name: 'get_current_prompt',
    description: 'წაიკითხე მიმდინარე user-ის assistant-ის system prompt ai_config ცხრილიდან',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'update_user_assistant_prompt',
    description:
      'შეინახე განახლებული system prompt ai_config ცხრილში. გამოიყენე მხოლოდ ადმინის დადასტურების შემდეგ.',
    input_schema: {
      type: 'object' as const,
      properties: {
        new_prompt: {
          type: 'string',
          description: 'სრული განახლებული system prompt',
        },
      },
      required: ['new_prompt'],
    },
  },
];

async function executeAdminTool(toolName: string, toolInput: any): Promise<object> {
  if (toolName === 'get_current_prompt') {
    const result = await query<{ system_prompt: string }>(
      'SELECT system_prompt FROM ai_config ORDER BY id DESC LIMIT 1',
    );
    return { current_prompt: result.rows[0]?.system_prompt ?? '' };
  }

  if (toolName === 'update_user_assistant_prompt') {
    await query('INSERT INTO ai_config (system_prompt) VALUES ($1)', [toolInput.new_prompt]);
    return { updated: true };
  }

  return { error: 'Unknown tool' };
}

export async function processAdminChat(adminId: string, userMessage: string): Promise<string> {
  const historyResult = await query<{ role: string; content: string }>(
    `SELECT role, content FROM conversations
     WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 20`,
    [adminId],
  );
  const history = historyResult.rows.reverse();

  await query('INSERT INTO conversations (user_id, role, content) VALUES ($1, $2, $3)', [
    adminId,
    'user',
    userMessage,
  ]);

  const messages: any[] = [
    ...history.map((r) => ({ role: r.role, content: r.content })),
    { role: 'user', content: userMessage },
  ];

  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    system: ADMIN_SYSTEM_PROMPT,
    tools: adminTools,
    messages,
  });

  while (response.stop_reason === 'tool_use') {
    const assistantContent = response.content;
    const toolResults: any[] = [];

    for (const block of assistantContent) {
      if (block.type !== 'tool_use') continue;
      const result = await executeAdminTool(block.name, (block as any).input);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: 'assistant', content: assistantContent });
    messages.push({ role: 'user', content: toolResults });

    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: ADMIN_SYSTEM_PROMPT,
      tools: adminTools,
      messages,
    });
  }

  const reply = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as any).text)
    .join('');

  await query('INSERT INTO conversations (user_id, role, content) VALUES ($1, $2, $3)', [
    adminId,
    'assistant',
    reply,
  ]);

  return reply;
}
