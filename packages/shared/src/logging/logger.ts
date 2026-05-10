import pino, { type Logger, type LoggerOptions } from "pino";
import { getRequestId } from "./requestContext.js";

export type CreateLoggerOptions = {
  level?: LoggerOptions["level"];
  base?: LoggerOptions["base"];
};

const rootLoggerOptions: LoggerOptions = {
  level:
    process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === "production" ? "info" : "debug"),
  redact: {
    paths: [
      "*.env",
      "*.headers",
      "*.token",
      "*.authorization",
      "*.password",
      "*.secret",
    ],
    censor: "[REDACTED]",
  },
};

if (process.env.NODE_ENV !== "production") {
  rootLoggerOptions.transport = {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
    },
  };
}

const rootLogger = pino(rootLoggerOptions);

export function createLogger(
  component: string,
  options: CreateLoggerOptions = {},
): Logger {
  const requestId = getRequestId();
  const bindings: Record<string, unknown> = {
    component,
    ...options.base,
  };

  if (requestId) {
    bindings.requestId = requestId;
  }

  return rootLogger.child(bindings);
}
