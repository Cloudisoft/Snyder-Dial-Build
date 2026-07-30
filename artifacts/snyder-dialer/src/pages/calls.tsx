import { useGetDashboardActivity } from '@workspace/api-client-react';
import { Badge } from '@/components/ui/badge';
import { Phone, CheckCircle2, XCircle, Clock, Voicemail } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function Calls() {
  const { data: activity, isLoading } = useGetDashboardActivity();

  // Filter for call-related activity
  const callActivity = activity?.filter((item) => item.type === 'call_completed') || [];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-chart-5" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-destructive" />;
      case 'no_answer':
        return <Clock className="w-4 h-4 text-chart-2" />;
      case 'voicemail':
        return <Voicemail className="w-4 h-4 text-muted-foreground" />;
      default:
        return <Phone className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-chart-5 text-background';
      case 'failed':
        return 'bg-destructive text-destructive-foreground';
      case 'no_answer':
        return 'bg-chart-2 text-background';
      case 'in_progress':
        return 'bg-primary text-primary-foreground';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Global Call Log</h1>
        <p className="text-muted-foreground">All calls across all campaigns</p>
      </div>

      <div className="bg-card border border-card-border rounded-lg">
        <div className="px-6 py-4 border-b border-card-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Calls</h2>
            <p className="text-sm text-muted-foreground font-mono">
              {callActivity.length} total
            </p>
          </div>
        </div>
        <div className="divide-y divide-card-border">
          {isLoading ? (
            <>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="px-6 py-5 h-24 animate-pulse" />
              ))}
            </>
          ) : callActivity.length > 0 ? (
            callActivity.map((item) => (
              <div
                key={item.id}
                className="px-6 py-5 hover:bg-muted/50 transition-colors"
                data-testid={`call-${item.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Phone className="w-4 h-4 text-primary" />
                      <p className="font-medium">{item.message}</p>
                    </div>
                    {item.campaignName && (
                      <p className="text-sm text-muted-foreground">
                        Campaign: {item.campaignName}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground font-mono mb-2">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-24 text-center">
              <Phone className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground mb-2">No calls yet</p>
              <p className="text-sm text-muted-foreground">
                Launch a campaign to start making calls
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
