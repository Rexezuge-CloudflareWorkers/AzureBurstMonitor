import { type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

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

// Azure B-series: max CPU credits = accrual rate (credits/hour) × 24 hours
const MAX_CREDITS: Record<string, number> = {
  standard_b1ls: 72,
  standard_b1s: 144,
  standard_b1ms: 144,
  standard_b2s: 288,
  standard_b2ms: 432,
  standard_b4ms: 864,
  standard_b8ms: 1728,
  standard_b12ms: 2592,
  standard_b16ms: 3456,
  standard_b20ms: 4320,
};

function getMaxCredits(vmSize: string): number | null {
  return MAX_CREDITS[vmSize.toLowerCase()] ?? null;
}

// Linear regression slope over the last N valid data points (returns units per minute)
function calcSlopePerMinute(points: MetricDataPoint[], key: 'average' | 'total', n = 10): number | null {
  const valid = points.filter((p) => p[key] != null).slice(-n);
  if (valid.length < 2) return null;
  const ys = valid.map((p) => p[key] as number);
  const xs = ys.map((_, i) => i);
  const len = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);
  const denom = len * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (len * sumXY - sumX * sumY) / denom;
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return '<1min';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `~${m}min`;
  if (m === 0) return `~${h}h`;
  return `~${h}h ${m}m`;
}

interface ChartPoint {
  time: string;
  value: number | null | undefined;
}

function prepChartData(points: MetricDataPoint[], key: 'average' | 'total'): ChartPoint[] {
  return points.map((p) => ({
    time: new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    value: p[key] ?? undefined,
  }));
}

function Spinner() {
  return (
    <span
      className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
      aria-label="Loading"
    />
  );
}

interface MiniChartProps {
  data: ChartPoint[];
  color: string;
  unit?: string;
  decimals?: number;
  refLine?: number | null;
  yDomain?: [number | 'auto', number | 'auto'];
}

function MiniChart({ data, color, unit = '', decimals = 1, refLine, yDomain }: MiniChartProps) {
  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 9, fill: '#9ca3af' }}
          interval="preserveStartEnd"
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 9, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
          width={36}
          domain={yDomain}
          tickFormatter={(v: number) => (decimals === 0 ? String(Math.round(v)) : v.toFixed(decimals))}
        />
        <Tooltip
          formatter={(value: unknown) => {
            const num = typeof value === 'number' ? value : null;
            return [num != null ? `${num.toFixed(decimals)}${unit}` : '—', ''];
          }}
          labelStyle={{ fontSize: 11, color: '#374151' }}
          contentStyle={{ fontSize: 11, border: '1px solid #e5e7eb', borderRadius: 6 }}
          itemStyle={{ color }}
        />
        {refLine != null && (
          <ReferenceLine
            y={refLine}
            stroke="#cbd5e1"
            strokeDasharray="4 2"
            label={{ value: 'max', position: 'insideTopRight', fontSize: 9, fill: '#9ca3af' }}
          />
        )}
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface ChartPanelProps {
  title: string;
  current: string;
  children: ReactNode;
}

function ChartPanel({ title, current, children }: ChartPanelProps) {
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{title}</span>
        <span className="text-sm font-semibold tabular-nums text-gray-800">{current}</span>
      </div>
      {children}
    </div>
  );
}

interface VmCardProps {
  row: VmRow;
}

