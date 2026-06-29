import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import {
  type ManagedMcpRuntimeOptions,
  McpGateway,
  ManagedMcpRuntime as BaseManagedMcpRuntime,
} from '@all-in-one-mcp/shared';

@Injectable()
export class ManagedMcpRuntime
  extends BaseManagedMcpRuntime
  implements OnModuleInit, OnModuleDestroy
{
  private readonly gateway: McpGateway;

  constructor(options: ManagedMcpRuntimeOptions = {}) {
    super(options);
    this.gateway = new McpGateway(this);
  }

  async onModuleInit(): Promise<void> {
    await this.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  async close(): Promise<void> {
    await Promise.all([this.gateway.close(), super.close()]);
  }

  async handleGatewayHttpRequest(
    req: Request | ExpressRequest,
    parsedBody?: unknown,
  ): Promise<Response> {
    return await this.gateway.handleRequest(
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
      req.protocol ??
      ((req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http');
    const host = req.get('host') ?? 'localhost';
    const url = new URL(req.originalUrl || req.url, `${protocol}://${host}`);
    const body =
      req.method === 'GET' || req.method === 'HEAD'
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
    if (body && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    const init: RequestInit = {
      method: req.method,
      headers,
    };

    if (body !== undefined) {
      init.body = body;
    }

    return new Request(url, {
      ...init,
    });
  }
}
