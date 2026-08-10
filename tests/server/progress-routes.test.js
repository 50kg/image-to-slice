const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createProgressRoutes
} = require("../../src/server/routes/progress-routes");

function createHarness({ jobs = new Map(), controllers = new Map(), now = () => 7000 } = {}) {
  const sent = [];
  const finished = [];
  const handle = createProgressRoutes({
    getProgressJob: (id) => jobs.get(id),
    getProgressController: (id) => controllers.get(id),
    finishProgress: (id, status, message) => finished.push({ id, status, message }),
    sendJson: (response, status, body) => sent.push({ response, status, body }),
    now
  });
  return { handle, sent, finished };
}

test("progress routes ignore unrelated requests", async () => {
  const { handle, sent } = createHarness();

  assert.equal(await handle({ method: "GET", url: "/api/other" }, {}), false);
  assert.deepEqual(sent, []);
});

test("GET /api/progress/:id returns elapsed and silent seconds", async () => {
  const jobs = new Map([
    ["abc_123", { status: "running", message: "working", startedAt: 1000, lastEventAt: 4000 }]
  ]);
  const { handle, sent } = createHarness({ jobs });

  assert.equal(await handle({ method: "GET", url: "/api/progress/abc_123" }, {}), true);
  assert.equal(sent[0].status, 200);
  assert.deepEqual(sent[0].body, {
    status: "running",
    message: "working",
    startedAt: 1000,
    lastEventAt: 4000,
    elapsedSeconds: 6,
    silentSeconds: 3
  });
});

test("GET /api/progress/:id returns 404 for missing job", async () => {
  const { handle, sent } = createHarness();

  assert.equal(await handle({ method: "GET", url: "/api/progress/missing" }, {}), true);
  assert.equal(sent[0].status, 404);
  assert.deepEqual(sent[0].body, { error: "AI progress job not found" });
});

test("POST /api/progress/:id/cancel aborts controller and finishes job", async () => {
  let aborted = false;
  const controllers = new Map([
    ["abc", { abort: () => { aborted = true; } }]
  ]);
  const { handle, sent, finished } = createHarness({ controllers });

  assert.equal(await handle({ method: "POST", url: "/api/progress/abc/cancel" }, {}), true);
  assert.equal(aborted, true);
  assert.deepEqual(finished, [{ id: "abc", status: "cancelled", message: "AI 处理已取消" }]);
  assert.deepEqual(sent[0], { response: {}, status: 200, body: { ok: true } });
});

test("POST /api/progress/:id/cancel returns 404 for missing controller", async () => {
  const { handle, sent } = createHarness();

  assert.equal(await handle({ method: "POST", url: "/api/progress/missing/cancel" }, {}), true);
  assert.equal(sent[0].status, 404);
  assert.deepEqual(sent[0].body, { error: "AI progress job is not running" });
});
