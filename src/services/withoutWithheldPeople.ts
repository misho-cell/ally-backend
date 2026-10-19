/**
 * #1694 (the tester's 68935): a search result with the people a run must not
 * show taken out — a person found, or a contact who would be asked to pass
 * the question on. Silently, as everywhere else a boundary acts on a search:
 * the asker never learns the boundary exists.
 *
 * A second-circle row is kept while one of its bridges remains; the bridge
 * summary loses the withheld bridges too. Rows and fields this does not know
 * are left as they were.
 */
interface ShownBridge {
  readonly phone?: unknown;
}

interface ShownRow {
  readonly phone?: unknown;
  readonly target_phone?: unknown;
  readonly firstLinkPhone?: unknown;
  readonly via_contacts?: unknown;
}

function digits(phone: unknown): string {
  return typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
}

function isWithheld(phone: unknown, withheld: ReadonlySet<string>): boolean {
  const d = digits(phone);
  return d !== '' && withheld.has(d);
}

function bridgesKept(bridges: unknown, withheld: ReadonlySet<string>): unknown {
  if (!Array.isArray(bridges)) return bridges;
  const kept = bridges.filter((b: ShownBridge) => !isWithheld(b?.phone, withheld));
  return kept.length === bridges.length ? bridges : kept;
}

function rowKept(row: ShownRow, withheld: ReadonlySet<string>): ShownRow | null {
  if (
    isWithheld(row?.phone, withheld) ||
    isWithheld(row?.target_phone, withheld) ||
    isWithheld(row?.firstLinkPhone, withheld)
  ) {
    return null;
  }
  if (!Array.isArray(row?.via_contacts) || row.via_contacts.length === 0) return row;
  const via = bridgesKept(row.via_contacts, withheld) as unknown[];
  if (via === row.via_contacts) return row;
  return via.length === 0 ? null : { ...row, via_contacts: via };
}

function rowsKept(
  rows: unknown,
  withheld: ReadonlySet<string>,
): { readonly rows: unknown; readonly changed: boolean } {
  if (!Array.isArray(rows)) return { rows, changed: false };
  const mapped = (rows as ShownRow[]).map((row) => rowKept(row, withheld));
  const changed = mapped.some((row, i) => row !== rows[i]);
  return { rows: changed ? mapped.filter((row) => row !== null) : rows, changed };
}

/** The result as the run may see it; the same object when nothing is withheld. */
export function withoutWithheldPeople<T extends object>(
  result: T,
  withheld: ReadonlySet<string>,
): T {
  if (withheld.size === 0) return result;
  const shown = result as {
    results?: unknown;
    further_out?: unknown;
    bridges?: unknown;
    count?: unknown;
  };
  const results = rowsKept(shown.results, withheld);
  const furtherOut = rowsKept(shown.further_out, withheld);
  const bridges = bridgesKept(shown.bridges, withheld);
  if (!results.changed && !furtherOut.changed && bridges === shown.bridges) return result;
  const kept = Array.isArray(results.rows) ? results.rows.length : null;
  return {
    ...result,
    ...(results.changed && { results: results.rows }),
    ...(furtherOut.changed && { further_out: furtherOut.rows }),
    ...(bridges !== shown.bridges && { bridges }),
    ...(kept !== null && typeof shown.count === 'number' && { count: kept }),
    ...(results.changed && kept === 0 && 'found' in result && { found: false }),
  };
}
