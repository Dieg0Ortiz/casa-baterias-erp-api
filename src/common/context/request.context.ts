import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextData {
  token: string;
  userId: string;
  email: string;
}

export const requestContext = new AsyncLocalStorage<RequestContextData>();

export function runWithContext<T>(data: RequestContextData, fn: () => T): T {
  return requestContext.run(data, fn);
}

export function getRequestContext(): RequestContextData | undefined {
  return requestContext.getStore();
}
