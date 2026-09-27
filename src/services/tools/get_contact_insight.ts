import { ChatToolDefinition } from '../../types';

/**
 * ⚠️ SCHEMA ONLY. This describes the tool to the model; it does not run it.
 * `get_contact_insight` is executed by the dispatcher in `chat.service.ts`,
 * which calls `insights.service` directly — that is where the rules live.
 */
export function createGetContactInsightTool(): ChatToolDefinition {
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
  };
}
