interface MetricDataPoint {
  timestamp: string;
  average?: number | null;
  total?: number | null;
}

interface VmMetrics {
  resourceId: string;
  percentageCpu: MetricDataPoint[];
  cpuCreditsConsumed: MetricDataPoint[];
  cpuCreditsRemaining: MetricDataPoint[];
}

export type { MetricDataPoint, VmMetrics };
