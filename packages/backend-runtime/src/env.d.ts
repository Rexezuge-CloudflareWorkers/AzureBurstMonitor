declare global {
  interface Env {
    AZURE_TENANT_ID: string;
    AZURE_CLIENT_ID: string;
    AZURE_CLIENT_SECRET: string;
    AZURE_SUBSCRIPTION_ID: string;
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
