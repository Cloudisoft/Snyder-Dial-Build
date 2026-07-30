import { useGetDashboardStats, useGetDashboardActivity, getGetDashboardStatsQueryKey, getGetDashboardActivityQueryKey } from '@workspace/api-client-react';
import { StatCard } from '@/components/ui/stat-card';
import { Megaphone, Users, Phone, CheckCircle2, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({
    query: {
      queryKey: getGetDashboardStatsQueryKey(),
      // Poll every 30s while at least one campaign is active
      refetchInterval: (query) => {
        const data = query.state.data;
        return data && data.activeCampaigns > 0 ? 30_000 : false;
      },
    },
  });

  const hasActiveCampaigns = (stats?.activeCampaigns ?? 0) > 0;

  const { data: activity, isLoading: activityLoading } = useGetDashboardActivity({
    query: {
      queryKey: getGetDashboardActivityQueryKey(),
      // Mirror stats polling interval so activity feed stays in sync
      refetchInterval: hasActiveCampaigns ? 30_000 : false,
    },
  });

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Command Center</h1>
        <p className="text-muted-foreground">Real-time campaign performance overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {statsLoading ? (
          <>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-card border border-card-border rounded-lg h-32 animate-pulse" />
            ))}
          </>
        ) : stats ? (
          <>
            <StatCard
              label="Total Campaigns"
              value={stats.totalCampaigns}
              icon={Megaphone}
              data-testid="stat-total-campaigns"
            />
            <StatCard
              label="Active Campaigns"
              value={stats.activeCampaigns}
              icon={Megaphone}
              data-testid="stat-active-campaigns"
            />
            <StatCard
              label="Total Leads"
              value={stats.totalLeads.toLocaleString()}
              icon={Users}
              data-testid="stat-total-leads"
            />
            <StatCard
              label="Total Calls"
              value={stats.totalCalls.toLocaleString()}
              icon={Phone}
              data-testid="stat-total-calls"
            />
            <StatCard
              label="Successful Calls"
              value={stats.successfulCalls.toLocaleString()}
              icon={CheckCircle2}
              data-testid="stat-successful-calls"
            />
            <StatCard
              label="Avg Call Duration"
              value={formatDuration(stats.avgCallDuration)}
              icon={Clock}
              data-testid="stat-avg-duration"
            />
          </>
        ) : null}
      </div>

      {/* Activity Feed */}
      <div className="bg-card border border-card-border rounded-lg">
        <div className="px-6 py-4 border-b border-card-border">
          <h2 className="text-lg font-semibold">Recent Activity</h2>
        </div>
        <div className="divide-y divide-card-border">
          {activityLoading ? (
            <>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="px-6 py-4 h-20 animate-pulse" />
              ))}
            </>
          ) : activity && activity.length > 0 ? (
            activity.map((item) => (
              <div
                key={item.id}
                className="px-6 py-4 hover:bg-muted/50 transition-colors"
                data-testid={`activity-${item.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm">{item.message}</p>
                    {item.campaignName && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Campaign: {item.campaignName}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">
                    {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-12 text-center text-muted-foreground">
              No recent activity
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
