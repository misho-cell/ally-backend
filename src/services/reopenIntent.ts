/**
 * RW-012 B (MTR #7, goal 20759): a goal the owner closed is reopened only on
 * his own word — „გააგრძელე", „ხელახლა გახსენი", "reopen", "resume". A run's
 * own follow-up never reopens it.
 */
const REOPEN_RE =
  /(გააგრძელე|განაახლე|ხელახლა\s+(?:გახსენი|დაიწყე)|თავიდან\s+დაიწყე|გავაგრძელოთ|\b(?:reopen|resume|continue|carry\s+on|start\s+again)\b|продолжи|возобнови|continúa|reabre|retoma)/iu;

/** Does the owner's own line ask to go on with something that was closed? */
export function asksToReopen(ownerLine: string): boolean {
  return REOPEN_RE.test(ownerLine);
}
