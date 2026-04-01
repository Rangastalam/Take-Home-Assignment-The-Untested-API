# Submission Notes

## What I'd test next with more time

- **Concurrency edge cases** — the in-memory store is a plain array with no locking. Two simultaneous requests that both call `remove` or `update` on the same task could race. Worth testing with parallel requests once a real data layer is in place.
- **The error-handling middleware in `app.js`** — it's currently unreachable because no route calls `next(err)`. I'd write a test that forces an unexpected error to verify the 500 handler actually fires.
- **`validateUpdateTask` with an empty body** — sending `PUT /tasks/:id` with `{}` passes validation and merges nothing, which is silently a no-op. That might be fine, but it's worth a deliberate decision and a test.
- **Stats accuracy under rapid state changes** — create a task, complete it, then check stats. Making sure `overdue` and status counts stay consistent across lifecycle transitions.

## What surprised me

The pagination bug surprised me the most — not that it existed, but that it was invisible without tests. The code looks completely reasonable at a glance (`page * limit` reads fine), and the route handler even has a sensible default. It's only when you put the two files side by side and trace through a real call that the mismatch shows up. It's a good example of why integration tests catch things unit tests miss.

Also surprised by `completeTask` forcing `priority: 'medium'`. It's not obviously wrong — you could argue completed tasks don't need urgency markers — but it's also not documented anywhere. A silent data change with no explanation is the kind of thing that causes a confused bug report six months later.

## Questions before shipping to production

- **No persistence** — data resets on every restart. Is that intentional for this phase, or is a database coming? The answer changes a lot about what's safe to deploy.
- **No authentication** — anyone can create, update, or delete any task. Is this behind a gateway or internal network, or does it need auth before going live?
- **Who owns a task?** — the new `assignee` field is a free-text name string. If this grows into a real multi-user system, we'd want assignee to be a user ID, not a display name, so it stays consistent when names change.
- **What's the intended pagination behavior for `page=0`?** — currently it returns tasks 1–10 (offset becomes -10, `slice` clamps to 0). It works by accident but isn't validated. Should `page=0` be a 400?
