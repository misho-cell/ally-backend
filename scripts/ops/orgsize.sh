#!/bin/bash
# How wrong is `orgSizes`, and how many words would change tier if it were
# fixed — measured against the live base, one token at a time.
#
# THE QUESTION. `orgSizes` counts a word with LIKE '%word%', a SUBSTRING, and
# the target engine reads that count through three absolute tiers:
#
#   org_size <= 3    this person IS that company        (TINY_ORG_SIZE)
#   org_size <= 15   + ranks first, same conclusion     (SMALL_ORG_SIZE)
#   org_size >  50   the word places them in a crowd    (BIG_ORG_SIZE)
#
# A substring count is always >= the whole-word count, so the tiers sit on an
# inflated floor. TASKS.md has carried this row since 15 September with one
# sentence holding it shut: „a full measurement could not be run with ro-sql —
# the most frequent tokens hit a statement timeout. Until that number exists I
# do not touch the engine."
#
# WHAT WAS ACTUALLY TIMING OUT was asking for every token in ONE statement, on
# 8.4 million alias rows. One token costs about 0.25 s in a batch of five,
# because both counts ride the same trigram index — `%word%` is a superset of
# `\mword\M`, which is the identical argument the second-degree pre-filter
# rests on. Three hundred tokens take 73 seconds. The wall was the shape of the
# query, not the size of the base.
#
# THE TWO SAMPLES, and they answer different halves:
#
#   --top    the most-carried tokens. Says how wrong the count is.
#   --rare   tokens seen once or twice in a 0.05% sample. Says how many words
#            CHANGE TIER — and it has to be this sample, because every
#            frequent token is far above 50 on either count and can never
#            cross anything.
#
# WHAT IT CANNOT TELL YOU, stated because the whole row exists over a
# measurement that was not run: this samples the WORDS IN THE BASE, not the
# words the engine actually asks about. The engine only ever asks about org
# words that passed the saver-agreement gate, which is a smaller and different
# set. The percentages here are the right order of magnitude and not a census.
#
# Usage:  ./scripts/ops/orgsize.sh [--top|--rare] [count]
set -euo pipefail

MODE="${1:---rare}"
WANT="${2:-220}"
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

# A LIMIT inside the subquery stops the scan early; a plain GROUP BY over the
# whole table is the thing that times out. TABLESAMPLE for the rare band,
# because physical order is not random and the rare words are the point.
if [ "$MODE" = --top ]; then
  "$HERE/ro.sh" > "$SCRATCH/tokens.json" <<SQL
SELECT token, COUNT(DISTINCT phone) AS n
FROM (
  SELECT phone, unnest(regexp_split_to_array(lower(alias), '[^[:alnum:]]+')) AS token
  FROM (SELECT phone, alias FROM "UserAlias" LIMIT 60000) s
) t
WHERE length(token) >= 3
GROUP BY token
ORDER BY COUNT(DISTINCT phone) DESC
LIMIT $WANT
SQL
else
  "$HERE/ro.sh" > "$SCRATCH/tokens.json" <<SQL
SELECT token, COUNT(*) AS n
FROM (
  SELECT unnest(regexp_split_to_array(lower(alias), '[^[:alnum:]]+')) AS token
  FROM "UserAlias" TABLESAMPLE SYSTEM (0.05)
) t
WHERE length(token) >= 4
GROUP BY token
HAVING COUNT(*) <= 2
ORDER BY random()
LIMIT $WANT
SQL
fi

SCRATCH="$SCRATCH" RO="$HERE/ro.sh" MODE="$MODE" python3 <<'PY'
import json, os, subprocess, sys

scratch, ro_path, mode = os.environ["SCRATCH"], os.environ["RO"], os.environ["MODE"]

payload = json.load(open(f"{scratch}/tokens.json", encoding="utf-8"))
if not payload.get("success"):
    print("could not read the token list:", str(payload.get("error", ""))[:160])
    raise SystemExit(1)
# Only plain alphanumerics go into a regex and a quoted literal. A token we
# cannot ask about safely is skipped and counted, never escaped and guessed at.
words = [r["token"] for r in payload["data"]["rows"]]
asked = [w for w in words if w.isalnum()]
skipped = len(words) - len(asked)

def count(batch):
    sql = " UNION ALL ".join(
        f"SELECT '{w}' AS word,"
        f" COUNT(DISTINCT phone) AS substr,"
        f" COUNT(DISTINCT phone) FILTER (WHERE lower(alias) ~ '\\m{w}\\M') AS whole"
        f' FROM "UserAlias" WHERE lower(alias) LIKE \'%{w}%\''
        for w in batch
    )
    done = subprocess.run([ro_path], input=sql, capture_output=True, text=True, timeout=300)
    return json.loads(done.stdout)

measured, failed = {}, []
BATCH = 5
for i in range(0, len(asked), BATCH):
    chunk = asked[i:i + BATCH]
    answer = count(chunk)
    if not answer.get("success"):
        # One at a time: a batch dies on its slowest member, and the other four
        # are answers we would otherwise throw away.
        for word in chunk:
            one = count([word])
            if one.get("success") and one["data"]["rows"]:
                row = one["data"]["rows"][0]
                measured[word] = (int(row["substr"]), int(row["whole"]))
            else:
                failed.append(word)
        continue
    for row in answer["data"]["rows"]:
        measured[row["word"]] = (int(row["substr"]), int(row["whole"]))

if not measured:
    print("nothing could be measured")
    raise SystemExit(1)

TIERS = (("tiny  (3)", 3), ("small (15)", 15), ("big   (50)", 50))
ratios = sorted((w / s if s else 1.0) for s, w in measured.values())
n = len(ratios)
print(f"{mode}: {n} tokens measured"
      + (f", {len(failed)} COULD NOT BE MEASURED ({', '.join(failed[:6])})" if failed else "")
      + (f", {skipped} skipped as not plain alphanumeric" if skipped else ""))
print(f"whole-word / substring:  p10 {ratios[n // 10]:.2f}   median {ratios[n // 2]:.2f}"
      f"   p90 {ratios[9 * n // 10]:.2f}")
print()
for name, bound in TIERS:
    crossing = [(w, s, ww) for w, (s, ww) in measured.items() if s > bound >= ww]
    print(f"cross {name}: {len(crossing):>3} of {n}  ({100 * len(crossing) / n:.0f}%)")
    for word, s, ww in sorted(crossing, key=lambda x: -x[1])[:5]:
        print(f"      {word:<20} {s:>8} -> {ww:>6}")
print()
print("Substring >= whole word always, so every crossing moves the same way:")
print("DOWN. Fixing the count makes `runsIt` MORE likely and")
print("`in_big_organisation` LESS likely. Which error is worse is the decision.")
PY
