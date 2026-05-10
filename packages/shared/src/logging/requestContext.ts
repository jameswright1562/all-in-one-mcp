import { AsyncLocalStorage } from "node:async_hooks";

type RequestContextState = {
  requestId?: string;
};

const requestContext = new AsyncLocalStorage<RequestContextState>();

export function withRequestContext<T>(
  state: RequestContextState,
  callback: () => T,
): T {
  return requestContext.run(state, callback);
}

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}
