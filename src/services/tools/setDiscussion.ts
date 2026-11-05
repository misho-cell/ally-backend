/**
 * #67 / #8779 group 4: the discuss-first mode of one conversation is the
 * model's reading of the owner's words (discussFirst.ts keeps and enforces it).
 */
export const SET_DISCUSSION_TOOL = {
  name: 'set_discussion',
  description:
    'The owner wants to TALK first: to be asked questions and understood before any search, ' +
    'plan or lead („ჯერ მკითხე", „let’s discuss", „no leads for now"). Call with discuss: ' +
    'true — from then on this conversation opens no goal and your turns hold no other tool, ' +
    'until the owner asks you to act („now find…", „go ahead"): then call it with discuss: ' +
    'false and carry on.',
  input_schema: {
    type: 'object' as const,
    properties: {
      discuss: { type: 'boolean', description: 'true to talk first; false when they ask to act.' },
    },
    required: ['discuss'],
  },
};

export const SET_DISCUSSION_TOOL_NAME = SET_DISCUSSION_TOOL.name;
