#!/usr/bin/env python3
"""Disable one guard at a time, run the whole suite, see if anything notices.

A GUARD WHOSE REMOVAL BREAKS NOTHING IS A GUARD NOTHING HOLDS IN PLACE.

This lived in a scratch directory for a day and found fourteen untested guards
in that day — more than any other thing tried here — so it belongs in the
repository rather than in /tmp, where the next container takes it.

WHAT IT KEEPS FINDING, and it is one shape every time: THE PIECE IS TESTED FROM
EVERY ANGLE AND THE WIRE THAT CALLS IT IS NOT. A unit test reaches for a
function by name, so it cannot notice the day nothing reaches for it.
`isBlockedFetchHost` had ten tests and its call site had none. The stop
predicate had nine and its call site had none. That is not a gap in anybody's
diligence; it is a thing test suites structurally cannot see, and this is how
you look at it.

TWO MUTATIONS, because the single-line sweep cannot reach a block:

    line    `if (cond) return x;`   ->  commented out entirely
    block   `if (cond) {`           ->  `if (false) {`

Both always compile, and both mean exactly „this guard never fires".

THE HARM FILTER IS NOT OPTIONAL. Without it the sweep returns a hundred
defensive null checks that need no test and drowns the two that matter. A guard
is worth an hour of somebody's attention only if its absence could hurt
somebody — so the line has to mention a person, a permission, a boundary or
money.

IT RUNS IN A GIT WORKTREE, NOT IN YOUR CHECKOUT. It edits source files and puts
them back; a crash halfway through would otherwise leave a sabotaged line in a
tree somebody is about to commit. Ask it to make one:

    git worktree add -f --detach /tmp/sabotage HEAD
    ln -s "$PWD/node_modules" /tmp/sabotage/node_modules
    SABOTAGE_ROOT=/tmp/sabotage python3 scripts/ops/sabotage.py

    # a subset, and the mutation:
    SABOTAGE_ROOT=/tmp/sabotage SABOTAGE_MODE=block \\
      python3 scripts/ops/sabotage.py src/api/routes

AND READ THE OUTPUT TO A FILE, NOT THROUGH `tail`. Piping this through `tail`
throws away the per-candidate lines and the head of the result, which is how a
sweep of 127 came back as „60 survivors" with no way to tell how many were
held. Learned the expensive way, 22 September.
"""
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(os.environ.get('SABOTAGE_ROOT', '.')).resolve()
MODE = os.environ.get('SABOTAGE_MODE', 'line')
START = int(os.environ.get('SABOTAGE_START', '1'))
SUITE_TIMEOUT_S = int(os.environ.get('SABOTAGE_TIMEOUT', '300'))

# A guard is only interesting if its absence could hurt somebody. Defensive
# null checks are not the hunt.
HARM = re.compile(
    r'block|opt_?out|optOut|deceased|consent|permission|approved|approv|'
    r'\bcap\b|budget|limit|redact|phone|token|safe|moderat|owner|drain|'
    r'exclud|stop|member|allow|denied|forbid',
    re.I,
)

SINGLE_LINE = re.compile(r'^(\s*)if \(.*\) (return|throw|continue)\b.*;\s*$')
BLOCK_OPEN = re.compile(r'^(\s*)if \((.+)\) \{\s*$')

DEFAULT_TARGETS = ['src/services', 'src/api']


def pattern():
    return SINGLE_LINE if MODE == 'line' else BLOCK_OPEN


def mutate(line: str) -> str:
    if MODE == 'line':
        return '// SABOTAGE ' + line
    m = BLOCK_OPEN.match(line.rstrip('\n'))
    assert m is not None
    return f'{m.group(1)}if (false) {{ // SABOTAGE was: {m.group(2)[:70]}\n'


def candidates():
    found = []
    for target in sys.argv[1:] or DEFAULT_TARGETS:
        base = ROOT / target
        files = sorted(base.rglob('*.ts')) if base.is_dir() else [base]
        for f in files:
            if '__tests__' in str(f) or f.name.endswith('.test.ts'):
                continue
            for i, line in enumerate(f.read_text().splitlines()):
                if pattern().match(line) and HARM.search(line):
                    found.append((f, i, line))
    return found


def suite_passes() -> bool:
    try:
        r = subprocess.run(
            ['npx', 'jest', '--silent', '--ci'],
            cwd=ROOT, capture_output=True, text=True, timeout=SUITE_TIMEOUT_S,
        )
        return r.returncode == 0
    except subprocess.TimeoutExpired:
        # A mutation that hangs the suite is a mutation something noticed.
        return False


def main() -> None:
    if ROOT == Path.cwd():
        print('REFUSING: run this in a worktree, not in your checkout — see the', file=sys.stderr)
        print('  module docstring. Set SABOTAGE_ROOT.', file=sys.stderr)
        raise SystemExit(2)

    cands = candidates()
    print(f'{len(cands)} guards to sabotage, mode={MODE}, root={ROOT}', flush=True)
    survivors = []
    for n, (f, i, line) in enumerate(cands, 1):
        if n < START:
            continue
        original = f.read_text()
        lines = original.splitlines(keepends=True)
        lines[i] = mutate(lines[i])
        f.write_text(''.join(lines))
        try:
            unnoticed = suite_passes()
        finally:
            # ALWAYS, including on a crash in the line above. A sabotaged file
            # left behind is worse than no sweep.
            f.write_text(original)
        rel = f.relative_to(ROOT)
        print(
            f'[{n}/{len(cands)}] {"UNNOTICED" if unnoticed else "held    "} '
            f'{rel}:{i + 1}  {line.strip()[:110]}',
            flush=True,
        )
        if unnoticed:
            survivors.append((rel, i + 1, line.strip()))

    print(f'\n=== {len(survivors)} GUARDS NOTHING HOLDS ===', flush=True)
    for rel, ln, line in survivors:
        print(f'{rel}:{ln}  {line[:130]}')
    print(
        '\nMost of these are empty-collection checks that need no test. Read for '
        'the ones whose absence reaches a person.',
    )


if __name__ == '__main__':
    main()
