import { readFileSync } from 'fs';
import { join } from 'path';
import {
  A2A_ROUND_CAP,
  isAssistantOnlyRound,
  needsTheOwner,
  ownerMustAnswerNote,
  RoundInput,
  roundsAfter,
} from '../a2aRounds';

/**
 * 1688 (A5): two assistants may answer each other twice with nobody typing;
 * the third time the owner answers. The owner's own words start the count again.
 */
const assistantReply = (roundsSoFar: number): RoundInput => ({
  isFollowUp: true,
  ownerAddedSomething: false,
  fromOwnersLine: false,
  sentOnSomeonesWord: false,
  roundsSoFar,
});

describe('a round counter between assistants (1688)', () => {
  it('a first ask is no round and stamps 0', () => {
    const first = { ...assistantReply(0), isFollowUp: false };
    expect(isAssistantOnlyRound(first)).toBe(false);
    expect(roundsAfter(first)).toBe(0);
  });

  it('two assistant-only replies go; the third needs the owner', () => {
    expect(needsTheOwner(assistantReply(0))).toBe(false);
    expect(roundsAfter(assistantReply(0))).toBe(1);
    expect(needsTheOwner(assistantReply(1))).toBe(false);
    expect(roundsAfter(assistantReply(1))).toBe(A2A_ROUND_CAP);
    expect(needsTheOwner(assistantReply(A2A_ROUND_CAP))).toBe(true);
  });

  it.each([
    ['the owner typed since', { ownerAddedSomething: true }],
    ['the question is the owner’s own line', { fromOwnersLine: true }],
    ['a relay or the evening card', { sentOnSomeonesWord: true }],
  ])('%s: no round, and the count starts again', (_, change) => {
    const input = { ...assistantReply(A2A_ROUND_CAP), ...change };
    expect(needsTheOwner(input)).toBe(false);
    expect(roundsAfter(input)).toBe(0);
  });

  it('the note names the person and hands the answer to the owner', () => {
    expect(ownerMustAnswerNote('ნინო')).toContain('ნინო-ს');
    expect(ownerMustAnswerNote('ნინო')).toContain('მფლობელს');
  });

  it('createAsk refuses before any send, and stamps the count on the row', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    const refused = asks.indexOf('if (needsTheOwner(rounds))');
    expect(refused).toBeGreaterThan(-1);
    expect(asks.indexOf('const ask = await query<{ id: number }>(')).toBeGreaterThan(refused);
    expect(asks).toContain('roundsAfter(rounds),');
    expect(asks).toContain('a.a2a_rounds');
  });
});
