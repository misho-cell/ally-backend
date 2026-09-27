import { getContactInsight } from '../insights.service';
import { ChatToolDefinition, ContactInsight } from '../../types';

export interface GetContactInsightParams {
  phone: string;
}

export function createGetContactInsightTool(
  userId: string,
): ChatToolDefinition<GetContactInsightParams, ContactInsight | null> {
  return {
    name: 'get_contact_insight',
    description: 'Retrieve stored contact insight for a given contact phone number.',
    parameters: {
      phone: {
        type: 'string',
        required: true,
        description:
          "The contact's phone number from search results — used as the contact identifier. Reuse it exactly; do not display it to the user.",
      },
    },
    /** ⚠️ Not the live path — see the note in `save_contact_insight.ts`. */
    execute: async (params: GetContactInsightParams): Promise<ContactInsight | null> =>
      getContactInsight(userId, params.phone),
  };
}
