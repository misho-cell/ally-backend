import { ClaimKind, OwnerAsk, ReplyClaims } from '../../replyClaims.service';

/** A reading of the small model, as the guards receive it (#8779 c). */
export function claimsRead(
  sentences: Partial<Record<ClaimKind, readonly string[]>>,
  ownerAsks: readonly OwnerAsk[] = [],
): ReplyClaims {
  return { sentences, ownerAsks: new Set(ownerAsks) };
}
