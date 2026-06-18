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
import { searchSecondDegree } from './tools/searchSecondDegree';
import { webSearch } from './tools/webSearch';
import { getEnabledToolKeys } from './enabledTools.service';
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
  const configResult = await query<{ system_prompt: string }>(
    'SELECT system_prompt FROM ai_config ORDER BY id DESC LIMIT 1',
  );
  const basePrompt = configResult.rows[0]?.system_prompt ?? '';

  const fieldsResult = await query<{
    field_key: string;
    field_label: string;
    field_description: string;
  }>(
    'SELECT field_key, field_label, field_description FROM insight_fields WHERE is_active = true ORDER BY created_at ASC',
  );
  const fields = fieldsResult.rows;

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

const ALL_TOOL_DEFINITIONS: Record<string, AnthropicTool> = {
  lookup_contact_by_phone: {
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
  },
  search_contact_by_name: {
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
  },
  search_by_tag: {
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
  },
  search_by_insight: {
    name: 'search_by_insight',
    description:
      "Search contacts using previously saved information collected from users by the assistant. Use this when the user is looking for someone based on details the assistant has already recorded — for example: 'სანდო ხელოსანი', 'კარგი ექიმი'. This searches the assistant's own saved knowledge base.",
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
  },
  search_second_degree: {
    name: 'search_second_degree',
    description:
      "Search for contacts of contacts (2nd degree) by tag or keyword. Use this when search_by_tag returns no results, or when the user asks about someone who might be known through their contacts. Returns matches with the name of the mutual contact (via). Example: user asks for a plumber but has none directly — this finds plumbers in their contacts' contact lists.",
    input_schema: {
      type: 'object',
      properties: {
        tag_query: {
          type: 'string',
          description:
            'The tag, job title, skill, or keyword to search for in 2nd degree contacts.',
        },
      },
      required: ['tag_query'],
    },
  },
  web_search: {
    name: 'web_search',
    description:
      'Search the web for public information about a person, company, or topic. Use after finding a contact in the database to enrich with LinkedIn, company details, news, or other public info. Also use when the user asks general questions that require up-to-date information.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Search query. For person lookup include their name and company or job title for best results.',
        },
      },
      required: ['query'],
    },
  },
};

export async function processChat(userId: string, userMessage: string): Promise<string> {
  const [systemPrompt, enabledKeys] = await Promise.all([
    buildContactInsightSystemPrompt(),
    getEnabledToolKeys(),
  ]);

  const insightTools = getContactInsightTools(String(userId)).map(toAnthropicTool);

  const enabledTools: AnthropicTool[] = [
    ...insightTools,
    ...enabledKeys
      .filter((key) => key in ALL_TOOL_DEFINITIONS)
      .map((key) => ALL_TOOL_DEFINITIONS[key]),
  ];

  const historyResult = await query<ConversationRow>(
    'SELECT role, content FROM conversations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
    [userId],
  );
  const history = historyResult.rows.reverse();

  await query('INSERT INTO conversations (user_id, role, content) VALUES ($1, $2, $3)', [
    userId,
    'user',
    userMessage,
  ]);

  const messages: Anthropic.MessageParam[] = [
    ...history.map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    })),
    { role: 'user', content: userMessage },
  ];

  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    tools: enabledTools,
    messages,
  });

  while (response.stop_reason === 'tool_use') {
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      let result: unknown;
      const input = block.input as Record<string, unknown>;

      switch (block.name) {
        case 'lookup_contact_by_phone':
          result = await lookupContactByPhone(input['phone_number'] as string);
          break;
        case 'get_contact_insight':
          result = await getContactInsight(
            input['userId'] as string,
            input['neo4j_contact_id'] as string,
          );
          break;
        case 'search_contact_by_name':
          result = await searchContactByName(userId, input['name_query'] as string);
          break;
        case 'search_by_tag':
          result = await searchByTag(userId, input['tag_query'] as string);
          break;
        case 'search_by_insight':
          result = await searchByInsight(input['search_query'] as string);
          break;
        case 'search_second_degree':
          result = await searchSecondDegree(userId, input['tag_query'] as string);
          break;
        case 'web_search':
          result = await webSearch(input['query'] as string);
          break;
        case 'save_contact_insight':
          result = await saveContactInsight(
            input['userId'] as string,
            input['neo4j_contact_id'] as string,
            input['contact_name'] as string,
            input['collected_data'] as Record<string, unknown>,
          );
          break;
        default:
          result = { error: `Unknown tool: ${block.name}` };
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
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      tools: enabledTools,
      messages,
    });
  }

  const finalText = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as Anthropic.TextBlock).text)
    .join('');

  await query('INSERT INTO conversations (user_id, role, content) VALUES ($1, $2, $3)', [
    userId,
    'assistant',
    finalText,
  ]);

  return finalText;
}