function VmCard({ row }: VmCardProps) {
  const { vm, metrics, metricsState, metricsError } = row;

  const cpu = metrics ? getLastValue(metrics.percentageCpu, 'average') : null;
  const consumed = metrics ? getLastValue(metrics.cpuCreditsConsumed, 'total') : null;
  const remaining = metrics ? getLastValue(metrics.cpuCreditsRemaining, 'average') : null;

  const maxCredits = getMaxCredits(vm.vmSize);
  const remainingSlope = metrics ? calcSlopePerMinute(metrics.cpuCreditsRemaining, 'average') : null;

  let estimate: ReactNode = null;
  if (metrics && remaining != null && remainingSlope != null) {
    const THRESHOLD = 0.05;
    if (remainingSlope < -THRESHOLD) {
      const mins = remaining / Math.abs(remainingSlope);
      estimate = <span className="text-amber-600 font-medium">Est. depletion: {formatDuration(mins)}</span>;
    } else if (remainingSlope > THRESHOLD && maxCredits != null && remaining < maxCredits) {
      const mins = (maxCredits - remaining) / remainingSlope;
      estimate = <span className="text-emerald-600 font-medium">Est. full: {formatDuration(mins)}</span>;
    } else {
      estimate = <span className="text-gray-400">Credits stable</span>;
    }
  }

  const cpuData = metrics ? prepChartData(metrics.percentageCpu, 'average') : [];
  const remainingData = metrics ? prepChartData(metrics.cpuCreditsRemaining, 'average') : [];
  const consumedData = metrics ? prepChartData(metrics.cpuCreditsConsumed, 'total') : [];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-100">
        <span className="font-semibold text-gray-900">{vm.name}</span>
        <span className="inline-block px-2 py-0.5 text-xs font-mono bg-blue-50 text-blue-700 rounded">
          {vm.vmSize}
        </span>
        <span className="text-sm text-gray-500">{vm.resourceGroup}</span>
        <span className="text-sm text-gray-400">{vm.location}</span>
      </div>

      {metricsState === 'loading' && (
        <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
          <Spinner />
          <span className="text-sm">Loading metrics…</span>
        </div>
      )}

      {metricsState === 'error' && (
        <div className="px-5 py-4 text-sm text-red-600">Failed to load metrics: {metricsError}</div>
      )}

      {metricsState === 'done' && metrics && (
        <>
          <div className="grid grid-cols-3 divide-x divide-gray-100">
            <div className="px-4 py-3">
              <ChartPanel title="CPU %" current={cpu != null ? `${cpu.toFixed(1)}%` : '—'}>
                <MiniChart data={cpuData} color="#3b82f6" unit="%" decimals={1} yDomain={[0, 100]} />
              </ChartPanel>
            </div>
            <div className="px-4 py-3">
              <ChartPanel
                title="Credits Remaining"
                current={remaining != null ? remaining.toFixed(2) : '—'}
              >
                <MiniChart
                  data={remainingData}
                  color="#10b981"
                  decimals={2}
                  refLine={maxCredits}
                />
              </ChartPanel>
            </div>
            <div className="px-4 py-3">
              <ChartPanel
                title="Credits Consumed"
                current={consumed != null ? consumed.toFixed(2) : '—'}
              >
                <MiniChart data={consumedData} color="#f59e0b" decimals={2} />
              </ChartPanel>
            </div>
          </div>
          <div className="px-5 py-2 bg-gray-50 border-t border-gray-100 text-xs">
            {estimate ?? <span className="text-gray-400">—</span>}
          </div>
        </>
      )}
    </div>
  );
}

export default function SpaApp() {
  const [vmRows, setVmRows] = useState<VmRow[]>([]);
  const [vmListState, setVmListState] = useState<FetchState>('idle');
  const [vmListError, setVmListError] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
          setVmRows((prev) =>
            prev.map((row, i) => (i === index ? { ...row, metrics: data.metrics, metricsState: 'done' } : row)),
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setVmRows((prev) =>
            prev.map((row, i) => (i === index ? { ...row, metricsState: 'error', metricsError: msg } : row)),
          );
        }
      }),
    );

    setLastUpdated(new Date().toLocaleTimeString());
  }, []);

  const refreshInBackground = useCallback(async () => {
    setIsRefreshing(true);

    try {
      const data = await readJson<{ vms: VirtualMachine[] }>(await fetch('/api/vms'));
      const vms = data.vms;

      setVmRows((prev) => {
        const existingIds = new Set(prev.map((r) => r.vm.resourceId));
        const newRows = vms
          .filter((vm) => !existingIds.has(vm.resourceId))
          .map((vm) => ({ vm, metrics: null, metricsState: 'loading' as const }));
        return newRows.length > 0 ? [...prev, ...newRows] : prev;
      });

      await Promise.all(
        vms.map(async (vm) => {
          try {
            const resp = await readJson<{ metrics: VmMetrics }>(
              await fetch(`/api/metrics?resourceId=${encodeURIComponent(vm.resourceId)}`),
            );
            setVmRows((prev) =>
              prev.map((row) =>
                row.vm.resourceId === vm.resourceId
                  ? { ...row, metrics: resp.metrics, metricsState: 'done' as const }
                  : row,
              ),
            );
          } catch {
            // keep existing data on fetch error
          }
        }),
      );

      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      // keep existing data on VM list fetch error
    }

    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(refreshInBackground, 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, refreshInBackground]);

  const isLoading = vmListState === 'loading' || vmRows.some((r) => r.metricsState === 'loading');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Azure Burst Monitor</h1>
          <p className="text-sm text-gray-500 mt-0.5">B-series VM CPU burstable credit &amp; utilization</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-400 tabular-nums">
              Last updated: {lastUpdated}
              {isRefreshing && <span className="ml-1 text-blue-500">⟳</span>}
            </span>
          )}
          <button
            onClick={() => setAutoRefresh((prev) => !prev)}
            className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
              autoRefresh
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Auto: {autoRefresh ? 'On' : 'Off'}
            {autoRefresh && <span className="ml-1 text-emerald-500 text-xs">(30s)</span>}
          </button>
          <button
            onClick={fetchAll}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading && <Spinner />}
            {isLoading ? 'Fetching…' : 'Refresh'}
          </button>
        </div>
      </header>

      <main className="px-6 py-6 max-w-7xl mx-auto">
        {vmListState === 'error' && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
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
          <div className="text-center py-12 text-gray-500">No B-series VMs found in this subscription.</div>
        )}

        {vmRows.length > 0 && (
          <div className="flex flex-col gap-4">
            {vmRows.map((row) => (
              <VmCard key={row.vm.resourceId} row={row} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
