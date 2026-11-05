import {
  MAX_SILENCE_DAYS,
  MAX_STEPS,
  MIN_SILENCE_DAYS,
  NamedAction,
  StepAction,
} from './planSteps';

/**
 * K1: the JSON schema of propose_task_plan's `result_when` and `steps`, kept
 * here so the 20k-line chat module only references it. Every value the server
 * checks is declared — prose in a description is not checked where the call
 * is made (row 244(b)).
 */

const NEXT_STEP = {
  type: 'string',
  description: 'The id of a LATER step of this plan.',
} as const;

const STEP_ITEM = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Short id, e.g. "s1". Optional; the position is used.' },
    action: { type: 'string', enum: Object.values(StepAction) },
    who: {
      type: 'object',
      description:
        'ask/introduce: the person asked (for introduce, the go-between), with the phone id ' +
        'from a search result. They must also be in people_to_involve.',
      properties: { phone: { type: 'string' }, name: { type: 'string' } },
    },
    what: { type: 'string', description: 'What this step asks or looks for, in a few words.' },
    on_silence: {
      type: 'object',
      description: 'When nobody answers this step within after_days, go to next_step.',
      properties: {
        after_days: { type: 'integer', minimum: MIN_SILENCE_DAYS, maximum: MAX_SILENCE_DAYS },
        next_step: NEXT_STEP,
      },
      required: ['after_days', 'next_step'],
    },
    on_no: {
      type: 'object',
      description: 'When the person says no, go to next_step.',
      properties: { next_step: NEXT_STEP },
      required: ['next_step'],
    },
    on_named: {
      type: 'object',
      description:
        'When the answer names somebody: introduce (ask for the introduction through this ' +
        'person) or ask them. This is part of the plan the owner approves.',
      properties: { action: { type: 'string', enum: Object.values(NamedAction) } },
      required: ['action'],
    },
    ask_owner: {
      type: 'boolean',
      description:
        'true only where the owner must say yes before this step — the plan marks it now, ' +
        'so the owner is asked here and nowhere else.',
    },
  },
  required: ['action'],
} as const;

export const PLAN_STEPS_SCHEMA_PROPERTIES = {
  result_when: {
    type: 'string',
    description: 'What counts as the result, in one line (the same field as solved_when).',
  },
  steps: {
    type: 'array',
    maxItems: MAX_STEPS,
    description:
      'The plan as steps, in the order they are worked. Each step says what happens on ' +
      'silence, on a no and when a name is given, so the plan runs without asking the owner ' +
      'again — except at steps marked ask_owner.',
    items: STEP_ITEM,
  },
} as const;
