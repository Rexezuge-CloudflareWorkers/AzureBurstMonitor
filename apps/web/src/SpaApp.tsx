import { useCallback, useEffect, useState } from 'react';

interface VirtualMachine {
  resourceId: string;
  name: string;
  resourceGroup: string;
  location: string;
  vmSize: string;
}

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

type FetchState = 'idle' | 'loading' | 'done' | 'error';

interface VmRow {
  vm: VirtualMachine;
  metrics: VmMetrics | null;
  metricsState: FetchState;
  metricsError?: string;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return response.json() as Promise<T>;
}

function getLastValue(points: MetricDataPoint[], key: 'average' | 'total'): number | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const v = points[i][key];
    if (v != null) return v;
  }
  return null;
}

function formatNum(value: number | null, decimals = 1): string {
  if (value === null) return '—';
  return value.toFixed(decimals);
}

function Spinner() {
  return (
    <span
      className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
      aria-label="Loading"
    />
  );
}

interface MetricCellProps {
  state: FetchState;
  value: number | null;
  unit?: string;
  decimals?: number;
}

function MetricCell({ state, value, unit = '', decimals = 1 }: MetricCellProps) {
  if (state === 'loading') return <td className="px-4 py-3 text-center"><Spinner /></td>;
  if (state === 'error') return <td className="px-4 py-3 text-center text-red-500 text-xs">err</td>;
  if (state === 'idle') return <td className="px-4 py-3 text-center text-gray-400">—</td>;
  return (
    <td className="px-4 py-3 text-center tabular-nums">
      {value !== null ? `${formatNum(value, decimals)}${unit}` : '—'}
    </td>
  );
}

interface VmTableRowProps {
  row: VmRow;
}

function VmTableRow({ row }: VmTableRowProps) {
  const { vm, metrics, metricsState } = row;

  const cpu = metrics ? getLastValue(metrics.percentageCpu, 'average') : null;
  const consumed = metrics ? getLastValue(metrics.cpuCreditsConsumed, 'total') : null;
  const remaining = metrics ? getLastValue(metrics.cpuCreditsRemaining, 'average') : null;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 font-medium text-gray-900">{vm.name}</td>
      <td className="px-4 py-3 text-gray-600">{vm.resourceGroup}</td>
      <td className="px-4 py-3 text-gray-600">{vm.location}</td>
      <td className="px-4 py-3">
        <span className="inline-block px-2 py-0.5 text-xs font-mono bg-blue-50 text-blue-700 rounded">{vm.vmSize}</span>
      </td>
      <MetricCell state={metricsState} value={cpu} unit="%" />
      <MetricCell state={metricsState} value={consumed} decimals={2} />
      <MetricCell state={metricsState} value={remaining} decimals={2} />
    </tr>
  );
}

export default function SpaApp() {
  const [vmRows, setVmRows] = useState<VmRow[]>([]);
  const [vmListState, setVmListState] = useState<FetchState>('idle');
  const [vmListError, setVmListError] = useState<string>('');

  const fetchAll = useCallback(async () => {
    setVmListState('loading');
    setVmListError('');
    setVmRows([]);

    let vms: VirtualMachine[];
    try {
      const data = await readJson<{ vms: VirtualMachine[] }>(await fetch('/api/vms'));
      vms = data.vms;
    } catch (err) {
      setVmListState('error');
      setVmListError(err instanceof Error ? err.message : String(err));
      return;
    }

    setVmListState('done');

    const initialRows: VmRow[] = vms.map((vm) => ({
      vm,
      metrics: null,
      metricsState: 'loading',
    }));
    setVmRows(initialRows);

    await Promise.all(
      vms.map(async (vm, index) => {
        try {
          const data = await readJson<{ metrics: VmMetrics }>(
            await fetch(`/api/metrics?resourceId=${encodeURIComponent(vm.resourceId)}`),
          );
          setVmRows((prev) => prev.map((row, i) => (i === index ? { ...row, metrics: data.metrics, metricsState: 'done' } : row)));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setVmRows((prev) => prev.map((row, i) => (i === index ? { ...row, metricsState: 'error', metricsError: msg } : row)));
        }
      }),
    );
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const isLoading = vmListState === 'loading' || vmRows.some((r) => r.metricsState === 'loading');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Azure Burst Monitor</h1>
          <p className="text-sm text-gray-500 mt-0.5">B-series VM CPU burstable credit &amp; utilization</p>
        </div>
        <button
          onClick={fetchAll}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading && <Spinner />}
          {isLoading ? 'Fetching…' : 'Refresh'}
        </button>
      </header>

      <main className="px-6 py-6">
        {vmListState === 'error' && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 animate-slide-down">
            <strong>Failed to load VMs:</strong> {vmListError}
          </div>
        )}

        {vmListState === 'loading' && (
          <div className="flex items-center gap-3 text-gray-500 py-12 justify-center">
            <Spinner />
            <span>Loading B-series VMs…</span>
          </div>
        )}

        {vmListState === 'done' && vmRows.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No B-series VMs found in this subscription.
          </div>
        )}

        {vmRows.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left font-medium text-gray-600">VM Name</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Resource Group</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Location</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Size</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">CPU %</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Credits Consumed</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Credits Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {vmRows.map((row) => (
                    <VmTableRow key={row.vm.resourceId} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
              Metrics show the most recent data point from the last 60 minutes at 1-minute granularity.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
