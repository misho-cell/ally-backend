/**
 * Ticket 19 G6 — the incoming-ask thread held search, web and goal tools.
 *
 * ask_main tells the recipient's assistant it has „the question and nothing
 * else: no network, no search, no contact records, no tags, no profiles, no
 * goals, no notes, on either side". prompt-preview?mode=incoming_ask on user
 * 501 still listed web_search, search_by_tag, search_by_insight,
 * search_second_degree, search_contact_by_name, get_contact_full_profile,
 * find_warm_path, create_task, propose_task_plan, approve_task_plan and
 * ask_contact.
 *
 * Thread 15115, 12:57:53: „ვნახავ ეკეს პროფილს", then at 12:58:31 a paragraph
 * of one employer's facts and praise wrapped around the recipient's single
 * line. The model was not disobeying a rule it had been given; it was using a
 * tool it had been handed.
 *
 * The tester's done-when is the list, read back: „prompt-preview?mode=
 * incoming_ask lists only those". That is what this file asserts.
 */
import { INCOMING_ASK_TOOL_NAMES, OWNER_CONSENT_TOOL_NAMES } from '../chat.service';

// The eight from the report, verbatim and in its order.
const ASKED_FOR = [
  'send_answer_to_asker',
  'relay_ask',
  'present_choices',
  'stop_contacting_me',
  'allow_contacting_me',
  'list_answer_rules',
  'delete_answer_rule',
  'save_user_note',
];

// The eleven named in the report as present and unwanted.
const MUST_NOT_BE_THERE = [
  'web_search',
  'search_by_tag',
  'search_by_insight',
  'search_second_degree',
  'search_contact_by_name',
  'get_contact_full_profile',
  'find_warm_path',
  'create_task',
  'propose_task_plan',
  'approve_task_plan',
  'ask_contact',
];

describe('Ticket 19 G6 — what an incoming-ask run is offered', () => {
  it('is exactly the eight tools the report asked for, and nothing else', () => {
    expect([...INCOMING_ASK_TOOL_NAMES].sort()).toEqual([...ASKED_FOR].sort());
  });

  it.each(MUST_NOT_BE_THERE)('does not carry %s', (name) => {
    expect(INCOMING_ASK_TOOL_NAMES).not.toContain(name);
  });

  it('carries no way to look a person up: nothing named search, find or profile', () => {
    const lookupish = INCOMING_ASK_TOOL_NAMES.filter((name) =>
      /search|find|profile|contact_facts|roster|warm_path|fetch_page/.test(name),
    );
    expect(lookupish).toEqual([]);
  });

  it('carries neither owner-consent tool, the same two the wake runs lost', () => {
    const consent = INCOMING_ASK_TOOL_NAMES.filter((name) => OWNER_CONSENT_TOOL_NAMES.has(name));
    expect(consent).toEqual([]);
  });

  it('names no tool twice — a duplicate would be sent to the model twice', () => {
    expect(new Set(INCOMING_ASK_TOOL_NAMES).size).toBe(INCOMING_ASK_TOOL_NAMES.length);
  });

  it('is built from real tool definitions, so every entry has a name', () => {
    for (const name of INCOMING_ASK_TOOL_NAMES) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });
});
