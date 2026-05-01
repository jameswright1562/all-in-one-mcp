import { Injectable } from "@nestjs/common";
import type { Request as ExpressRequest } from "express";
import {
  type ManagedMcpRuntimeOptions,
  ManagedMcpRuntime as BaseManagedMcpRuntime,
} from "@all-in-one-mcp/shared";
import { McpGateway } from "../gateway/mcpGateway";

@Injectable()
export class ManagedMcpRuntime extends BaseManagedMcpRuntime {
  private readonly gateway: McpGateway;

  constructor(options: ManagedMcpRuntimeOptions = {}) {
    super(options);
    this.gateway = new McpGateway(this);
  }

  async close(): Promise<void> {
    await this.gateway.close();
    await super.close();
  }

  async handleGatewayHttpRequest(
    req: Request | ExpressRequest,
    parsedBody?: unknown,
  ): Promise<Response> {
    return this.gateway.handleNodeRequest(
      this.toWebRequest(req, parsedBody),
      parsedBody,
    );
  }

  private toWebRequest(
    req: Request | ExpressRequest,
    parsedBody?: unknown,
  ): Request {
    if (req instanceof Request) {
      return req;
    }

    const protocol =
      req.protocol ?? ((req.socket as { encrypted?: boolean }).encrypted ? "https" : "http");
    const host = req.get("host") ?? "localhost";
    const url = new URL(req.originalUrl || req.url, `${protocol}://${host}`);
    const body =
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : parsedBody === undefined
          ? undefined
          : JSON.stringify(parsedBody);

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
    if (body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    return new Request(url, {
      method: req.method,
      headers,
      body,
    });
  }
}
