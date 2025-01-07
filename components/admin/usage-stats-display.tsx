'use client';

import { useEffect, useState } from 'react';
import { DateRange } from 'react-day-picker';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Line, Pie, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartData,
  ArcElement,
  BarElement,
} from 'chart.js';
import { format, parseISO } from 'date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface UsageData {
  id: string;
  timestamp: string;
  userId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  duration?: number;
  error?: boolean;
}

interface AggregatedStats {
  totalRequests: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  averageResponseTime: number;
  errorRate: number;
  uniqueUsers: number;
  modelDistribution: { [key: string]: number };
  peakHour: { hour: number; count: number };
  estimatedCost: number;
}

interface UsageStatsDisplayProps {
  dateRange?: DateRange;
}

export default function UsageStatsDisplay({ dateRange }: UsageStatsDisplayProps) {
  const [usageData, setUsageData] = useState<UsageData[]>([]);
  const [aggregatedStats, setAggregatedStats] = useState<AggregatedStats | null>(null);
  const [chartData, setChartData] = useState<ChartData<'line'>>({
    labels: [],
    datasets: [],
  });
  const [modelChartData, setModelChartData] = useState<ChartData<'pie'>>({
    labels: [],
    datasets: [],
  });
  const [hourlyChartData, setHourlyChartData] = useState<ChartData<'bar'>>({
    labels: [],
    datasets: [],
  });
  const [dailyRequestsData, setDailyRequestsData] = useState<ChartData<'bar'>>({
    labels: [],
    datasets: [],
  });
  const [userRequestsData, setUserRequestsData] = useState<ChartData<'bar'>>({
    labels: [],
    datasets: [],
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const params = new URLSearchParams();
        if (dateRange?.from) {
          params.append('startDate', dateRange.from.toISOString());
        }
        if (dateRange?.to) {
          params.append('endDate', dateRange.to.toISOString());
        }

        const response = await fetch(`/api/admin/stats?${params.toString()}`);
        if (!response.ok) {
          throw new Error('Failed to fetch stats');
        }
        
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch stats');
        }

        setUsageData(data.data.stats);
        setAggregatedStats(data.data.aggregated);

        // Prepare chart data
        const dates = data.data.stats.map((stat: UsageData) => 
          format(parseISO(stat.timestamp), 'MMM dd')
        ).reverse();
        
        const tokenData = data.data.stats.map((stat: UsageData) => stat.totalTokens).reverse();

        setChartData({
          labels: dates,
          datasets: [
            {
              label: 'Total Tokens Used',
              data: tokenData,
              borderColor: 'rgb(75, 192, 192)',
              tension: 0.1,
            },
          ],
        });

        // Prepare model distribution chart
        const modelLabels = Object.keys(data.data.aggregated.modelDistribution || {});
        const modelValues = Object.values(data.data.aggregated.modelDistribution || {}) as number[];
        
        setModelChartData({
          labels: modelLabels,
          datasets: [{
            data: modelValues,
            backgroundColor: [
              'rgb(255, 99, 132)',
              'rgb(54, 162, 235)',
              'rgb(255, 205, 86)'
            ],
          }],
        });

        // Prepare hourly usage chart
        const hours = Array.from({ length: 24 }, (_, i) => i);
        const hourlyData = hours.map(hour => {
          const count = data.data.stats.filter((stat: UsageData) => 
            new Date(stat.timestamp).getHours() === hour
          ).length;
          return count;
        });

        setHourlyChartData({
          labels: hours.map(h => `${h}:00`),
          datasets: [{
            label: 'Requests per Hour',
            data: hourlyData,
            backgroundColor: 'rgba(75, 192, 192, 0.5)',
          }],
        });

        // Prepare daily requests chart
        const dailyRequests = data.data.stats.reduce((acc: { [key: string]: number }, stat: UsageData) => {
          const day = format(parseISO(stat.timestamp), 'MMM dd');
          acc[day] = (acc[day] || 0) + 1;
          return acc;
        }, {});

        const dailyLabels = Object.keys(dailyRequests).reverse();
        const dailyCounts = Object.values(dailyRequests).reverse() as number[];

        setDailyRequestsData({
          labels: dailyLabels,
          datasets: [{
            label: 'Requests per Day',
            data: dailyCounts,
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            borderColor: 'rgb(54, 162, 235)',
            borderWidth: 1,
          }],
        });

        // Prepare user requests chart
        const userRequests = data.data.stats.reduce((acc: { [key: string]: number }, stat: UsageData) => {
          acc[stat.userId] = (acc[stat.userId] || 0) + 1;
          return acc;
        }, {});

        // Sort users by request count in descending order
        const sortedUsers = Object.entries(userRequests)
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .slice(0, 10); // Show top 10 users

        setUserRequestsData({
          labels: sortedUsers.map(([userId]) => userId),
          datasets: [{
            label: 'Requests per User',
            data: sortedUsers.map(([, count]) => count) as number[],
            backgroundColor: 'rgba(153, 102, 255, 0.5)',
            borderColor: 'rgb(153, 102, 255)',
            borderWidth: 1,
          }],
        });
      } catch (error) {
        console.error('Error fetching usage stats:', error);
        setError(error instanceof Error ? error.message : 'An error occurred');
      }
    };

    fetchData();
  }, [dateRange]);

  if (error) {
    return (
      <div className="p-4 text-red-500 bg-red-50 dark:bg-red-900/10 rounded-lg">
        Error: {error}
      </div>
    );
  }

  if (!usageData.length || !aggregatedStats) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-medium">Total Requests</h3>
          <p className="text-2xl font-bold">{aggregatedStats.totalRequests}</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-medium">Unique Users</h3>
          <p className="text-2xl font-bold">{aggregatedStats.uniqueUsers}</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-medium">Error Rate</h3>
          <p className="text-2xl font-bold">{(aggregatedStats.errorRate * 100).toFixed(2)}%</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-medium">Estimated Cost</h3>
          <p className="text-2xl font-bold">${aggregatedStats.estimatedCost.toFixed(2)}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-medium">Total Tokens</h3>
          <p className="text-2xl font-bold">{aggregatedStats.totalTokens}</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-medium">Avg Response Time</h3>
          <p className="text-2xl font-bold">{aggregatedStats.averageResponseTime.toFixed(2)}ms</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-medium">Peak Hour</h3>
          <p className="text-2xl font-bold">{aggregatedStats.peakHour.hour}:00 ({aggregatedStats.peakHour.count} requests)</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-medium">Tokens/Request</h3>
          <p className="text-2xl font-bold">
            {(aggregatedStats.totalTokens / aggregatedStats.totalRequests).toFixed(1)}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-4">Token Usage Over Time</h3>
          <div className="h-[300px]">
            <Line
              data={chartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'top' as const,
                  },
                },
              }}
            />
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-4">Daily Request Count</h3>
          <div className="h-[300px]">
            <Bar
              data={dailyRequestsData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'top' as const,
                  },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: {
                      precision: 0
                    }
                  }
                }
              }}
            />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-4">Model Distribution</h3>
          <div className="h-[300px]">
            <Pie
              data={modelChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'right' as const,
                  },
                },
              }}
            />
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-4">Requests per User (Top 10)</h3>
          <div className="h-[300px]">
            <Bar
              data={userRequestsData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'top' as const,
                  },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: {
                      precision: 0
                    }
                  }
                }
              }}
            />
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4">Hourly Usage Pattern</h3>
        <div className="h-[300px]">
          <Bar
            data={hourlyChartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: 'top' as const,
                },
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: {
                    precision: 0
                  }
                }
              }
            }}
          />
        </div>
      </Card>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Prompt Tokens</TableHead>
              <TableHead>Completion Tokens</TableHead>
              <TableHead>Total Tokens</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usageData.map((stat) => (
              <TableRow key={stat.id}>
                <TableCell>
                  {format(parseISO(stat.timestamp), 'MMM dd, yyyy HH:mm')}
                </TableCell>
                <TableCell>{stat.userId}</TableCell>
                <TableCell>{stat.model}</TableCell>
                <TableCell>{stat.promptTokens}</TableCell>
                <TableCell>{stat.completionTokens}</TableCell>
                <TableCell>{stat.totalTokens}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
} 