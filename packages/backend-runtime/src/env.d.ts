declare global {
  interface Env {
    SERVE_SPA_FROM_WORKER?: string | undefined;
  }

  interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
  }

  interface ScheduledController {
    scheduledTime: number;
    cron: string;
    noRetry(): void;
  }
}

export {};
