import { query } from '../db/postgres/client';
import { closedRouteFor, CLOSED_ROUTE_LINE, CLOSED_ROUTE_ON } from './closedRoute';
import { receiverInBridgesBook } from './tools/requestIntroduction';

/**
 * BF (1697; §128, Misho's „ყველა კი", 11 Oct): the closed-route check ran only
 * when an introduction was requested — after the owner had already approved a
 * plan whose route could never answer. A plan route may now say which
 * introduction it means; the check runs on that pair before the plan is shown,
 * and a closed route comes back with the §110.1 line, so it never reaches the
 * card. Routes without the field behave as before.
 */
const QUERY_TIMEOUT_MS = 4_000;

/** NIGHT_QUESTIONS BF, the approved field description (§128). */
export const INTRODUCTION_FIELD_DESCRIPTION =
  "introduction — only for a route that asks one of the user's contacts to introduce them to someone. via_phone: that contact's phone id from a search result. to_name: the person to meet, as the user named them; to_phone: their phone id too, when a search returned it.";

export interface RouteIntroduction {
  readonly routeName: string;
  readonly viaPhone: string;
  readonly toName: string;
  readonly toPhone?: string;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** The plan's routes that name an introduction, read defensively from the model's input. */
export function routeIntroductions(plan: unknown): RouteIntroduction[] {
  const routes = (plan as { routes?: unknown } | null)?.routes;
  if (!Array.isArray(routes)) return [];
  return routes.flatMap((route: unknown) => {
    const intro = (route as { introduction?: unknown } | null)?.introduction as
      | Record<string, unknown>
      | undefined;
    const viaPhone = asText(intro?.['via_phone']);
    const toName = asText(intro?.['to_name']);
    if (viaPhone === '' || toName === '') return [];
    const toPhone = asText(intro?.['to_phone']);
    return [
      {
        routeName: asText((route as { name?: unknown }).name),
        viaPhone,
        toName,
        ...(toPhone !== '' && { toPhone }),
      },
    ];
  });
}

async function memberIdForPhone(phone: string): Promise<string | null> {
  const result = await query<{ user_id: number }>(
    `SELECT "userId" AS user_id FROM "UserPhone"
      WHERE regexp_replace(phone, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')
      LIMIT 1`,
    [phone],
    QUERY_TIMEOUT_MS,
  );
  const id = result.rows[0]?.user_id;
  return id === undefined ? null : String(id);
}

/** Is this one introduction a closed route? False whenever anything is unknown. */
async function introductionIsClosed(taskId: number, intro: RouteIntroduction): Promise<boolean> {
  let receiver = intro.toPhone;
  if (receiver === undefined) {
    const bridgeId = await memberIdForPhone(intro.viaPhone).catch(() => null);
    if (bridgeId === null) return false;
    receiver = await receiverInBridgesBook(bridgeId, intro.toName);
  }
  return closedRouteFor(taskId, intro.viaPhone, receiver);
}

export interface ClosedPlanRoute {
  readonly proposed: false;
  readonly closed_route: string;
  readonly error: string;
}

/** The refusal for the first closed route in the plan, or null when none is closed. */
export async function closedPlanRoute(
  taskId: number,
  plan: unknown,
): Promise<ClosedPlanRoute | null> {
  if (!CLOSED_ROUTE_ON || !Number.isFinite(taskId)) return null;
  for (const intro of routeIntroductions(plan)) {
    if (await introductionIsClosed(taskId, intro)) {
      // eslint-disable-next-line no-console
      console.log(
        `[closed-route] goal ${taskId}: plan route „${intro.routeName}" closed — not shown`,
      );
      return { proposed: false, closed_route: intro.routeName, error: CLOSED_ROUTE_LINE };
    }
  }
  return null;
}
