import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ACBCEngine, MemoryStorage } from "./index.js";
import type { EngineState } from "./core/types.js";
import { grcConfig } from "./configs/grc.js";
import {
  serializeStateToQualtricsTask,
  buildEngineEventFromChoice,
} from "./integration/qualtrics-adapter.js";

// ---------------------------------------------------------------------------
// Session store — in-process Map keyed by UUID.
// NOTE: sessions are lost on server restart. This is acceptable for a single
// fielding run where each respondent completes the survey in one sitting.
// ---------------------------------------------------------------------------
const sessions = new Map<string, ACBCEngine>();

// ---------------------------------------------------------------------------
// CORS helper — allows Qualtrics (any origin) to reach this server.
// ---------------------------------------------------------------------------
function cors(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/**
 * REGENERATE is a transient, respondent-invisible phase. When a cutoff rule is
 * confirmed the reducer rebuilds the concept pool in-process and parks the
 * session in REGENERATE, whose serialized task carries no choice for the client
 * to answer. Step the engine forward until it reaches a phase the respondent can
 * actually act on, so /next never hands the survey a dead-end task. The
 * REGENERATE reducer branch ignores its event, so any event advances it.
 */
export function advancePastTransientPhases(engine: ACBCEngine): EngineState {
  let state = engine.getState();
  let guard = 0;
  while (state.phase === "REGENERATE" && guard++ < 10) {
    state = engine.submitEvent({ type: "RULE_CONFIRMED" });
  }
  return state;
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

    // -----------------------------------------------------------------------
    // GET /health — liveness probe for Railway / Render health checks
    // -----------------------------------------------------------------------
    if (req.method === "GET" && url === "/health") {
      json(res, 200, { status: "ok" }); return;
    }

    // -----------------------------------------------------------------------
    // GET /survey-js — serve the current Qualtrics survey JavaScript from disk.
    // Lets the launch-engine tooling fetch the live source over the tunnel and
    // set it into the survey question, so an edit needs no manual paste. The
    // path is server config (SURVEY_JS_PATH), not request input, so there is no
    // traversal surface. Defaults to the sibling survey-integration file.
    // -----------------------------------------------------------------------
    if (req.method === "GET" && url.split("?")[0] === "/survey-js") {
      const jsPath = process.env.SURVEY_JS_PATH
        ?? path.resolve(process.cwd(), "../../survey-integration/grc-acbc-selftest.js");
      let js: string;
      try { js = fs.readFileSync(jsPath, "utf8"); }
      catch (e) {
        console.log(`[error] /survey-js — read failed for ${jsPath}: ${String(e)}`);
        json(res, 500, { error: `survey-js read failed: ${String(e)}` }); return;
      }
      cors(res);
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      res.end(js);
      return;
    }

    // -----------------------------------------------------------------------
    // POST /init — create a new session, run BYO, return first task
    // -----------------------------------------------------------------------
    if (req.method === "POST" && url === "/init") {
      let body: { studyId: string; respondentId: string; qualtricsResponseId?: string; profile?: Record<string, string> };
      try { body = (await readBody(req)) as typeof body; }
      catch {
        console.log("[error] /init — invalid JSON body");
        json(res, 400, { error: "Invalid JSON" }); return;
      }

      const { studyId, respondentId, qualtricsResponseId } = body;
      const seed = `${studyId}-${respondentId}-${qualtricsResponseId ?? Date.now()}`;
      const engine = new ACBCEngine(studyId, respondentId, grcConfig, seed, new MemoryStorage());
      engine.start();

      const sessionId = randomUUID();
      sessions.set(sessionId, engine);

      console.log(`[init] respondentId=${respondentId} studyId=${studyId} sessionId=${sessionId}`);

      const state = engine.getState();
      let taskJson;
      try { taskJson = serializeStateToQualtricsTask(state, engine.getConfig()); }
      catch (err) {
        console.log(`[error] /init — serialize failed for sessionId=${sessionId} phase=${state.phase}: ${String(err)}`);
        json(res, 500, { error: `serialize failed: ${String(err)}` }); return;
      }
      json(res, 200, {
        sessionId,
        acbcTaskJson: JSON.stringify(taskJson),
        acbcPhase: state.phase,
        acbcIteration: "0",
        acbcDone: "false",
      });
      return;
    }

    // -----------------------------------------------------------------------
    // POST /next — advance the session by one task, return the next task
    // -----------------------------------------------------------------------
    if (req.method === "POST" && url === "/next") {
      let body: { sessionId: string; taskId: string; taskType: string; choice: Record<string, string> };
      try { body = (await readBody(req)) as typeof body; }
      catch {
        console.log("[error] /next — invalid JSON body");
        json(res, 400, { error: "Invalid JSON" }); return;
      }

      const engine = sessions.get(body.sessionId);
      if (!engine) {
        console.log(`[error] /next — session not found: ${body.sessionId}`);
        json(res, 404, { error: "Session not found" }); return;
      }

      let newState;
      try {
        const event = buildEngineEventFromChoice(engine.getState(), body.taskId, body.choice);
        newState = engine.submitEvent(event);
        newState = advancePastTransientPhases(engine);
      } catch (err) {
        console.log(`[error] /next — event build failed for sessionId=${body.sessionId}: ${String(err)}`);
        json(res, 400, { error: String(err) }); return;
      }

      console.log(`[next] sessionId=${body.sessionId} taskId=${body.taskId} taskType=${body.taskType} → phase=${newState.phase}`);

      const isDone = newState.phase === "DONE";
      let taskJson;
      try { taskJson = isDone ? {} : serializeStateToQualtricsTask(newState, engine.getConfig()); }
      catch (err) {
        console.log(`[error] /next — serialize failed for sessionId=${body.sessionId} phase=${newState.phase}: ${String(err)}`);
        json(res, 500, { error: `serialize failed: ${String(err)}` }); return;
      }

      json(res, 200, {
        sessionId: body.sessionId,
        acbcTaskJson: JSON.stringify(taskJson),
        acbcPhase: newState.phase,
        acbcIteration: String(newState.screened.length),
        acbcDone: isDone ? "true" : "false",
      });
      return;
    }

    console.log(`[error] ${req.method} ${url} — not found`);
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
