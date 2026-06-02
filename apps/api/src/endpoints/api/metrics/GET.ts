import { z } from 'zod';
import { BadRequestError } from '@azure-burst-monitor/backend-errors';
import type { VmMetrics } from '@azure-burst-monitor/shared';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { IEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IBaseRoute';
import { AzureAuthService } from '@/services/AzureAuthService';
import { AzureMetricsService } from '@/services/AzureMetricsService';

class GetVmMetricsRoute extends IBaseRoute<GetVmMetricsRequest, GetVmMetricsResponse, GetVmMetricsEnv> {
  schema = {
    tags: ['VMs'],
    summary: 'Get CPU metrics for a specific B-series VM',
    request: {
      query: z.object({
        resourceId: z.string().min(1),
      }),
    },
    responses: {
      '200': {
        description: 'VM CPU metrics for the last 60 minutes',
      },
    },
  };

  protected async handleRequest(request: GetVmMetricsRequest, env: GetVmMetricsEnv, _ctx: RouteContext<GetVmMetricsEnv>): Promise<GetVmMetricsResponse> {
    const url = new URL(request.raw.url);
    const resourceId = url.searchParams.get('resourceId');
    if (!resourceId) {
      throw new BadRequestError('resourceId query parameter is required.');
    }

    const token = await AzureAuthService.getToken(env);
    const metrics = await AzureMetricsService.getVmMetrics(token, resourceId);
    return { metrics };
  }
}

type GetVmMetricsRequest = IRequest;

interface GetVmMetricsResponse extends IResponse {
  metrics: VmMetrics;
}

interface GetVmMetricsEnv extends IEnv {
  AZURE_TENANT_ID: string;
  AZURE_CLIENT_ID: string;
  AZURE_CLIENT_SECRET: string;
}

export { GetVmMetricsRoute };
