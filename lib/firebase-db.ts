import { db } from './firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

export interface UsageStats {
  userId: string;
  timestamp: Timestamp;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  duration?: number;
  error?: boolean;
}

export interface AggregatedStats {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalRequests: number;
  averageResponseTime: number;
  errorRate: number;
  uniqueUsers: number;
  modelDistribution: { [key: string]: number };
  peakHour: { hour: number; count: number };
  estimatedCost: number;
}

export async function recordUsage(stats: Omit<UsageStats, 'timestamp'>) {
  try {
    await db.collection('usage_stats').add({
      ...stats,
      timestamp: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error recording usage stats:', error);
    throw error;
  }
}

export async function getUsageStats(startDate?: Date, endDate?: Date) {
  try {
    let query = db.collection('usage_stats').orderBy('timestamp', 'desc');
    
    if (startDate) {
      query = query.where('timestamp', '>=', Timestamp.fromDate(startDate));
    }
    if (endDate) {
      query = query.where('timestamp', '<=', Timestamp.fromDate(endDate));
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as UsageStats)
    }));
  } catch (error) {
    console.error('Error getting usage stats:', error);
    throw error;
  }
}

export async function getAggregatedStats(startDate?: Date, endDate?: Date): Promise<AggregatedStats> {
  try {
    const stats = await getUsageStats(startDate, endDate);
    
    // Calculate unique users
    const uniqueUsers = new Set(stats.map(stat => stat.userId)).size;
    
    // Calculate model distribution
    const modelDistribution = stats.reduce((acc, curr) => {
      acc[curr.model] = (acc[curr.model] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    // Calculate peak hour
    const hourlyDistribution = stats.reduce((acc, curr) => {
      const hour = curr.timestamp.toDate().getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {} as { [key: number]: number });

    const peakHour = Object.entries(hourlyDistribution)
      .reduce((peak, [hour, count]) => {
        return count > peak.count ? { hour: parseInt(hour), count } : peak;
      }, { hour: 0, count: 0 });

    // Calculate error rate
    const errorsCount = stats.filter(stat => stat.error).length;
    const errorRate = stats.length > 0 ? errorsCount / stats.length : 0;

    // Calculate average response time
    const totalDuration = stats.reduce((sum, stat) => sum + (stat.duration || 0), 0);
    const averageResponseTime = stats.length > 0 ? totalDuration / stats.length : 0;

    // Calculate estimated cost (example rates, adjust as needed)
    const costPerToken = {
      'gpt-4': 0.00003,
      'gpt-3.5-turbo': 0.000002,
      'default': 0.000002
    };

    const estimatedCost = stats.reduce((total, stat) => {
      const rate = costPerToken[stat.model as keyof typeof costPerToken] || costPerToken.default;
      return total + (stat.totalTokens * rate);
    }, 0);

    // Basic stats
    const basicStats = stats.reduce((acc, curr) => ({
      totalPromptTokens: acc.totalPromptTokens + curr.promptTokens,
      totalCompletionTokens: acc.totalCompletionTokens + curr.completionTokens,
      totalTokens: acc.totalTokens + curr.totalTokens,
      totalRequests: acc.totalRequests + 1
    }), {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      totalRequests: 0
    });

    return {
      ...basicStats,
      averageResponseTime,
      errorRate,
      uniqueUsers,
      modelDistribution,
      peakHour,
      estimatedCost
    };
  } catch (error) {
    console.error('Error getting aggregated stats:', error);
    throw error;
  }
} 