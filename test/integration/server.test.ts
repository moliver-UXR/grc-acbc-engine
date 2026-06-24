import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { startServer } from "../../src/server.js";

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = await startServer(0); // port 0 = OS assigns
  const addr = server.address() as { port: number };
  baseUrl = `http://localhost:${addr.port}`;
});

afterAll(() => {
  server.close();
});

async function post(path: string, body: unknown) {
  const resp = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return resp.json();
}

it("/init returns sessionId and BYO task JSON", async () => {
  const res = await post("/init", {
    studyId: "grc-test",
    respondentId: "r-001",
    qualtricsResponseId: "QR_test001",
    profile: { segment: "midmarket" },
  });
  expect(res.sessionId).toBeTruthy();
  const task = JSON.parse(res.acbcTaskJson);
  expect(task.taskType).toBe("byo");
  expect(res.acbcDone).toBe("false");
});

it("/next with valid BYO choice advances to SCREENING", async () => {
  const initRes = await post("/init", {
    studyId: "grc-test",
    respondentId: "r-002",
    qualtricsResponseId: "QR_test002",
    profile: {},
  });
  const task = JSON.parse(initRes.acbcTaskJson);
  const byoChoices: Record<string, string> = {};
  for (const attr of task.attributes) byoChoices[attr.id] = attr.levels[0].id;

  const nextRes = await post("/next", {
    sessionId: initRes.sessionId,
    taskId: task.taskId,
    taskType: "byo",
    choice: byoChoices,
  });
  const nextTask = JSON.parse(nextRes.acbcTaskJson);
  expect(nextTask.taskType).toBe("screening");
  expect(nextRes.acbcDone).toBe("false");
});
