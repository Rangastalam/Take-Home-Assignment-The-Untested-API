const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

beforeEach(() => {
  taskService._reset();
});

// ---------------------------------
// GET /tasks
// ---------------------------------
describe('GET /tasks', () => {
  // nothing in the store yet
  test('returns an empty array when no tasks exist', async () => {
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // should list everything we put in
  test('returns all tasks', async () => {
    taskService.create({ title: 'A' });
    taskService.create({ title: 'B' });
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  // response should have the expected task shape
  test('returned tasks have the expected fields', async () => {
    taskService.create({ title: 'Shape check' });
    const res = await request(app).get('/tasks');
    const task = res.body[0];
    expect(task).toHaveProperty('id');
    expect(task).toHaveProperty('title', 'Shape check');
    expect(task).toHaveProperty('status', 'todo');
    expect(task).toHaveProperty('priority', 'medium');
    expect(task).toHaveProperty('createdAt');
    expect(task).toHaveProperty('assignee', null);
  });
});

// ---------------------------------------
// GET /tasks?status=
// ---------------------------------------
describe('GET /tasks?status=', () => {
  beforeEach(() => {
    taskService.create({ title: 'Todo task', status: 'todo' });
    taskService.create({ title: 'In progress task', status: 'in_progress' });
    taskService.create({ title: 'Done task', status: 'done' });
  });

  // basic status filter
  test('returns only tasks matching the given status', async () => {
    const res = await request(app).get('/tasks?status=todo');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Todo task');
  });

  // a valid status with no matches
  test('returns empty array for a status with no matching tasks', async () => {
    taskService._reset();
    const res = await request(app).get('/tasks?status=done');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  /**
   * BUG — ?status=in returns in_progress tasks because the service uses
   * .includes() instead of strict equality. This should return nothing.
   */
  test('does not return tasks whose status merely contains the search string', async () => {
    const res = await request(app).get('/tasks?status=in');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  // filtering by in_progress should work correctly
  test('returns in_progress tasks when status=in_progress', async () => {
    const res = await request(app).get('/tasks?status=in_progress');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('In progress task');
  });
});

// ------------------------------
// GET /tasks?page=&limit=
// ------------------------------
describe('GET /tasks?page=&limit=', () => {
  beforeEach(() => {
    for (let i = 1; i <= 15; i++) {
      taskService.create({ title: `Task ${i}` });
    }
  });

  /**
   * BUG — page=1 should return the first batch.
   * Current service uses offset = page * limit, so page=1 skips the first 10 items.
   */
  test('page=1 returns the first set of results', async () => {
    const res = await request(app).get('/tasks?page=1&limit=10');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(10);
    expect(res.body[0].title).toBe('Task 1');
  });

  // second page picks up right after the first
  test('page=2 returns the next batch', async () => {
    const res = await request(app).get('/tasks?page=2&limit=10');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
    expect(res.body[0].title).toBe('Task 11');
  });

  // limit controls how many come back
  test('respects the limit parameter', async () => {
    const res = await request(app).get('/tasks?page=1&limit=5');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
  });

  // page beyond data should be graceful, not a crash
  test('returns empty array for a page beyond available data', async () => {
    const res = await request(app).get('/tasks?page=100&limit=10');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ------------------------------
// GET /tasks/stats
// -------------------------------
describe('GET /tasks/stats', () => {
  // empty store
  test('returns all-zero counts when no tasks exist', async () => {
    const res = await request(app).get('/tasks/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  // counts should reflect current store state
  test('returns correct counts per status', async () => {
    taskService.create({ title: 'A', status: 'todo' });
    taskService.create({ title: 'B', status: 'in_progress' });
    taskService.create({ title: 'C', status: 'done' });

    const res = await request(app).get('/tasks/stats');
    expect(res.status).toBe(200);
    expect(res.body.todo).toBe(1);
    expect(res.body.in_progress).toBe(1);
    expect(res.body.done).toBe(1);
  });

  // overdue count should pick up past-due non-done tasks
  test('counts overdue tasks correctly', async () => {
    taskService.create({ title: 'Late', status: 'todo', dueDate: '2000-01-01T00:00:00.000Z' });
    const res = await request(app).get('/tasks/stats');
    expect(res.body.overdue).toBe(1);
  });
});

// ----------------------------
// POST /tasks
// ----------------------------

describe('POST /tasks', () => {
  // happy path — minimal body
  test('creates a task and returns 201 with the task', async () => {
    const res = await request(app).post('/tasks').send({ title: 'New task' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('New task');
    expect(res.body.id).toBeDefined();
  });

  // all defaults should apply
  test('applies default values for omitted fields', async () => {
    const res = await request(app).post('/tasks').send({ title: 'Defaults' });
    expect(res.body.status).toBe('todo');
    expect(res.body.priority).toBe('medium');
    expect(res.body.description).toBe('');
    expect(res.body.dueDate).toBeNull();
    expect(res.body.completedAt).toBeNull();
    expect(res.body.assignee).toBeNull();
  });

  // title is mandatory
  test('returns 400 when title is missing', async () => {
    const res = await request(app).post('/tasks').send({ status: 'todo' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  // blank title should also fail
  test('returns 400 when title is an empty string', async () => {
    const res = await request(app).post('/tasks').send({ title: '   ' });
    expect(res.status).toBe(400);
  });

  // invalid status enum
  test('returns 400 for an invalid status value', async () => {
    const res = await request(app).post('/tasks').send({ title: 'T', status: 'pending' });
    expect(res.status).toBe(400);
  });

  // invalid priority enum
  test('returns 400 for an invalid priority value', async () => {
    const res = await request(app).post('/tasks').send({ title: 'T', priority: 'critical' });
    expect(res.status).toBe(400);
  });

  // non-parseable date string
  test('returns 400 for an invalid dueDate', async () => {
    const res = await request(app).post('/tasks').send({ title: 'T', dueDate: 'not-a-date' });
    expect(res.status).toBe(400);
  });

  // full valid payload
  test('accepts and stores all optional fields', async () => {
    const res = await request(app).post('/tasks').send({
      title: 'Full task',
      description: 'desc',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2099-12-31T00:00:00.000Z',
    });
    expect(res.status).toBe(201);
    expect(res.body.description).toBe('desc');
    expect(res.body.status).toBe('in_progress');
    expect(res.body.priority).toBe('high');
    expect(res.body.dueDate).toBe('2099-12-31T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// PUT /tasks/:id
// ---------------------------------------------------------------------------
describe('PUT /tasks/:id', () => {
  // basic update
  test('updates a task and returns the updated version', async () => {
    const task = taskService.create({ title: 'Old' });
    const res = await request(app).put(`/tasks/${task.id}`).send({ title: 'New' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New');
  });

  // task doesn't exist
  test('returns 404 when the task does not exist', async () => {
    const res = await request(app).put('/tasks/ghost-id').send({ title: 'X' });
    expect(res.status).toBe(404);
  });

  // sending a bad status in the update
  test('returns 400 for an invalid status', async () => {
    const task = taskService.create({ title: 'T' });
    const res = await request(app).put(`/tasks/${task.id}`).send({ status: 'invalid' });
    expect(res.status).toBe(400);
  });

  // blank title in update
  test('returns 400 when title is updated to an empty string', async () => {
    const task = taskService.create({ title: 'T' });
    const res = await request(app).put(`/tasks/${task.id}`).send({ title: '' });
    expect(res.status).toBe(400);
  });

  // fields not in the patch should survive untouched
  test('preserves fields not included in the update body', async () => {
    const task = taskService.create({ title: 'T', priority: 'high' });
    const res = await request(app).put(`/tasks/${task.id}`).send({ title: 'Updated' });
    expect(res.body.priority).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// DELETE /tasks/:id
// ---------------------------------------------------------------------------
describe('DELETE /tasks/:id', () => {
  // successful delete gives back nothing (204)
  test('deletes a task and returns 204 with no body', async () => {
    const task = taskService.create({ title: 'Delete me' });
    const res = await request(app).delete(`/tasks/${task.id}`);
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  // task should actually be gone after delete
  test('task is no longer retrievable after deletion', async () => {
    const task = taskService.create({ title: 'Gone' });
    await request(app).delete(`/tasks/${task.id}`);
    const res = await request(app).get('/tasks');
    expect(res.body.find((t) => t.id === task.id)).toBeUndefined();
  });

  // deleting something that's not there
  test('returns 404 when the task does not exist', async () => {
    const res = await request(app).delete('/tasks/ghost-id');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /tasks/:id/complete
// ---------------------------------------------------------------------------
describe('PATCH /tasks/:id/complete', () => {
  // completing a real task
  test('marks the task as done and returns it', async () => {
    const task = taskService.create({ title: 'T' });
    const res = await request(app).patch(`/tasks/${task.id}/complete`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
  });

  // completedAt should be set
  test('sets completedAt on the task', async () => {
    const task = taskService.create({ title: 'T' });
    const res = await request(app).patch(`/tasks/${task.id}/complete`);
    expect(res.body.completedAt).not.toBeNull();
  });

  // task doesn't exist
  test('returns 404 when the task does not exist', async () => {
    const res = await request(app).patch('/tasks/ghost-id/complete');
    expect(res.status).toBe(404);
  });

  /**
   * BUG — completeTask forces priority to 'medium'. A high-priority task
   * should keep its priority after being marked complete.
   */
  test('preserves the original priority when completing', async () => {
    const task = taskService.create({ title: 'Urgent', priority: 'high' });
    const res = await request(app).patch(`/tasks/${task.id}/complete`);
    expect(res.body.priority).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// PATCH /tasks/:id/assign
// ---------------------------------------------------------------------------
describe('PATCH /tasks/:id/assign', () => {
  // happy path
  test('assigns a task to a person and returns the updated task', async () => {
    const task = taskService.create({ title: 'T' });
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Alice' });
    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Alice');
  });

  // task not found
  test('returns 404 when the task does not exist', async () => {
    const res = await request(app).patch('/tasks/ghost-id/assign').send({ assignee: 'Alice' });
    expect(res.status).toBe(404);
  });

  // assignee field is required
  test('returns 400 when assignee is missing from the body', async () => {
    const task = taskService.create({ title: 'T' });
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({});
    expect(res.status).toBe(400);
  });

  // empty string assignee should be rejected
  test('returns 400 when assignee is an empty string', async () => {
    const task = taskService.create({ title: 'T' });
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: '   ' });
    expect(res.status).toBe(400);
  });

  // assignee must be a string
  test('returns 400 when assignee is not a string', async () => {
    const task = taskService.create({ title: 'T' });
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 42 });
    expect(res.status).toBe(400);
  });

  // re-assigning should just overwrite silently
  test('allows re-assigning a task to a different person', async () => {
    const task = taskService.create({ title: 'T' });
    await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Alice' });
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Bob' });
    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Bob');
  });

  // other fields should be untouched
  test('does not modify any other task fields', async () => {
    const task = taskService.create({ title: 'Keep', priority: 'high', status: 'in_progress' });
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Dave' });
    expect(res.body.title).toBe('Keep');
    expect(res.body.priority).toBe('high');
    expect(res.body.status).toBe('in_progress');
  });
});
