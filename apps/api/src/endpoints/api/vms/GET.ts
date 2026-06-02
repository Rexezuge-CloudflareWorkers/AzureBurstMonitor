import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { IEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IBaseRoute';
import { AzureAuthService } from '@/services/AzureAuthService';
import { AzureVmService } from '@/services/AzureVmService';
import type { VirtualMachine } from '@azure-burst-monitor/shared';

class ListVmsRoute extends IBaseRoute<ListVmsRequest, ListVmsResponse, ListVmsEnv> {
  schema = {
    tags: ['VMs'],
    summary: 'List all B-series virtual machines',
    responses: {
      '200': {
        description: 'B-series virtual machines in the subscription',
      },
    },
  };

  protected async handleRequest(_request: ListVmsRequest, env: ListVmsEnv, _ctx: RouteContext<ListVmsEnv>): Promise<ListVmsResponse> {
    const token = await AzureAuthService.getToken(env);
    const vms = await AzureVmService.listBSeriesVms(token, env.AZURE_SUBSCRIPTION_ID);
    return { vms };
  }
}

type ListVmsRequest = IRequest;

interface ListVmsResponse extends IResponse {
  vms: VirtualMachine[];
}

interface ListVmsEnv extends IEnv {
  AZURE_TENANT_ID: string;
  AZURE_CLIENT_ID: string;
  AZURE_CLIENT_SECRET: string;
  AZURE_SUBSCRIPTION_ID: string;
}

export { ListVmsRoute };
