# Bug Report

Bugs found through writing tests for `task-api`. All three were caught by tests asserting correct expected behavior.

---

## Bug 1 — Pagination skips the first page (FIXED)

**File:** `src/services/taskService.js`, line 12

**Expected behavior:**
`GET /tasks?page=1&limit=10` should return the first 10 tasks.

**Actual behavior:**
Returns tasks 11–20, silently skipping the entire first page. Requesting page 1 with limit 10 gives you the same results as page 2 should.

**Root cause:**
```js
// Before (wrong)
const offset = page * limit;   // page=1, limit=10 → offset=10

// After (fix)
const offset = (page - 1) * limit;  // page=1, limit=10 → offset=0
```
The route handler defaults `page` to `1` (one-indexed), but the service was computing the offset as if pages were zero-indexed. The two conventions were never aligned.

**How it was found:**
Writing a test that asserted `page=1` returns the first item in the store. The test failed, returning items starting from index 10 instead of 0.

**Fix applied:** Yes — one-line change in `getPaginated()`.

---

## Bug 2 — `getByStatus` uses substring match instead of exact match

**File:** `src/services/taskService.js`, line 9

**Expected behavior:**
`GET /tasks?status=todo` returns only tasks with status exactly `"todo"`.

**Actual behavior:**
The filter uses `.includes()` (a substring check), so:
- `?status=in` incorrectly returns `in_progress` tasks
- `?status=do` incorrectly returns `done` tasks
- Any partial string can accidentally match unintended statuses

**Root cause:**
```js
// Current (wrong)
tasks.filter((t) => t.status.includes(status))

// Should be
tasks.filter((t) => t.status === status)
```

**How it was found:**
Test queried `?status=in` expecting 0 results (since `"in"` is not a valid status value). Received 1 result — the `in_progress` task.

**Fix:** Change `.includes(status)` to `=== status`. One character change.

**Status:** Not fixed — documented here per the "fix one bug" constraint.

---

## Bug 3 — `completeTask` destroys the task's priority

**File:** `src/services/taskService.js`, line 68–69

**Expected behavior:**
Marking a task complete should update `status` to `"done"` and set `completedAt`. Priority should remain unchanged.

**Actual behavior:**
`completeTask` unconditionally sets `priority: 'medium'`, overwriting whatever the task had before. A `high`-priority task becomes `medium` the moment it's completed.

**Root cause:**
```js
const updated = {
  ...task,
  priority: 'medium',  // always forced — this line should not exist
  status: 'done',
  completedAt: new Date().toISOString(),
};
```

**How it was found:**
Created a `high`-priority task and called `completeTask`. Test asserted `priority` remained `'high'`. It came back as `'medium'`.

**Fix:** Remove the `priority: 'medium'` line from the spread. Let the existing priority survive.

**Status:** Not fixed — documented here per the "fix one bug" constraint.

---

## Summary

| # | Bug | File | Fixed |
|---|-----|------|-------|
| 1 | `getPaginated` offset off-by-one (page=1 skips first page) | `taskService.js:12` | ✅ Yes |
| 2 | `getByStatus` uses substring match instead of exact match | `taskService.js:9` | ❌ No |
| 3 | `completeTask` forces priority to `'medium'` | `taskService.js:68` | ❌ No |

Bugs 2 and 3 each have a failing test in `tests/taskService.test.js` and `tests/tasks.api.test.js` that documents the incorrect behavior. The tests are intentionally left failing to prove the bugs exist.
