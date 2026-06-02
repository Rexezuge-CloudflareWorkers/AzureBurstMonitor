import { AbstractEntrypointWorker } from '@azure-burst-monitor/backend-runtime/base';
import { fromHono } from 'chanfana';
import type { HonoOpenAPIRouterType } from 'chanfana';
import { Hono } from 'hono';
import { GetVmMetricsRoute, ListVmsRoute } from '@/endpoints';
import { SPA_HTML } from '@/generated/spa-shell';

class AzureBurstMonitorWorker extends AbstractEntrypointWorker {
  protected readonly app: HonoOpenAPIRouterType<{ Bindings: Env }>;

  constructor() {
    super();

    const app: Hono<{ Bindings: Env }> = new Hono<{ Bindings: Env }>();

    const openapi: HonoOpenAPIRouterType<{ Bindings: Env }> = fromHono(app, {
      docs_url: '/docs',
      openapi_url: '/openapi.json',
    });

    openapi.get('/api/vms', ListVmsRoute);
    openapi.get('/api/metrics', GetVmMetricsRoute);

    app.get('*', (c) => {
      const serveSpa = (c.env.SERVE_SPA_FROM_WORKER ?? 'false') === 'true';
      if (!serveSpa) return c.notFound();
      return c.html(SPA_HTML);
    });

    this.app = openapi;
  }

  protected async onRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return this.app.fetch(request, env, ctx);
  }

  protected async onScheduled(_event: ScheduledController, _env: Env, _ctx: ExecutionContext): Promise<void> {
    // No scheduled tasks
  }
}

export { AzureBurstMonitorWorker };
