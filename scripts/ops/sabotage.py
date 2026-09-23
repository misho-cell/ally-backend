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

IT REFUSES TO START ON A DIRTY WORKTREE, and that is not fussiness. The
`finally` that restores a file cannot run when the process is SIGKILLed — a
backgrounded run was killed that way on 23 September and left a guard commented
out. A sweep starting on top of that measures 185 mutations against a tree that
is already missing one, and calls the survivors „held". Read what is dirty,
then `git -C $SABOTAGE_ROOT checkout -- .`.

DO NOT BACKGROUND IT WITH `&` OR `nohup` inside a tool call that then exits:
that is exactly how the kill above happened. Give it its own long-running
process.

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
#
# `busy|holder|lock` added 23 September, for a reason worth keeping: row 101's
# two concurrency guards — a wake refusing a thread a live run already owns —
# are the ones that let eight messages reach three real people twice, and
# neither word in `if (threadHolder(thread.id) !== undefined) return 'busy';`
# was in this list. A filter that cannot see the guard behind the worst
# outbound duplicate we have had is a filter with a hole in it.
HARM = re.compile(
    r'block|opt_?out|optOut|deceased|consent|permission|approved|approv|'
    r'\bcap\b|budget|limit|redact|phone|token|safe|moderat|owner|drain|'
    r'exclud|stop|member|allow|denied|forbid|busy|holder|lock',
    re.I,
)

# A TRAILING COMMENT USED TO HIDE A GUARD COMPLETELY, and the same two lines
# found it. `if (thread.status === 'working') return 'busy'; // a live run owns
# the thread right now` did not end in `;`, so the sweep never offered it —
# a guard explained in place is exactly the kind most worth testing, and the
# explanation was what made it invisible. `(?:\s*//.*)?` is the whole fix.
SINGLE_LINE = re.compile(r'^(\s*)if \(.*\) (return|throw|continue)\b.*;(?:\s*//.*)?\s*$')
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


def dirty_files() -> list[str]:
    """Anything modified in the worktree, node_modules aside."""
    r = subprocess.run(
        ['git', 'status', '--porcelain'], cwd=ROOT, capture_output=True, text=True,
    )
    return [
        ln for ln in r.stdout.splitlines()
        if ln.strip() and 'node_modules' not in ln and '.sabotage.pid' not in ln
    ]


def another_sweep_is_running() -> int | None:
    """The pid of a live sweep holding this worktree, or None."""
    lock = ROOT / '.sabotage.pid'
    try:
        pid = int(lock.read_text().strip())
    except (OSError, ValueError):
        return None
    try:
        os.kill(pid, 0)  # signal 0 asks „does this process exist", kills nothing
    except OSError:
        return None  # stale lock from a run that died
    return pid


def main() -> None:
    if ROOT == Path.cwd():
        print('REFUSING: run this in a worktree, not in your checkout — see the', file=sys.stderr)
        print('  module docstring. Set SABOTAGE_ROOT.', file=sys.stderr)
        raise SystemExit(2)

    # TWO SWEEPS ON ONE WORKTREE PRODUCE TWO SETS OF LIES, and that is the
    # second thing 23 September taught.
    #
    # A backgrounded run looked dead — the wrapper around it reported „exit
    # code 0" — and was not. A second sweep was started on the same worktree
    # and the two mutated the same files in step with each other for half an
    # hour. Every „held" either of them printed could have been the OTHER one's
    # mutation being caught, and both runs went in the bin.
    #
    # The dirty check above cannot see this: at the instant a sweep starts, the
    # other one is usually between mutations and the tree is clean. So the lock
    # is a separate question from the tree's state, and it asks the operating
    # system rather than the filesystem: signal 0 says whether that pid is
    # still alive, so a lock left by a killed run does not block anybody.
    running = another_sweep_is_running()
    if running is not None:
        print(f'REFUSING: sweep pid {running} is already working in {ROOT}.', file=sys.stderr)
        print('  Two sweeps on one worktree mutate the same files and every', file=sys.stderr)
        print('  verdict either prints is worthless. Wait for it, or give this', file=sys.stderr)
        print('  run a worktree of its own.', file=sys.stderr)
        raise SystemExit(4)

    # A DIRTY WORKTREE MAKES EVERY RESULT BELOW A LIE, and 23 September is how
    # that was learned.
    #
    # The `finally` that puts a file back cannot run when the process is
    # SIGKILLed, and a backgrounded sweep was killed exactly that way. It left
    # `if (isBlocked…)` commented out in one file — so the next sweep would
    # have run all 185 of its mutations against a tree that ALREADY had a guard
    # missing, and reported „held" for anything the suite still caught.
    #
    # The worktree is what kept that out of the checkout, which is what it is
    # for. This is the other half: a run that starts on top of a previous run's
    # corpse cannot be trusted, so it does not start. `git -C <root> checkout
    # -- .` is the whole fix and the operator should see what they are
    # discarding before they run it.
    dirty = dirty_files()
    if dirty:
        print(f'REFUSING: {ROOT} has uncommitted changes, so a previous sweep may', file=sys.stderr)
        print('  have died before restoring a file. Every verdict below would be', file=sys.stderr)
        print('  measured against a tree that is already missing a guard.', file=sys.stderr)
        for ln in dirty[:20]:
            print(f'    {ln}', file=sys.stderr)
        print(f'  Read them, then: git -C {ROOT} checkout -- .', file=sys.stderr)
        raise SystemExit(3)

    lock = ROOT / '.sabotage.pid'
    lock.write_text(str(os.getpid()))
    try:
        sweep()
    finally:
        # Best effort: a SIGKILL takes this with it, which is why the check
        # above asks the OS whether the pid is alive rather than trusting the
        # file's existence.
        lock.unlink(missing_ok=True)


def sweep() -> None:
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
