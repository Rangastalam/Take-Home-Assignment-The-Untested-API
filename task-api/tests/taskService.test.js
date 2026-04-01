const taskService = require('../src/services/taskService');

beforeEach(() => {
  taskService._reset();
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------
describe('create', () => {
  // basic creation with just a title
  test('creates a task with the provided title', () => {
    const task = taskService.create({ title: 'Buy milk' });
    expect(task.title).toBe('Buy milk');
  });

  // each task must get a unique id
  test('assigns a unique uuid to each task', () => {
    const a = taskService.create({ title: 'A' });
    const b = taskService.create({ title: 'B' });
    expect(typeof a.id).toBe('string');
    expect(a.id).not.toBe(b.id);
  });

  // defaults should kick in when optional fields are omitted
  test('defaults status to "todo"', () => {
    const task = taskService.create({ title: 'T' });
    expect(task.status).toBe('todo');
  });

  test('defaults priority to "medium"', () => {
    const task = taskService.create({ title: 'T' });
    expect(task.priority).toBe('medium');
  });

  test('defaults description to empty string', () => {
    const task = taskService.create({ title: 'T' });
    expect(task.description).toBe('');
  });

  test('defaults dueDate to null', () => {
    const task = taskService.create({ title: 'T' });
    expect(task.dueDate).toBeNull();
  });

  test('defaults completedAt to null', () => {
    const task = taskService.create({ title: 'T' });
    expect(task.completedAt).toBeNull();
  });

  // createdAt should be a real date, not garbage
  test('sets createdAt to a valid ISO date string', () => {
    const task = taskService.create({ title: 'T' });
    expect(typeof task.createdAt).toBe('string');
    expect(isNaN(Date.parse(task.createdAt))).toBe(false);
  });

  // all optional fields can be passed and should be stored as-is
  test('accepts and stores all optional fields', () => {
    const task = taskService.create({
      title: 'T',
      description: 'some desc',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2025-12-31T00:00:00.000Z',
    });
    expect(task.description).toBe('some desc');
    expect(task.status).toBe('in_progress');
    expect(task.priority).toBe('high');
    expect(task.dueDate).toBe('2025-12-31T00:00:00.000Z');
  });

  // task should actually land in the store after creation
  test('persists the task so it can be retrieved later', () => {
    const created = taskService.create({ title: 'Persist me' });
    expect(taskService.findById(created.id)).toBeDefined();
  });

  // new tasks start with assignee as null (no one assigned yet)
  test('initializes assignee as null', () => {
    const task = taskService.create({ title: 'T' });
    expect(task.assignee).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getAll
// ---------------------------------------------------------------------------
describe('getAll', () => {
  // no tasks yet, should be empty
  test('returns an empty array when store is empty', () => {
    expect(taskService.getAll()).toEqual([]);
  });

  // should reflect everything that was created
  test('returns all created tasks', () => {
    taskService.create({ title: 'A' });
    taskService.create({ title: 'B' });
    expect(taskService.getAll()).toHaveLength(2);
  });

  // pushing to the returned array should not pollute the internal store
  test('returns a copy, not a live reference to internal state', () => {
    taskService.create({ title: 'A' });
    const all = taskService.getAll();
    all.push({ id: 'injected' });
    expect(taskService.getAll()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// findById
// ---------------------------------------------------------------------------
describe('findById', () => {
  // happy path
  test('finds the task with the matching id', () => {
    const task = taskService.create({ title: 'Find me' });
    const found = taskService.findById(task.id);
    expect(found).toMatchObject({ title: 'Find me' });
  });

  // asking for something that doesn't exist
  test('returns undefined for a non-existent id', () => {
    expect(taskService.findById('nope')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getByStatus
// ---------------------------------------------------------------------------
describe('getByStatus', () => {
  beforeEach(() => {
    taskService.create({ title: 'A', status: 'todo' });
    taskService.create({ title: 'B', status: 'in_progress' });
    taskService.create({ title: 'C', status: 'done' });
  });

  // basic filter
  test('returns only tasks with the given status', () => {
    const results = taskService.getByStatus('todo');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('A');
  });

  // nothing should come back for a status that doesn't exist
  test('returns empty array when no tasks match the status', () => {
    expect(taskService.getByStatus('unknown')).toHaveLength(0);
  });

  // make sure we're not leaking other statuses into the result
  test('does not include tasks with a different status', () => {
    const results = taskService.getByStatus('todo');
    const titles = results.map((t) => t.title);
    expect(titles).not.toContain('B');
    expect(titles).not.toContain('C');
  });

  /**
   * BUG — getByStatus uses .includes() (substring match) instead of ===
   * "in_progress".includes("in") is true, so querying for "in" incorrectly
   * returns in_progress tasks. This should return nothing.
   */
  test('does not match tasks whose status merely contains the search string', () => {
    const results = taskService.getByStatus('in');
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getPaginated
// ---------------------------------------------------------------------------
describe('getPaginated', () => {
  beforeEach(() => {
    for (let i = 1; i <= 15; i++) {
      taskService.create({ title: `Task ${i}` });
    }
  });

  /**
   * BUG — getPaginated uses offset = page * limit (zero-indexed math),
   * but the route handler defaults page to 1 (one-indexed).
   * So getPaginated(1, 10) gives offset=10, silently skipping the first 10 tasks.
   * Fix: use (page - 1) * limit so page=1 starts at offset 0.
   */
  test('page=1 returns the FIRST set of tasks (not the second)', () => {
    const results = taskService.getPaginated(1, 10);
    expect(results).toHaveLength(10);
    expect(results[0].title).toBe('Task 1');
  });

  // page 2 should pick up right after page 1
  test('page=2 returns the next batch', () => {
    const results = taskService.getPaginated(2, 10);
    expect(results).toHaveLength(5);
    expect(results[0].title).toBe('Task 11');
  });

  // limit should be respected
  test('respects the limit parameter', () => {
    const results = taskService.getPaginated(1, 5);
    expect(results).toHaveLength(5);
    expect(results[0].title).toBe('Task 1');
  });

  // page way beyond the data should come back empty, not error
  test('returns empty array when page is beyond available data', () => {
    expect(taskService.getPaginated(100, 10)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getStats
// ---------------------------------------------------------------------------
describe('getStats', () => {
  // empty store = all zeros
  test('returns all zeros when no tasks exist', () => {
    expect(taskService.getStats()).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  // counts should map to the right status buckets
  test('counts tasks by status correctly', () => {
    taskService.create({ title: 'A', status: 'todo' });
    taskService.create({ title: 'B', status: 'todo' });
    taskService.create({ title: 'C', status: 'in_progress' });
    taskService.create({ title: 'D', status: 'done' });

    const stats = taskService.getStats();
    expect(stats.todo).toBe(2);
    expect(stats.in_progress).toBe(1);
    expect(stats.done).toBe(1);
  });

  // a non-done task with a past dueDate is overdue
  test('counts overdue tasks (non-done with past dueDate)', () => {
    taskService.create({ title: 'Late', status: 'todo', dueDate: '2000-01-01T00:00:00.000Z' });
    taskService.create({ title: 'Future', status: 'todo', dueDate: '2099-01-01T00:00:00.000Z' });
    expect(taskService.getStats().overdue).toBe(1);
  });

  // done tasks should never be considered overdue, even if past due
  test('does not count done tasks as overdue', () => {
    taskService.create({ title: 'Done late', status: 'done', dueDate: '2000-01-01T00:00:00.000Z' });
    expect(taskService.getStats().overdue).toBe(0);
  });

  // no dueDate means it can't be overdue
  test('does not count tasks without a dueDate as overdue', () => {
    taskService.create({ title: 'No due', status: 'todo' });
    expect(taskService.getStats().overdue).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------
describe('update', () => {
  // basic field update
  test('updates the specified field and returns the task', () => {
    const task = taskService.create({ title: 'Old' });
    const updated = taskService.update(task.id, { title: 'New' });
    expect(updated.title).toBe('New');
  });

  // fields not in the patch should survive
  test('preserves fields that were not included in the update', () => {
    const task = taskService.create({ title: 'T', priority: 'high' });
    const updated = taskService.update(task.id, { title: 'Updated' });
    expect(updated.priority).toBe('high');
    expect(updated.id).toBe(task.id);
  });

  // updating a ghost task should signal failure
  test('returns null when the task does not exist', () => {
    expect(taskService.update('ghost', { title: 'X' })).toBeNull();
  });

  // update should stick on subsequent reads
  test('persists the update in the store', () => {
    const task = taskService.create({ title: 'Old' });
    taskService.update(task.id, { status: 'done' });
    expect(taskService.findById(task.id).status).toBe('done');
  });
});

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------
describe('remove', () => {
  // successful delete returns true
  test('removes the task and returns true', () => {
    const task = taskService.create({ title: 'Bye' });
    expect(taskService.remove(task.id)).toBe(true);
    expect(taskService.findById(task.id)).toBeUndefined();
  });

  // trying to delete something that's not there
  test('returns false when the task does not exist', () => {
    expect(taskService.remove('ghost')).toBe(false);
  });

  // store should shrink by 1
  test('reduces task count by one', () => {
    taskService.create({ title: 'A' });
    const task = taskService.create({ title: 'B' });
    taskService.remove(task.id);
    expect(taskService.getAll()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// completeTask
// ---------------------------------------------------------------------------
describe('completeTask', () => {
  // status must flip to done
  test('sets status to "done"', () => {
    const task = taskService.create({ title: 'T' });
    expect(taskService.completeTask(task.id).status).toBe('done');
  });

  // completedAt should become a real date
  test('sets completedAt to a valid ISO date string', () => {
    const task = taskService.create({ title: 'T' });
    const completed = taskService.completeTask(task.id);
    expect(typeof completed.completedAt).toBe('string');
    expect(isNaN(Date.parse(completed.completedAt))).toBe(false);
  });

  // task not found should return null, not throw
  test('returns null for a non-existent task', () => {
    expect(taskService.completeTask('ghost')).toBeNull();
  });

  // should be visible on a fresh read
  test('persists the completed state in the store', () => {
    const task = taskService.create({ title: 'T' });
    taskService.completeTask(task.id);
    expect(taskService.findById(task.id).status).toBe('done');
  });

  /**
   * BUG — completeTask always forces priority to 'medium'.
   * A high-priority task shouldn't lose its urgency just because it got completed.
   * completedAt and status are the only fields that should change.
   */
  test('preserves the original priority instead of forcing it to "medium"', () => {
    const task = taskService.create({ title: 'Urgent', priority: 'high' });
    const completed = taskService.completeTask(task.id);
    expect(completed.priority).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// assign (new feature)
// ---------------------------------------------------------------------------
describe('assign', () => {
  // basic assign
  test('sets the assignee on the task and returns updated task', () => {
    const task = taskService.create({ title: 'T' });
    const result = taskService.assign(task.id, 'Alice');
    expect(result.assignee).toBe('Alice');
  });

  // assigning a ghost task
  test('returns null when the task does not exist', () => {
    expect(taskService.assign('ghost', 'Alice')).toBeNull();
  });

  // assignee should persist
  test('persists the assignee in the store', () => {
    const task = taskService.create({ title: 'T' });
    taskService.assign(task.id, 'Bob');
    expect(taskService.findById(task.id).assignee).toBe('Bob');
  });

  // re-assigning should just overwrite
  test('allows re-assigning to a different person', () => {
    const task = taskService.create({ title: 'T' });
    taskService.assign(task.id, 'Alice');
    const result = taskService.assign(task.id, 'Bob');
    expect(result.assignee).toBe('Bob');
  });

  // assign should only touch the assignee field
  test('does not mutate other task fields when assigning', () => {
    const task = taskService.create({ title: 'Keep', priority: 'high', status: 'in_progress' });
    const result = taskService.assign(task.id, 'Charlie');
    expect(result.title).toBe('Keep');
    expect(result.priority).toBe('high');
    expect(result.status).toBe('in_progress');
  });
});
