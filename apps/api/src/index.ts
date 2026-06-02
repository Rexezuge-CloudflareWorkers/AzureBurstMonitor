import { AzureBurstMonitorWorker } from '@/workers';

const worker = new AzureBurstMonitorWorker();

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return worker.fetch(request, env, ctx);
  },
};
