"use client";
import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  RadialLinearScale,
} from 'chart.js';
import { Line, Bar, Doughnut, Radar } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  RadialLinearScale
);

interface ChartProps {
  type: 'line' | 'bar' | 'doughnut' | 'radar';
  data: any;
  options?: any;
  title?: string;
  className?: string;
}

const Chart: React.FC<ChartProps> = ({ 
  type, 
  data, 
  options = {}, 
  title,
  className = '' 
}) => {
  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: title ? {
        display: true,
        text: title,
      } : {
        display: false,
      },
    },
    scales: type !== 'doughnut' && type !== 'radar' ? {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
        },
      },
      x: {
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
        },
      },
    } : undefined,
  };

  const chartOptions = { ...defaultOptions, ...options };

  const renderChart = () => {
    switch (type) {
      case 'line':
        return <Line data={data} options={chartOptions} />;
      case 'bar':
        return <Bar data={data} options={chartOptions} />;
      case 'doughnut':
        return <Doughnut data={data} options={chartOptions} />;
      case 'radar':
        return <Radar data={data} options={chartOptions} />;
      default:
        return <Line data={data} options={chartOptions} />;
    }
  };

  return (
    <div className={`bg-card rounded-lg shadow-sm border border-border p-6 ${className}`}>
      <div className="h-64">
        {renderChart()}
      </div>
    </div>
  );
};

// Predefined chart configurations
export const createLineChartData = (
  labels: string[],
  datasets: Array<{
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string;
  }>
) => ({
  labels,
  datasets: datasets.map((dataset, index) => ({
    ...dataset,
    borderColor: dataset.borderColor || `hsl(${index * 60}, 70%, 50%)`,
    backgroundColor: dataset.backgroundColor || `hsla(${index * 60}, 70%, 50%, 0.1)`,
    tension: 0.4,
  })),
});

export const createBarChartData = (
  labels: string[],
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string;
  }>
) => ({
  labels,
  datasets: datasets.map((dataset, index) => ({
    ...dataset,
    backgroundColor: dataset.backgroundColor || `hsl(${index * 60}, 70%, 50%)`,
  })),
});

export const createDoughnutChartData = (
  labels: string[],
  data: number[]
) => ({
  labels,
  datasets: [
    {
      data,
      backgroundColor: [
        '#3B82F6', // blue
        '#10B981', // green
        '#F59E0B', // yellow
        '#EF4444', // red
        '#8B5CF6', // purple
        '#06B6D4', // cyan
        '#F97316', // orange
        '#EC4899', // pink
      ],
      borderWidth: 2,
      borderColor: '#ffffff',
    },
  ],
});

export default Chart; 