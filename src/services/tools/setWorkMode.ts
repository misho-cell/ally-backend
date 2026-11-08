import { FREE_MODE_PEOPLE_PER_DAY, WorkMode } from '../workMode';

/**
 * Misho, 8 Nov: the two ways to work a goal (workMode.ts). Which one the owner
 * chose is the model's reading of his words (#8779); the server keeps it.
 */
export const SET_WORK_MODE_TOOL = {
  name: 'set_work_mode',
  description:
    'Sets how a goal is worked. „plan" (the default): you agree each plan with the owner and ' +
    'he approves it. „free": the owner gives a standing yes on this goal’s topic — „write to ' +
    'whoever is needed, just bring me the result" — so the plans you propose start without ' +
    `asking him, at most ${FREE_MODE_PEOPLE_PER_DAY} new people a day, and he gets one report ` +
    'each evening of whom you wrote to. Call it only when the owner himself chose the mode in ' +
    'his own words; when a new goal opens, offer him the choice once.',
  input_schema: {
    type: 'object' as const,
    properties: {
      task_id: { type: 'number', description: 'The goal.' },
      mode: { type: 'string', enum: [WorkMode.Plan, WorkMode.Free] },
    },
    required: ['task_id', 'mode'],
  },
};

export const SET_WORK_MODE_TOOL_NAME = SET_WORK_MODE_TOOL.name;
