import { saveContactInsight } from '../insights.service';
import { normalizePhone } from '../phone';
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

      // THE IDENTIFIER, NOT THE TYPING — and here it is a write. The row is
      // keyed `(user_id, normalizePhone(phone))` with
      // `ON CONFLICT … DO UPDATE SET data = contact_insights.data || EXCLUDED.data`,
      // so every save whose phone holds no digits lands on the ONE row keyed
      // `''` and merges into whatever the last such save left there. Two
      // different people's notes in a single record, under the later name.
      // `phone.trim()` does not see that: "unknown" passes it and normalizes
      // to `''` just the same.
      if (!normalizePhone(phone) || !contact_name.trim()) {
        throw new Error('phone and contact_name are required');
      }

      return saveContactInsight(userId, phone, contact_name, collected_data);
    },
  };
}
