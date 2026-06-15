import { getContactInsight } from '../insights.service';
import { ChatToolDefinition, ContactInsight } from '../../types';

export interface GetContactInsightParams {
  neo4j_contact_id: string;
}

export function createGetContactInsightTool(
  userId: string,
): ChatToolDefinition<GetContactInsightParams, ContactInsight | null> {
  return {
    name: 'get_contact_insight',
    description: 'Retrieve stored contact insight for a given Neo4j contact ID.',
    parameters: {
      neo4j_contact_id: {
        type: 'string',
        required: true,
        description: 'The Neo4j node ID of the contact',
      },
    },
    execute: async (params: GetContactInsightParams): Promise<ContactInsight | null> => {
      const { neo4j_contact_id } = params;

      if (!neo4j_contact_id.trim()) {
        throw new Error('neo4j_contact_id is required');
      }

      return getContactInsight(userId, neo4j_contact_id);
    },
  };
}
