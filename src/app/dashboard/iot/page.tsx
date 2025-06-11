'use client';

import { useState, useEffect } from 'react';
import { 
  ComputerDesktopIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  SignalIcon,
  WifiIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline'
import Chart from '@/components/ui/Chart';

// Mock IoT data
const mockIoTData = {
  devices: [
    {
      id: '1',
      name: 'Computer Lab 1 - Main Server',
      type: 'server',
      status: 'online',
      location: 'Computer Lab 1',
      ip: '192.168.1.100',
      lastSeen: new Date(),
      uptime: 99.8,
      temperature: 45,
      cpu: 23,
      memory: 67,
      network: 85,
      battery: null
    },
    {
      id: '2',
      name: 'Computer Lab 2 - Workstation',
      type: 'workstation',
      status: 'online',
      location: 'Computer Lab 2',
      ip: '192.168.1.101',
      lastSeen: new Date(Date.now() - 300000), // 5 minutes ago
      uptime: 95.2,
      temperature: 38,
      cpu: 45,
      memory: 78,
      network: 92,
      battery: 85
    },
    {
      id: '3',
      name: 'IoT Hub - Central Controller',
      type: 'hub',
      status: 'warning',
      location: 'Main Office',
      ip: '192.168.1.50',
      lastSeen: new Date(Date.now() - 600000), // 10 minutes ago
      uptime: 87.5,
      temperature: 52,
      cpu: 67,
      memory: 89,
      network: 73,
      battery: null
    },
    {
      id: '4',
      name: 'Mobile Device - Tablet 01',
      type: 'tablet',
      status: 'offline',
      location: 'Classroom A',
      ip: '192.168.1.102',
      lastSeen: new Date(Date.now() - 3600000), // 1 hour ago
      uptime: 0,
      temperature: 0,
      cpu: 0,
      memory: 0,
      network: 0,
      battery: 15
    },
    {
      id: '5',
      name: 'Network Switch - Core',
      type: 'switch',
      status: 'online',
      location: 'Server Room',
      ip: '192.168.1.1',
      lastSeen: new Date(),
      uptime: 99.9,
      temperature: 42,
      cpu: 12,
      memory: 34,
      network: 98,
      battery: null
    }
  ],
  alerts: [
    {
      id: '1',
      device: 'IoT Hub - Central Controller',
      type: 'warning',
      message: 'High temperature detected (52°C)',
      timestamp: new Date(Date.now() - 300000),
      resolved: false
    },
    {
      id: '2',
      device: 'Mobile Device - Tablet 01',
      type: 'error',
      message: 'Device offline for more than 1 hour',
      timestamp: new Date(Date.now() - 3600000),
      resolved: false
    },
    {
      id: '3',
      device: 'Computer Lab 2 - Workstation',
      type: 'info',
      message: 'Software update available',
      timestamp: new Date(Date.now() - 1800000),
      resolved: true
    }
  ],
  metrics: {
    totalDevices: 5,
    onlineDevices: 3,
    offlineDevices: 1,
    warningDevices: 1,
    avgUptime: 76.5,
    avgTemperature: 35.4,
    avgCpu: 29.4,
    avgMemory: 53.6
  }
};

export default function IoTPage() {
  const [data, setData] = useState(mockIoTData);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Auto refresh data
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      // Simulate data updates
      setData(prev => ({
        ...prev,
        devices: prev.devices.map(device => ({
          ...device,
          lastSeen: new Date(),
          temperature: device.status === 'online' ? Math.floor(Math.random() * 20) + 35 : 0,
          cpu: device.status === 'online' ? Math.floor(Math.random() * 50) + 10 : 0,
          memory: device.status === 'online' ? Math.floor(Math.random() * 30) + 50 : 0
        }))
      }));
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300';
      case 'offline':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300';
      case 'warning':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800';
      case 'warning':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800';
      case 'info':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-600';
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'server':
        return <ComputerDesktopIcon className="h-6 w-6" />;
      case 'workstation':
        return <ComputerDesktopIcon className="h-6 w-6" />;
      case 'hub':
        return <SignalIcon className="h-6 w-6" />;
      case 'tablet':
        return <ComputerDesktopIcon className="h-6 w-6" />;
      case 'switch':
        return <WifiIcon className="h-6 w-6" />;
      default:
        return <ComputerDesktopIcon className="h-6 w-6" />;
    }
  };

  const formatUptime = (uptime: number) => {
    if (uptime === 0) return 'Offline';
    return `${uptime.toFixed(1)}%`;
  };

  const formatLastSeen = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    return `${days} days ago`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">IoT Device Monitoring</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Monitor and manage connected devices</p>
        </div>
        <div className="mt-4 sm:mt-0 flex items-center space-x-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`inline-flex items-center px-4 py-2 rounded-lg transition-colors ${
              autoRefresh
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-600 text-white hover:bg-gray-700'
            }`}
          >
            <MagnifyingGlassIcon className="h-5 w-5 mr-2" />
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </button>
          <button className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <PlusIcon className="h-5 w-5 mr-2" />
            Add Device
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <ComputerDesktopIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Devices</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.metrics.totalDevices}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
              <CheckCircleIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Online</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.metrics.onlineDevices}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl">
              <ExclamationTriangleIcon className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Warnings</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.metrics.warningDevices}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
              <ComputerDesktopIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Avg Uptime</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.metrics.avgUptime}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Devices and Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Devices List */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Connected Devices</h3>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {data.devices.map((device) => (
                <div
                  key={device.id}
                  className={`p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer ${
                    selectedDevice === device.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                  onClick={() => setSelectedDevice(selectedDevice === device.id ? null : device.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="text-gray-400 dark:text-gray-500">
                        {getDeviceIcon(device.type)}
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">{device.name}</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{device.location} • {device.ip}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(device.status)}`}>
                        {device.status}
                      </span>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatUptime(device.uptime)}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {formatLastSeen(device.lastSeen)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {selectedDevice === device.id && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600 dark:text-gray-400">Temperature</p>
                          <p className="font-medium text-gray-900 dark:text-white">{device.temperature}°C</p>
                        </div>
                        <div>
                          <p className="text-gray-600 dark:text-gray-400">CPU Usage</p>
                          <p className="font-medium text-gray-900 dark:text-white">{device.cpu}%</p>
                        </div>
                        <div>
                          <p className="text-gray-600 dark:text-gray-400">Memory</p>
                          <p className="font-medium text-gray-900 dark:text-white">{device.memory}%</p>
                        </div>
                        <div>
                          <p className="text-gray-600 dark:text-gray-400">Network</p>
                          <p className="font-medium text-gray-900 dark:text-white">{device.network}%</p>
                        </div>
                      </div>
                      {device.battery !== null && (
                        <div className="mt-3">
                          <p className="text-gray-600 dark:text-gray-400 text-sm">Battery</p>
                          <div className="flex items-center space-x-2">
                            <ComputerDesktopIcon className="h-4 w-4 text-gray-400" />
                            <span className="font-medium text-gray-900 dark:text-white">{device.battery}%</span>
                          </div>
                        </div>
                      )}
                      <div className="mt-4 flex items-center space-x-2">
                        <button className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                          <EyeIcon className="h-4 w-4 mr-1" />
                          View Details
                        </button>
                        <button className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
                          <ComputerDesktopIcon className="h-4 w-4 mr-1" />
                          Configure
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">System Alerts</h3>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {data.alerts.map((alert) => (
              <div key={alert.id} className="p-4">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-1">
                    {alert.type === 'error' && <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />}
                    {alert.type === 'warning' && <ExclamationTriangleIcon className="h-4 w-4 text-yellow-500" />}
                    {alert.type === 'info' && <CheckCircleIcon className="h-4 w-4 text-blue-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {alert.device}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {alert.message}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      {formatLastSeen(alert.timestamp)}
                    </p>
                  </div>
                  {!alert.resolved && (
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getAlertColor(alert.type)}`}>
                      Active
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Performance Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Chart
          title="System Performance Overview"
          data={[
            { label: 'CPU', value: data.metrics.avgCpu, change: 5 },
            { label: 'Memory', value: data.metrics.avgMemory, change: -2 },
            { label: 'Temperature', value: data.metrics.avgTemperature, change: 1 },
            { label: 'Uptime', value: data.metrics.avgUptime, change: 0.5 }
          ]}
          type="progress"
          height={300}
          showValues={true}
          showChange={true}
        />

        <Chart
          title="Device Status Distribution"
          data={[
            { label: 'Online', value: (data.metrics.onlineDevices / data.metrics.totalDevices) * 100, color: 'bg-green-500' },
            { label: 'Offline', value: (data.metrics.offlineDevices / data.metrics.totalDevices) * 100, color: 'bg-red-500' },
            { label: 'Warning', value: (data.metrics.warningDevices / data.metrics.totalDevices) * 100, color: 'bg-yellow-500' }
          ]}
          type="pie"
          height={300}
          showValues={true}
        />
      </div>
    </div>
  );
} 