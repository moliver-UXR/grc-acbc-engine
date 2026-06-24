import http from "node:http";
import { randomUUID } from "node:crypto";
import { ACBCEngine, MemoryStorage } from "./index.js";
import { grcConfig } from "./configs/grc.js";
import {
  serializeStateToQualtricsTask,
  buildEngineEventFromChoice,
} from "./integration/qualtrics-adapter.js";

const sessions = new Map<string, ACBCEngine>();

function cors(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (chunk) => (buf += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

export async function startServer(port: number): Promise<http.Server> {
  const server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") { cors(res); res.writeHead(204); res.end(); return; }

    const url = req.url ?? "";

    if (req.method === "POST" && url === "/init") {
      let body: { studyId: string; respondentId: string; qualtricsResponseId?: string; profile?: Record<string, string> };
      try { body = (await readBody(req)) as typeof body; }
      catch { json(res, 400, { error: "Invalid JSON" }); return; }

      const { studyId, respondentId, qualtricsResponseId } = body;
      const seed = `${studyId}-${respondentId}-${qualtricsResponseId ?? Date.now()}`;
      const engine = new ACBCEngine(studyId, respondentId, grcConfig, seed, new MemoryStorage());
      engine.start();

      const sessionId = randomUUID();
      sessions.set(sessionId, engine);

      const state = engine.getState();
      const taskJson = serializeStateToQualtricsTask(state, engine.getConfig());
      json(res, 200, {
        sessionId,
        acbcTaskJson: JSON.stringify(taskJson),
        acbcPhase: state.phase,
        acbcIteration: "0",
        acbcDone: "false",
      });
      return;
    }

    if (req.method === "POST" && url === "/next") {
      let body: { sessionId: string; taskId: string; taskType: string; choice: Record<string, string> };
      try { body = (await readBody(req)) as typeof body; }
      catch { json(res, 400, { error: "Invalid JSON" }); return; }

      const engine = sessions.get(body.sessionId);
      if (!engine) { json(res, 404, { error: "Session not found" }); return; }

      let newState;
      try {
        const event = buildEngineEventFromChoice(engine.getState(), body.taskId, body.choice);
        newState = engine.submitEvent(event);
      } catch (err) {
        json(res, 400, { error: String(err) }); return;
      }

      const isDone = newState.phase === "DONE";
      const taskJson = isDone ? {} : serializeStateToQualtricsTask(newState, engine.getConfig());

      json(res, 200, {
        sessionId: body.sessionId,
        acbcTaskJson: JSON.stringify(taskJson),
        acbcPhase: newState.phase,
        acbcIteration: String(newState.screened.length),
        acbcDone: isDone ? "true" : "false",
      });
      return;
    }

    json(res, 404, { error: "Not found" });
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  const PORT = Number(process.env.PORT ?? 3000);
  startServer(PORT).then((s) => {
    console.log(`ACBC Engine server listening on port ${(s.address() as { port: number }).port}`);
  });
}
