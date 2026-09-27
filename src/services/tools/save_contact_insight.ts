import { ChatToolDefinition } from '../../types';

/** ⚠️ SCHEMA ONLY — see the note in `get_contact_insight.ts`. */
export function createSaveContactInsightTool(): ChatToolDefinition {
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
  };
}
