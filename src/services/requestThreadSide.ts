import type { Thread } from './threads.service';

/**
 * Row 305 (b): which side of a request a thread it does NOT own is on.
 *
 * A request's own threads say their side by their type — `incoming_request`
 * is the mediator's, `outgoing_request` the requester's. A follow-up request
 * written into an existing conversation has no thread of its own, and the two
 * it was written into are an ask thread and a goal thread, whose types say
 * nothing about the request at all.
 */
export enum SharedRequestSide {
  Mediator = 'mediator',
  Requester = 'requester',
}

/** A thread a request is shown in, and — when it only shares it — on which side. */
export interface RequestThread extends Thread {
  /**
   * Set only on a thread the request was WRITTEN INTO rather than opened
   * (`introduction_requests.mediator_thread_id` / `requester_thread_id`).
   * NULL on the request's own threads, whose type already says their side.
   */
  readonly shared_side: SharedRequestSide | null;
}

/** The mediator's thread for this request: its own, or the ask thread it shares. */
export function isMediatorSide(thread: Pick<RequestThread, 'type' | 'shared_side'>): boolean {
  return thread.shared_side === SharedRequestSide.Mediator || thread.type === 'incoming_request';
}

/** The requester's thread for this request: its own, or the goal thread it shares. */
export function isRequesterSide(thread: Pick<RequestThread, 'type' | 'shared_side'>): boolean {
  return thread.shared_side === SharedRequestSide.Requester || thread.type === 'outgoing_request';
}

/** Whether the request only shares this thread — it is a conversation with a life of its own. */
export function isSharedRequestThread(thread: Pick<RequestThread, 'shared_side'>): boolean {
  return (
    thread.shared_side === SharedRequestSide.Mediator ||
    thread.shared_side === SharedRequestSide.Requester
  );
}
