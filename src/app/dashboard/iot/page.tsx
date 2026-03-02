'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import {
  ComputerDesktopIcon, SignalIcon, WifiIcon,
  ExclamationTriangleIcon, CheckCircleIcon, XCircleIcon,
  ArrowPathIcon, BoltIcon, CpuChipIcon, ServerIcon,
  DeviceTabletIcon, ChevronDownIcon, ChevronUpIcon,
  InformationCircleIcon, BeakerIcon,
} from '@heroicons/react/24/outline';

// ─── Types ────────────────────────────────────────────────────
interface Device {
  id: string; name: string; type: string; status: 'online' | 'offline' | 'warning';
  location: string; ip: string; lastSeen: Date;
  uptime: number; temperature: number; cpu: number; memory: number; network: number;
  battery: number | null;
}
interface Alert {
  id: string; device: string; type: 'error' | 'warning' | 'info';
  message: string; timestamp: Date; resolved: boolean;
}

// ─── Seed fallback data ───────────────────────────────────────
const SEED_DEVICES: Device[] = [
  { id: '1', name: 'Computer Lab 1 · Main Server', type: 'server', status: 'online', location: 'Computer Lab 1', ip: '192.168.1.100', lastSeen: new Date(), uptime: 99.8, temperature: 45, cpu: 23, memory: 67, network: 85, battery: null },
  { id: '2', name: 'Computer Lab 2 · Workstation', type: 'workstation', status: 'online', location: 'Computer Lab 2', ip: '192.168.1.101', lastSeen: new Date(Date.now() - 300000), uptime: 95.2, temperature: 38, cpu: 45, memory: 78, network: 92, battery: 85 },
  { id: '3', name: 'IoT Hub · Central Controller', type: 'hub', status: 'warning', location: 'Main Office', ip: '192.168.1.50', lastSeen: new Date(Date.now() - 600000), uptime: 87.5, temperature: 52, cpu: 67, memory: 89, network: 73, battery: null },
  { id: '4', name: 'Tablet 01', type: 'tablet', status: 'offline', location: 'Classroom A', ip: '192.168.1.102', lastSeen: new Date(Date.now() - 3600000), uptime: 0, temperature: 0, cpu: 0, memory: 0, network: 0, battery: 15 },
  { id: '5', name: 'Network Switch · Core', type: 'switch', status: 'online', location: 'Server Room', ip: '192.168.1.1', lastSeen: new Date(), uptime: 99.9, temperature: 42, cpu: 12, memory: 34, network: 98, battery: null },
];
const SEED_ALERTS: Alert[] = [
  { id: '1', device: 'IoT Hub · Central Controller', type: 'warning', message: 'High temperature detected (52°C)', timestamp: new Date(Date.now() - 300000), resolved: false },
  { id: '2', device: 'Tablet 01', type: 'error', message: 'Device offline for more than 1 hour', timestamp: new Date(Date.now() - 3600000), resolved: false },
  { id: '3', device: 'Computer Lab 2 · Workstation', type: 'info', message: 'Software update available', timestamp: new Date(Date.now() - 1800000), resolved: true },
];

