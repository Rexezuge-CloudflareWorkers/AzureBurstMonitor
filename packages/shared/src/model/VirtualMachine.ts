interface VirtualMachine {
  resourceId: string;
  name: string;
  resourceGroup: string;
  location: string;
  vmSize: string;
}

export type { VirtualMachine };
