import { AskState, ownerAskLine } from './askState';
import { createAsk } from './taskAsks.service';
import { saveThreadMessage, userLanguage } from './threads.service';
import {
  CardHeldAsk,
  claimDueEveningCards,
  DueCard,
  releaseCardHeldAsks,
  ringForCard,
} from './eveningCard.service';

/**
 * #1850: every minute, the evening cards whose 19:00 (or snooze) has come.
 * Each held question goes through createAsk — the same walls as any send —
 * then the person is rung once for the whole card. One card's failure never
 * stops the next.
 */
const SWEEP_EVERY_MS = 60_000;

async function sendItem(card: DueCard, held: CardHeldAsk): Promise<void> {
  if (held.contact_phone === null) {
    // eslint-disable-next-line no-console
    console.warn(`[evening-card] card ${card.id}: held question ${held.id} has no number`);
    return;
  }
  const outcome = await createAsk(
    held.owner_id,
    held.task_id,
    held.contact_phone,
    held.question,
    undefined,
    held.thread_id ?? undefined,
    undefined,
    { eveningCardId: card.id },
  );
  if (!outcome.sent) {
    // eslint-disable-next-line no-console
    console.warn(
      `[evening-card] card ${card.id}: question ${held.id} of goal ${held.task_id} not sent — ${outcome.reason ?? 'refused'}`,
    );
    return;
  }
  await tellAskerItWent(held, outcome.to_name);
}

/**
 * The tester's 44551 (1850, asker 177850 conv 41259): the held question went
 * out at the card's hour and the asker heard nothing — his next message was the
 * hourly check. He is told on his goal, in the ordinary per-person line.
 */
async function tellAskerItWent(held: CardHeldAsk, toName: string): Promise<void> {
  if (held.thread_id === null) return;
  const language = await userLanguage(held.owner_id).catch(() => 'ka' as const);
  await saveThreadMessage(
    held.thread_id,
    Number(held.owner_id),
    'assistant',
    ownerAskLine(toName, { status: 'sent' }, AskState.Sent, language),
  );
}

async function sendCard(card: DueCard): Promise<void> {
  const held = await releaseCardHeldAsks(card.id);
  for (const h of held) {
    await sendItem(card, h).catch((err: unknown) =>
      // eslint-disable-next-line no-console
      console.error(
        `[evening-card] card ${card.id}: question ${h.id} failed:`,
        (err as Error).message,
      ),
    );
  }
  const open = await ringForCard(card);
  // eslint-disable-next-line no-console
  console.log(`[evening-card] card ${card.id}: ${held.length} sent, ${open} waiting, rung once`);
}

export async function sweepEveningCards(): Promise<void> {
  const cards = await claimDueEveningCards();
  for (const card of cards) {
    await sendCard(card).catch((err: unknown) =>
      // eslint-disable-next-line no-console
      console.error(`[evening-card] card ${card.id} failed:`, (err as Error).message),
    );
  }
}

export function startEveningCards(): void {
  const tick = (): void => {
    void sweepEveningCards()
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[evening-card] sweep failed:', (err as Error).message),
      )
      .then(() => {
        setTimeout(tick, SWEEP_EVERY_MS).unref();
      });
  };
  setTimeout(tick, SWEEP_EVERY_MS).unref();
}