// ─── Helpers ──────────────────────────────────────────────────
function statusBadge(s: string) {
  if (s === 'online') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (s === 'warning') return 'bg-amber-500/20  text-amber-400  border-amber-500/30';
  return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
}
function alertBg(t: string) {
  if (t === 'error') return 'bg-rose-500/10 border-rose-500/20 text-rose-400';
  if (t === 'warning') return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
  return 'bg-blue-500/10 border-blue-500/20 text-blue-400';
}
function ago(d: Date) {
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function DeviceIcon({ type }: { type: string }) {
  const cls = 'w-5 h-5';
  if (type === 'server') return <ServerIcon className={cls} />;
  if (type === 'hub') return <SignalIcon className={cls} />;
  if (type === 'switch') return <WifiIcon className={cls} />;
  if (type === 'tablet') return <DeviceTabletIcon className={cls} />;
  return <ComputerDesktopIcon className={cls} />;
}
function MiniBar({ pct, warn = 70, danger = 85 }: { pct: number; warn?: number; danger?: number }) {
  const color = pct >= danger ? 'bg-rose-500' : pct >= warn ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-white/40 w-8 text-right">{pct}%</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────
export default function IoTPage() {
  const { profile } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [dbLoading, setDbLoading] = useState(true);

  // ── Try to load real devices from DB ────────────────────────
  const loadFromDB = useCallback(async () => {
    setDbLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('iot_devices')
        .select('*')
        .order('last_seen', { ascending: false });

      if (error || !data || data.length === 0) {
        // Table doesn't exist or is empty — fall back to demo
        setIsDemo(true);
        setDevices(SEED_DEVICES);
        setAlerts(SEED_ALERTS);
      } else {
        setIsDemo(false);
        // Map DB rows → Device shape
        setDevices(data.map((row: any) => ({
          id: String(row.id),
          name: row.name ?? row.device_name ?? 'Unknown',
          type: row.type ?? row.device_type ?? 'workstation',
          status: row.status ?? 'offline',
          location: row.location ?? '—',
          ip: row.ip_address ?? row.ip ?? '—',
          lastSeen: new Date(row.last_seen ?? row.updated_at ?? Date.now()),
          uptime: row.uptime_pct ?? row.uptime ?? 0,
          temperature: row.temperature ?? 0,
          cpu: row.cpu_usage ?? row.cpu ?? 0,
          memory: row.memory_usage ?? row.memory ?? 0,
          network: row.network_usage ?? row.network ?? 0,
          battery: row.battery_pct ?? row.battery ?? null,
        })));

        // Also load alerts if they exist
        const { data: alertData } = await supabase
          .from('iot_alerts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20);
        if (alertData && alertData.length > 0) {
          setAlerts(alertData.map((a: any) => ({
            id: String(a.id),
            device: a.device_name ?? a.device ?? '—',
            type: a.severity ?? a.type ?? 'info',
            message: a.message,
            timestamp: new Date(a.created_at),
            resolved: a.resolved ?? false,
          })));
        }
      }
    } catch {
      setIsDemo(true);
      setDevices(SEED_DEVICES);
      setAlerts(SEED_ALERTS);
    } finally {
      setDbLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => { loadFromDB(); }, [loadFromDB]);

  // ── Simulate live flicker on demo data ──────────────────────
  useEffect(() => {
    if (!autoRefresh) return;
    if (!isDemo && !dbLoading) {
      // Real mode: poll DB every 30s
      const id = setInterval(loadFromDB, 30000);
      return () => clearInterval(id);
    }
    if (isDemo) {
      // Demo: random flicker every 10s
      const id = setInterval(() => {
        setDevices(prev => prev.map(d => d.status === 'online' ? {
          ...d,
          temperature: Math.min(70, Math.max(35, d.temperature + (Math.random() - 0.5) * 4)),
          cpu: Math.min(100, Math.max(5, d.cpu + (Math.random() - 0.5) * 8)),
          memory: Math.min(100, Math.max(20, d.memory + (Math.random() - 0.5) * 5)),
          lastSeen: new Date(),
        } : d));
        setLastRefresh(new Date());
      }, 10000);
      return () => clearInterval(id);
    }
  }, [autoRefresh, isDemo, dbLoading, loadFromDB]);

  const resolveAlert = (id: string) =>
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));

  const online = devices.filter(d => d.status === 'online').length;
  const warning = devices.filter(d => d.status === 'warning').length;
  const offline = devices.filter(d => d.status === 'offline').length;
  const avgCpu = Math.round(devices.filter(d => d.status === 'online').reduce((a, d) => a + d.cpu, 0) / Math.max(online, 1));
  const avgTemp = Math.round(devices.filter(d => d.status === 'online').reduce((a, d) => a + d.temperature, 0) / Math.max(online, 1));

  if (dbLoading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-white/40 text-sm">Connecting to IoT infrastructure…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Demo mode banner */}
        {isDemo && (
          <div className="flex items-start gap-3 bg-violet-500/10 border border-violet-500/20 rounded-2xl px-5 py-4">
            <BeakerIcon className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-violet-300">Simulation Mode</p>
              <p className="text-xs text-violet-400/70 mt-0.5">
                No <code className="bg-white/10 px-1 rounded">iot_devices</code> table found in the database.
                Displaying simulated demo data with live random fluctuations.
                Connect real hardware and create the table to see live metrics.
              </p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <SignalIcon className="w-5 h-5 text-cyan-400" />
              <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">
                {isDemo ? 'Simulation · IoT' : 'Live · IoT'} Monitoring
              </span>
            </div>
            <h1 className="text-3xl font-extrabold">IoT Device Dashboard</h1>
            <p className="text-white/40 text-sm mt-1">
              Last updated {lastRefresh ? ago(lastRefresh) : '—'}
              {!isDemo && <span className="ml-2 text-emerald-400 text-xs font-semibold">● Live</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={loadFromDB}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white transition-all">
              <ArrowPathIcon className="w-4 h-4" /> Refresh
            </button>
            <button onClick={() => setAutoRefresh(v => !v)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-all
                ${autoRefresh
                  ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30'
                  : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}>
              <ArrowPathIcon className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
              {autoRefresh ? 'Auto ON' : 'Auto OFF'}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Devices', value: devices.length, icon: ComputerDesktopIcon, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'Online', value: online, icon: CheckCircleIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Warnings', value: warning, icon: ExclamationTriangleIcon, color: 'text-amber-400', bg: 'bg-amber-500/10' },
            { label: 'Offline', value: offline, icon: XCircleIcon, color: 'text-rose-400', bg: 'bg-rose-500/10' },
          ].map(s => (
            <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-white/40 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Cluster averages */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Avg CPU', value: avgCpu, unit: '%', color: avgCpu >= 85 ? 'text-rose-400' : avgCpu >= 70 ? 'text-amber-400' : 'text-emerald-400' },
            { label: 'Avg Temp', value: avgTemp, unit: '°C', color: avgTemp >= 55 ? 'text-rose-400' : avgTemp >= 48 ? 'text-amber-400' : 'text-emerald-400' },
            { label: 'Avg Uptime', value: Math.round(devices.reduce((a, d) => a + d.uptime, 0) / Math.max(devices.length, 1)), unit: '%', color: 'text-blue-400' },
            { label: 'Active Alerts', value: alerts.filter(a => !a.resolved).length, unit: '', color: 'text-violet-400' },
          ].map(s => (
            <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl p-4">
              <p className={`text-xl font-extrabold ${s.color}`}>{s.value}{s.unit}</p>
              <p className="text-xs text-white/30 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Device list */}
          <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-bold text-white">Connected Devices</h3>
              <span className="text-xs text-white/30">{devices.length} device{devices.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="divide-y divide-white/5">
              {devices.map(d => (
                <div key={d.id}>
                  <div
                    className="p-5 hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => setExpanded(expanded === d.id ? null : d.id)}>
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
                        ${d.status === 'online' ? 'bg-emerald-500/10 text-emerald-400' :
                          d.status === 'warning' ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'}`}>
                        <DeviceIcon type={d.type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-white text-sm truncate">{d.name}</p>
                          <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${statusBadge(d.status)}`}>
                            {d.status}
                          </span>
                        </div>
                        <p className="text-xs text-white/30 mt-0.5">{d.location} · {d.ip}</p>
                        {d.status === 'online' && (
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            <MiniBar pct={Math.round(d.cpu)} />
                            <MiniBar pct={Math.round(d.memory)} />
                            <MiniBar pct={Math.min(100, Math.round(d.temperature * 1.2))} warn={60} danger={80} />
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs text-white/40">{d.uptime > 0 ? `${d.uptime.toFixed(1)}%` : 'Offline'}</p>
                        <p className="text-[10px] text-white/20 mt-0.5">{ago(d.lastSeen)}</p>
                        {expanded === d.id
                          ? <ChevronUpIcon className="w-4 h-4 text-white/20 mt-1 ml-auto" />
                          : <ChevronDownIcon className="w-4 h-4 text-white/20 mt-1 ml-auto" />
                        }
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expanded === d.id && (
                    <div className="px-5 pb-5 bg-white/[0.02] border-t border-white/5">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
                        {[
                          { label: 'Temperature', value: `${Math.round(d.temperature)}°C`, icon: BoltIcon },
                          { label: 'CPU', value: `${Math.round(d.cpu)}%`, icon: CpuChipIcon },
                          { label: 'Memory', value: `${Math.round(d.memory)}%`, icon: ServerIcon },
                          { label: 'Network', value: `${d.network}%`, icon: WifiIcon },
                        ].map(m => (
                          <div key={m.label} className="bg-white/5 rounded-xl p-3">
                            <m.icon className="w-4 h-4 text-white/30 mb-1" />
                            <p className="text-sm font-bold text-white">{d.status === 'offline' ? '—' : m.value}</p>
                            <p className="text-[10px] text-white/30">{m.label}</p>
                          </div>
                        ))}
                      </div>
                      {d.battery !== null && (
                        <div className="mt-3 flex items-center gap-2 text-sm">
                          <span className="text-white/30 text-xs">Battery:</span>
                          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${d.battery < 20 ? 'bg-rose-500' : d.battery < 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${d.battery}%` }} />
                          </div>
                          <span className="text-xs text-white/40">{d.battery}%</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Alerts */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden h-fit">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-bold text-white">System Alerts</h3>
              <span className="text-xs text-white/30">{alerts.filter(a => !a.resolved).length} active</span>
            </div>
            <div className="divide-y divide-white/5">
              {alerts.length === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircleIcon className="w-10 h-10 mx-auto text-emerald-400/30 mb-2" />
                  <p className="text-white/30 text-sm">No alerts</p>
                </div>
              ) : alerts.map(a => (
                <div key={a.id} className={`p-4 hover:bg-white/5 transition-colors ${a.resolved ? 'opacity-40' : ''}`}>
                  <div className={`flex items-start gap-3 p-3 rounded-xl border ${alertBg(a.type)}`}>
                    <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold">{a.device}</p>
                      <p className="text-xs mt-0.5 opacity-80">{a.message}</p>
                      <p className="text-[10px] opacity-50 mt-1">{ago(a.timestamp)}</p>
                    </div>
                  </div>
                  {!a.resolved && (
                    <button onClick={() => resolveAlert(a.id)}
                      className="mt-2 w-full py-1.5 text-xs font-bold text-white/30 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors">
                      Resolve
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* DB integration tip (admin only) */}
        {isDemo && profile?.role === 'admin' && (
          <div className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-2xl px-5 py-4">
            <InformationCircleIcon className="w-5 h-5 text-white/30 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-white/50">Connect Real Devices</p>
              <p className="text-xs text-white/30 mt-1">
                Create an <code className="bg-white/10 px-1 rounded">iot_devices</code> table in Supabase with columns:
                {' '}<code className="bg-white/10 px-1 rounded">id, name, type, status, location, ip_address, last_seen, uptime_pct, temperature, cpu_usage, memory_usage, network_usage, battery_pct</code>.
                This page will auto-detect and display live data on next refresh.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}