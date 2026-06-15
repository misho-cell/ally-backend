import { saveContactInsight } from '../insights.service';
import { ChatToolDefinition, ContactInsight } from '../../types';

export interface SaveContactInsightParams {
  neo4j_contact_id: string;
  contact_name: string;
  collected_data: Record<string, unknown>;
}

export function createSaveContactInsightTool(
  userId: string,
): ChatToolDefinition<SaveContactInsightParams, ContactInsight> {
  return {
    name: 'save_contact_insight',
    description: 'Save collected information about a contact for future reference.',
    parameters: {
      neo4j_contact_id: {
        type: 'string',
        required: true,
        description: 'The Neo4j node ID of the contact',
      },
      contact_name: {
        type: 'string',
        required: true,
        description: 'The human-readable name of the contact',
      },
      collected_data: {
        type: 'object',
        required: true,
        description: 'The collected contact insight data as a JSON object',
      },
    },
    execute: async (params: SaveContactInsightParams): Promise<ContactInsight> => {
      const { neo4j_contact_id, contact_name, collected_data } = params;

      if (!neo4j_contact_id.trim() || !contact_name.trim()) {
        throw new Error('neo4j_contact_id and contact_name are required');
      }

      return saveContactInsight(userId, neo4j_contact_id, contact_name, collected_data);
    },
  };
}
