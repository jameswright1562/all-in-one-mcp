import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { ManagedMcpRuntime } from "../runtime.js";

export async function startRuntimeGatewayServer(
  runtime: ManagedMcpRuntime,
): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const server = createServer(async (req, res) => {
    const body =
      req.method === "POST"
        ? await new Promise<unknown>((resolve, reject) => {
            let raw = "";
            req.setEncoding("utf8");
            req.on("data", (chunk) => {
              raw += chunk;
            });
            req.on("end", () => {
              resolve(raw.length > 0 ? JSON.parse(raw) : undefined);
            });
            req.on("error", reject);
          })
        : undefined;

    const protocol = (req.socket as { encrypted?: boolean }).encrypted
      ? "https"
      : "http";
    const headers = new Headers();

    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) {
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          headers.append(key, item);
        }
      } else {
        headers.set(key, value);
      }
    }

    if (body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const init: RequestInit = {
      method: req.method ?? "GET",
      headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD" && body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const response = await runtime.handleGatewayHttpRequest(
      new Request(
        new URL(
          req.url ?? "/",
          `${protocol}://${req.headers.host ?? "127.0.0.1"}`,
        ),
        init,
      ),
      body,
    );

    res.statusCode = response.status;
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }

    if (!response.body) {
      res.end();
      return;
    }

    const buffer = await response.arrayBuffer();
    res.end(Buffer.from(buffer));
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  const address = server.address() as AddressInfo;

  return {
    port: address.port,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}
