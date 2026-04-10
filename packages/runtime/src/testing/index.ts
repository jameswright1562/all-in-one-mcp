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

    await runtime.handleGatewayHttpRequest(req, res, body);
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
