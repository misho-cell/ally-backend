import { saveContactInsight } from '../insights.service';
import { ChatToolDefinition, ContactInsight } from '../../types';

export interface SaveContactInsightParams {
  phone: string;
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
      phone: {
        type: 'string',
        required: true,
        description:
          "The contact's phone number from search results — used as the contact identifier. Reuse it exactly; do not display it to the user.",
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
      const { phone, contact_name, collected_data } = params;

      if (!phone.trim() || !contact_name.trim()) {
        throw new Error('phone and contact_name are required');
      }

      return saveContactInsight(userId, phone, contact_name, collected_data);
    },
  };
}
