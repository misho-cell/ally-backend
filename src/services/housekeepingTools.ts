/**
 * Tools that only keep a goal's books — they carry no news of their own.
 *
 * The tester's 1133 (E10, 36536) and 38545 / 38677 (39106): Claude wrote its
 * answer beside one of these, and the owner read it twice. Shared by the run
 * (chat.service) and the GPT writer (finalAnswer.service).
 */
export const HOUSEKEEPING_TOOLS: ReadonlySet<string> = new Set([
  'set_task_wake',
  'set_task_brief',
  'update_user_profile',
]);
