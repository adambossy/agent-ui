/**
 * Vite middleware that exposes the mock backend at /api/* during dev.
 *
 * Endpoints:
 *   POST /api/chat                    streams a canned turn using the AI SDK
 *                                     v1 UI Message Stream protocol.
 *   GET  /api/chat/:sessionId/stream  resume endpoint (returns an empty stream
 *                                     + [DONE] for the MVP; expanded in phase 3).
 *   GET  /api/sessions/:id            hydrate an existing session (returns
 *                                     empty for unknown ids — the canned
 *                                     turn is regenerated on every POST).
 *   GET  /api/sessions/tree           empty tree for the MVP.
 *   POST /api/sessions                returns a fresh session id.
 *   POST /api/uploads                 (stub; not exercised in MVP).
 */
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dispatchTurn } from "./turns";

function setSseHeaders(res: ServerResponse) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("x-vercel-ai-ui-message-stream", "v1");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
}

function send(res: ServerResponse, status: number, body: unknown, json = true) {
  res.statusCode = status;
  if (json) res.setHeader("Content-Type", "application/json");
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function randomId(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function mockBackendPlugin(): Plugin {
  return {
    name: "agent-ui-mock-backend",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        const method = req.method ?? "GET";

        if (!url.startsWith("/api/")) return next();

        try {
          // POST /api/chat — the canned turn
          if (method === "POST" && url === "/api/chat") {
            const body = (await readJson(req)) as { id?: string; messages?: unknown[] };
            setSseHeaders(res);
            await dispatchTurn(res, {
              sessionId: body.id ?? randomId("sess"),
              messages: Array.isArray(body.messages) ? body.messages : [],
            });
            return;
          }

          // GET /api/chat/:sessionId/stream — resume (MVP: empty)
          if (method === "GET" && /^\/api\/chat\/[^/]+\/stream$/.test(url)) {
            setSseHeaders(res);
            res.write("data: [DONE]\n\n");
            res.end();
            return;
          }

          // GET /api/sessions/:id
          if (method === "GET" && /^\/api\/sessions\/[^/]+$/.test(url)) {
            const sessionId = url.split("/").pop() ?? "";
            send(res, 200, {
              session: {
                sessionId,
                title: "",
                agentName: "user",
                status: "idle",
                createdAt: new Date().toISOString(),
              },
              messages: [],
            });
            return;
          }

          // GET /api/sessions/tree
          if (method === "GET" && url === "/api/sessions/tree") {
            send(res, 200, { children: [] });
            return;
          }

          // POST /api/sessions — create
          if (method === "POST" && url === "/api/sessions") {
            send(res, 200, { sessionId: randomId("sess") });
            return;
          }

          // POST /api/uploads — stub
          if (method === "POST" && url === "/api/uploads") {
            send(res, 501, { error: "uploads not implemented in MVP" });
            return;
          }

          send(res, 404, { error: "not found" });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[mock-backend]", err);
          send(res, 500, { error: String(err) });
        }
      });
    },
  };
}
