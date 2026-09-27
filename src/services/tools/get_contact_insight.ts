import { getContactInsight } from '../insights.service';
import { normalizePhone } from '../phone';
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
    execute: async (params: GetContactInsightParams): Promise<ContactInsight | null> => {
      const { phone } = params;

      // THE IDENTIFIER, NOT THE TYPING. `insights.service` keys the row on
      // `normalizePhone(phone)`, and that is `''` for anything with no digits
      // in it — "unknown", a name, a dash. `phone.trim()` lets all of those
      // through, and they all read the SAME row: the one every digitless save
      // merged into. Guard on the value the query is keyed by.
      if (!normalizePhone(phone)) {
        throw new Error('phone is required');
      }

      return getContactInsight(userId, phone);
    },
  };
}
