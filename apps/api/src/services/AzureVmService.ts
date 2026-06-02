import { InternalServerError } from '@azure-burst-monitor/backend-errors';
import type { VirtualMachine } from '@azure-burst-monitor/shared';

interface AzureVmListResponse {
  value: Array<{
    id: string;
    name: string;
    location: string;
    properties: {
      hardwareProfile: { vmSize: string };
    };
  }>;
  nextLink?: string;
}

class AzureVmService {
  public static async listBSeriesVms(token: string, subscriptionId: string): Promise<VirtualMachine[]> {
    const vms: VirtualMachine[] = [];
    let nextUrl: string | undefined =
      `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Compute/virtualMachines?api-version=2024-07-01`;

    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new InternalServerError(`Azure VM list failed: ${response.status} ${text}`);
      }

      const data = (await response.json()) as AzureVmListResponse;

      for (const vm of data.value) {
        if (vm.properties.hardwareProfile.vmSize.startsWith('Standard_B')) {
          const rgMatch = vm.id.match(/\/resourceGroups\/([^/]+)\//i);
          const resourceGroup = rgMatch?.[1] ?? 'unknown';
          vms.push({
            resourceId: vm.id,
            name: vm.name,
            resourceGroup,
            location: vm.location,
            vmSize: vm.properties.hardwareProfile.vmSize,
          });
        }
      }

      nextUrl = data.nextLink;
    }

    return vms;
  }
}

export { AzureVmService };
