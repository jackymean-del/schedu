# Working in this repo

> **How to load this.** These are the house rules for this codebase. They used
> to sit in a file named for the coding assistant, which meant the assistant
> read them automatically at the start of every session. That name is gone from
> this project by choice, so the automatic load is gone with it: point your
> assistant at this file at the start of a session, or ask it to read
> `SCHEDU.md` before it touches anything. The no-em-dash rule below is also
> enforced mechanically by `frontend/style-verify.mts`, so that one survives
> whether anybody reads this or not.


## Writing

**Never write an em dash.** That is the long dash at Unicode U+2014, the one a
word processor auto-inserts for a parenthetical break. Use a plain hyphen `-`.

This applies to everything: user-visible copy, code comments, doc-comments,
markdown, and commit messages.

**Why it matters here.** The em dash is one of the strongest surface tells that
a passage was machine-written, and this product's whole market position is
"built on Human Intelligence, not black-box AI". Prose studded with em dashes
undercuts that claim on the very page making it. The marketing site was already
describing itself as an AI product to Google because the copy said so; this is
the same problem one layer down.

Where an em dash would feel natural, a comma, a colon or a full stop is usually
the better sentence. The hyphen is the fallback, not the target.

**EN dashes (`-`, U+2013) are a different character and are allowed.** There are
about 500 of them, in ranges like an academic year or a period's start and end
time, where they are typographically correct. Do not flatten them.

Enforced by `frontend/style-verify.mts`, which scans the whole repo and fails on
any em dash. `marketing/content-verify.mts` also covers the marketing source.
Both hold the character by code point so the guard does not contain the thing it
forbids.

## Verifying a change

There is no test framework. Correctness lives in harnesses run with `npx tsx`
from `frontend/`, and all of them must pass before a change is considered done:

```
engine-full-verify      engine-quality-verify   engine-stress-verify
or-choice-verify        or-day-verify           roster-verify
blueprint-verify        snapshot-fields-verify  combo-verify
derive-alloc-verify     dispersal-verify        norms-verify
reopt-verify            bell-verify             bell-ringer-verify
mps-test                style-verify            alloc-verify
preflight-verify        orphan-repair-verify    class-teacher-verify
unavailability-verify
```

**Measure correctness against what the school decided, not against the
engine's own inputs.** The wrong-teacher check passed for months while 55 of
a school's 165 lessons went to teachers the Allocation step had not chosen,
because it compared the output with the same flat subject list the solver
read. `alloc-verify` checks against the allocation matrix, and checks the
plumbing that delivers it: an engine comment promising "teacher assigned via
matrix" meant nothing while no caller passed the matrix in.

Plus `npx tsc -b`, `npx eslint src` (0 errors; ~97 advisory warnings are
expected), `npx vite build`, and in `backend/`, `go build ./... && go vet ./...
&& go test ./...`.

**When you add a guard, run it.** A check written the week before was found
failing unnoticed because nobody had run it since. A rule nothing checks is a
rule that comes back.

**Guard the pattern, not the instance.** Several harnesses here fail on the
*next* occurrence of a bug family rather than the last one: no file may define
its own "who teaches this cell" helper, no file outside `lib/orChoice` may
re-derive OR versus AND, no file may compute a period's clock time without the
bell. Prefer that shape over a check written around the line you just fixed.
