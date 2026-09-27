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
    /**
     * ⚠️ THIS CLOSURE DOES NOT RUN. `getContactInsightTools` is consumed only
     * by `toAnthropicTool`, which reads `name`, `description` and `parameters`
     * — the live call goes through `chat.service.ts`'s dispatcher straight to
     * `saveContactInsight`. A guard written here on 27 September was a guard
     * on nothing, with passing tests; the rule now lives in the service, once,
     * where both this and the dispatcher meet.
     */
    execute: async (params: SaveContactInsightParams): Promise<ContactInsight> =>
      saveContactInsight(userId, params.phone, params.contact_name, params.collected_data),
  };
}
