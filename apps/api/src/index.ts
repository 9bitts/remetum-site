import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { config } from "./config.js";

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function bootHandler(req: IncomingMessage, res: ServerResponse) {
  const path = (req.url ?? "").split("?")[0];
  if (path === "/health" || path === "/health/") {
    sendJson(res, 200, {
      ok: true,
      service: "remetum-api",
      timestamp: new Date().toISOString(),
    });
    return;
  }
  sendJson(res, 503, { error: "API a iniciar" });
}

async function main() {
  const server = createServer(bootHandler);

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => reject(err);
    server.once("error", onError);
    server.listen(config.port, "0.0.0.0", () => {
      server.off("error", onError);
      resolve();
    });
  });
  console.log(`Remetum API listening on :${config.port}`);

  try {
    const { attachApp } = await import("./app.js");
    await attachApp(server, bootHandler);
  } catch (err) {
    console.error("[boot] failed to load API routes; /health still up", err);
  }
}

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
