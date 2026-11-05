import {
  ClaimKind,
  claimsOfKind,
  OwnerAsk,
  ReplyClaims,
  withoutSentences,
} from './replyClaims.service';

/**
 * 4490 (tester box 51481, threads 49281 and 49284, 2 of 2): „სად მუშაობს
 * ბახვა?" was answered with the job and then „შევინახე: ბახვა, სამუშაო
 * ადგილი: „საცდელი ლოჯისტიკა"" — no save tool ran. A plain question saves
 * nothing, so a sentence saying „I saved" under it is false and is taken out;
 * the answer itself stays. #8779 c: which sentences claim a save, and whether
 * the owner only asked, is the small model's reading (replyClaims.service).
 */
const SAVING_TOOL_RE = /^(?:save_|correct_|remember_|add_|set_user_|update_profile)/u;

/** The reply without the „I saved" sentences, when the owner only asked and nothing was saved. */
export function withoutSavedClaimOnAQuestion(
  reply: string,
  claims: ReplyClaims,
  toolNamesUsed: readonly string[],
): string {
  const said = claimsOfKind(claims, ClaimKind.Saved);
  if (!claims.ownerAsks.has(OwnerAsk.OnlyAsks) || said.length === 0) return reply;
  if (toolNamesUsed.some((name) => SAVING_TOOL_RE.test(name))) return reply;
  return withoutSentences(reply, said);
}
