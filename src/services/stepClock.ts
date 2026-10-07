/**
 * #958: a run's steps before the model is called, each with the milliseconds
 * since the run started — so a slow start names its slow step instead of
 * showing one total.
 */
export interface StepClock {
  /** Notes that the step just finished. */
  mark(label: string): void;
  /** Notes when this piece of work finishes; work that runs beside others keeps its own time. */
  timed<T>(label: string, work: Promise<T>): Promise<T>;
  /** The steps in the order they finished, e.g. „thread 40, goal 900, prompt 1510". */
  line(): string;
}

export function stepClock(startedAt: number, now: () => number = Date.now): StepClock {
  const marks: { readonly label: string; readonly at: number }[] = [];
  const mark = (label: string): void => {
    marks.push({ label, at: now() - startedAt });
  };
  return {
    mark,
    timed: async <T>(label: string, work: Promise<T>): Promise<T> => {
      try {
        return await work;
      } finally {
        mark(label);
      }
    },
    line: (): string =>
      [...marks]
        .sort((a, b) => a.at - b.at)
        .map((m) => `${m.label} ${m.at}`)
        .join(', '),
  };
}
