import Anthropic from '@anthropic-ai/sdk';
import { getContactInsight, saveContactInsight } from './insights.service';
import { createGetContactInsightTool, GetContactInsightParams } from './tools/get_contact_insight';
import {
  createSaveContactInsightTool,
  SaveContactInsightParams,
} from './tools/save_contact_insight';
import { lookupContactByPhone } from './tools/lookupContactByPhone';
import { searchContactByName } from './tools/searchContactByName';
import { searchByTag } from './tools/searchByTag';
import { searchByInsight } from './tools/searchByInsight';
import { query } from '../db/postgres/client';
import anthropic from '../config/anthropic';
import { ChatToolDefinition } from '../types';

interface ConversationRow {
  role: string;
  content: string;
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

function toAnthropicTool(tool: ChatToolDefinition<never, unknown>): AnthropicTool {
  const properties: Record<string, { type: string; description: string }> = {};
  const required: string[] = [];

  for (const [key, param] of Object.entries(tool.parameters)) {
    properties[key] = { type: param.type, description: param.description };
    if (param.required) required.push(key);
  }

  return {
    name: tool.name,
    description: tool.description,
    input_schema: { type: 'object', properties, required },
  };
}

export async function buildContactInsightSystemPrompt(): Promise<string> {
  // 1. Read base prompt from ai_config
  const configResult = await query<{ system_prompt: string }>(
    'SELECT system_prompt FROM ai_config ORDER BY id DESC LIMIT 1',
  );
  const basePrompt = configResult.rows[0]?.system_prompt ?? '';

  // 2. Read active insight_fields
  const fieldsResult = await query<{
    field_key: string;
    field_label: string;
    field_description: string;
  }>(
    'SELECT field_key, field_label, field_description FROM insight_fields WHERE is_active = true ORDER BY created_at ASC',
  );
  const fields = fieldsResult.rows;

  // 3. Build fields section
  if (fields.length === 0) return basePrompt;

  const fieldsSection = `

## კონტაქტის შესახებ ინფოს შეგროვება
კონტაქტის წარდგენის შემდეგ ჰკითხე მომხმარებელს:
${fields.map((f) => `- ${f.field_label}: ${f.field_description}`).join('\n')}

მიღებული ინფო შეინახე save_contact_insight tool-ით.
შენახული ინფო გამოიყენე მომავალ ძიებებში search_by_insight tool-ით.`;

  return basePrompt + fieldsSection;
}

export function getContactInsightTools(
  userId: string,
): Array<
  | ChatToolDefinition<SaveContactInsightParams, unknown>
  | ChatToolDefinition<GetContactInsightParams, unknown>
> {
  return [createSaveContactInsightTool(userId), createGetContactInsightTool(userId)];
}

export async function processChat(userId: string, userMessage: string): Promise<string> {
  // Step 1
  const systemPrompt = await buildContactInsightSystemPrompt();

  // Step 2
  const existingTools = getContactInsightTools(String(userId));
  const lookupTool: AnthropicTool = {
    name: 'lookup_contact_by_phone',
    description:
      'Looks up a contact in Neo4j by phone number. Use every time the user mentions a phone number.',
    input_schema: {
      type: 'object',
      properties: {
        phone_number: { type: 'string', description: 'Phone number in any format.' },
      },
      required: ['phone_number'],
    },
  };
  const searchTool: AnthropicTool = {
    name: 'search_contact_by_name',
    description:
      'Search contacts by first name, last name, or full name. Use this when the user mentions a person by name instead of phone number. Returns up to 5 matching contacts with their phone numbers and details.',
    input_schema: {
      type: 'object',
      properties: {
        name_query: {
          type: 'string',
          description:
            'The name or partial name to search for. Can be first name, last name, or full name.',
        },
      },
      required: ['name_query'],
    },
  };
  const tagTool: AnthropicTool = {
    name: 'search_by_tag',
    description:
      'Search contacts by tag. Tags are keywords people have associated with contacts — job titles, skills, traits, names. Use this when the user is looking for someone by what they do or who they are. Example: "ხელოსანი", "IT", "ექიმი", "misho". Returns a list of matching contacts without phone or email.',
    input_schema: {
      type: 'object',
      properties: {
        tag_query: { type: 'string', description: 'The tag or keyword to search for.' },
      },
      required: ['tag_query'],
    },
  };
  const insightTool: AnthropicTool = {
    name: 'search_by_insight',
    description:
      'Search contacts using previously saved information collected from users by the assistant. Use this when the user is looking for someone based on details the assistant has already recorded — for example: "სანდო ხელოსანი", "კარგი ექიმი". This searches the assistant\'s own saved knowledge base.',
    input_schema: {
      type: 'object',
      properties: {
        search_query: {
          type: 'string',
          description: 'The keyword or phrase to search in saved contact information.',
        },
      },
      required: ['search_query'],
    },
  };
  const allTools: AnthropicTool[] = [
    ...existingTools.map(toAnthropicTool),
    lookupTool,
    searchTool,
    tagTool,
    insightTool,
  ];

  // Step 3
  const historyResult = await query<ConversationRow>(
    'SELECT role, content FROM conversations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
    [userId],
  );
  const history = historyResult.rows.reverse();

  // Step 4
  await query('INSERT INTO conversations (user_id, role, content) VALUES ($1, $2, $3)', [
    userId,
    'user',
    userMessage,
  ]);

  // Step 5
  const messages: Anthropic.MessageParam[] = [
    ...history.map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    })),
    { role: 'user', content: userMessage },
  ];

  // Step 6
  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    tools: allTools,
    messages,
  });

  // Step 7
  while (response.stop_reason === 'tool_use') {
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      let result: unknown;

      if (block.name === 'lookup_contact_by_phone') {
        result = await lookupContactByPhone((block.input as any).phone_number);
      } else if (block.name === 'get_contact_insight') {
        result = await getContactInsight(
          (block.input as any).userId,
          (block.input as any).neo4j_contact_id,
        );
      } else if (block.name === 'search_contact_by_name') {
        result = await searchContactByName((block.input as any).name_query);
      } else if (block.name === 'search_by_tag') {
        result = await searchByTag((block.input as any).tag_query);
      } else if (block.name === 'search_by_insight') {
        result = await searchByInsight((block.input as any).search_query);
      } else if (block.name === 'save_contact_insight') {
        result = await saveContactInsight(
          (block.input as any).userId,
          (block.input as any).neo4j_contact_id,
          (block.input as any).contact_name,
          (block.input as any).collected_data,
        );
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });

    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      tools: allTools,
      messages,
    });
  }

  // Step 8
  const finalText = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as any).text)
    .join('');

  // Step 9
  await query('INSERT INTO conversations (user_id, role, content) VALUES ($1, $2, $3)', [
    userId,
    'assistant',
    finalText,
  ]);

  // Step 10
  return finalText;
}
