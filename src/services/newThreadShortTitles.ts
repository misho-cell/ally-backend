import { SHORT_TITLES_ON } from './shortTitles';
import { writeShortTitles } from './threadTitle.service';

/** The part of a just-created thread the short titles are made from. */
export interface TitledThread {
  readonly id: number;
  readonly title: string | null;
}

/**
 * 5052 (Giorgi, 15 Oct): a case title cut off with „…" in the list and the
 * chat header — „<name>: გიორგი, ლიკას სურს …", an ask thread's title.
 *
 * Short titles were written only where the model names a conversation. An ask
 * or request thread is titled by code when it is created, so it never got one,
 * and the one-off backfill (14 Oct) could not reach threads opened after it.
 * Same text and model as every other short title (4919, Misho's yes).
 *
 * Fire-and-forget: writeShortTitles never throws, and a thread must not wait
 * on its short title — until it lands the client shortens the full one.
 */
export function shortTitlesForNewThread(userId: string, thread: TitledThread): void {
  const title = thread.title?.trim() ?? '';
  if (!SHORT_TITLES_ON || title === '') return;
  void writeShortTitles(userId, thread.id, title, title);
}
