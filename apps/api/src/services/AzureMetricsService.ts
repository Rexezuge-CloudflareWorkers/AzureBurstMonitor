import { InternalServerError } from '@azure-burst-monitor/backend-errors';
import type { MetricDataPoint, VmMetrics } from '@azure-burst-monitor/shared';

interface AzureMetricDataPoint {
  timeStamp: string;
  average?: number | null;
  total?: number | null;
}

interface AzureMetricTimeseries {
  data: AzureMetricDataPoint[];
}

interface AzureMetricValue {
  name: { value: string; localizedValue: string };
  timeseries: AzureMetricTimeseries[];
}

interface AzureMetricsApiResponse {
  value: AzureMetricValue[];
}

function extractDataPoints(metrics: AzureMetricValue[], metricName: string): MetricDataPoint[] {
  const metric = metrics.find((m) => m.name.value === metricName || m.name.localizedValue === metricName);
  if (!metric || !metric.timeseries[0]) return [];
  return metric.timeseries[0].data.map((d) => ({
    timestamp: d.timeStamp,
    average: d.average ?? null,
    total: d.total ?? null,
  }));
}

class AzureMetricsService {
  public static async getVmMetrics(token: string, resourceId: string): Promise<VmMetrics> {
    const now = new Date();
    const start = new Date(now.getTime() - 60 * 60 * 1000);
    const timespan = `${start.toISOString()}/${now.toISOString()}`;
    const metricnames = 'Percentage CPU,CPU Credits Consumed,CPU Credits Remaining';

    const url =
      `https://management.azure.com${resourceId}/providers/microsoft.insights/metrics` +
      `?metricnames=${encodeURIComponent(metricnames)}` +
      `&api-version=2024-02-01` +
      `&timespan=${encodeURIComponent(timespan)}` +
      `&interval=PT1M` +
      `&aggregation=Average%2CTotal`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new InternalServerError(`Azure metrics fetch failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as AzureMetricsApiResponse;

    return {
      resourceId,
      percentageCpu: extractDataPoints(data.value, 'Percentage CPU'),
      cpuCreditsConsumed: extractDataPoints(data.value, 'CPU Credits Consumed'),
      cpuCreditsRemaining: extractDataPoints(data.value, 'CPU Credits Remaining'),
    };
  }
}

export { AzureMetricsService };
