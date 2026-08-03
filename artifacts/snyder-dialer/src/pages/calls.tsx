import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Phone, RefreshCw, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { CallRow, FilterTabs, getDisposition, type CallRecord, type FilterId } from '@/components/call-row';
import { getToken } from '@/lib/auth';
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function fetchAllCalls(): Promise<CallRecord[]> {
  const res = await fetch(`${BASE}/api/calls/all`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Failed to fetch calls');
  return res.json();
}

export default function Calls() {
  const [activeFilter, setActiveFilter] = useState<FilterId>('all');
  const [search, setSearch] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const { data: calls = [], isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['calls', 'all'],
    queryFn: fetchAllCalls,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (dataUpdatedAt) setLastRefreshed(new Date(dataUpdatedAt));
  }, [dataUpdatedAt]);

  // Build counts per disposition for filter badges
  const counts: Record<string, number> = { all: calls.length };
  for (const call of calls) {
    const d = getDisposition(call);
    counts[d] = (counts[d] ?? 0) + 1;
  }

  // Apply filter + search
  const filtered = calls.filter((call) => {
    const matchFilter = activeFilter === 'all' || getDisposition(call) === activeFilter;
    if (!matchFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      call.leadName?.toLowerCase().includes(q) ||
      call.leadPhone?.includes(q) ||
      call.campaignName?.toLowerCase().includes(q) ||
      call.outcome?.toLowerCase().includes(q)
    );
  });

  const secondsAgo = Math.round((Date.now() - lastRefreshed.getTime()) / 1000);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Call History</h1>
          <p className="text-muted-foreground text-sm mt-0.5">All calls across all campaigns — updates every 15 seconds</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-primary' : ''}`} />
          {isFetching ? 'Refreshing…' : `Updated ${secondsAgo}s ago`}
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-lg overflow-hidden">
        {/* Search + live badge */}
        <div className="px-4 py-3 border-b border-card-border flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, campaign…"
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-muted-foreground font-medium">Live</span>
          </div>
          <span className="text-sm text-muted-foreground font-mono">{filtered.length} calls</span>
        </div>

        {/* Filter tabs */}
        <FilterTabs active={activeFilter} counts={counts} onChange={setActiveFilter} />

        {/* Call list */}
        <div>
          {isLoading ? (
            <div className="divide-y divide-card-border">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="px-6 py-4 h-20 animate-pulse bg-muted/30" />
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <div>
              {filtered.map((call) => (
                <CallRow key={call.id} call={call} showCampaign data-testid={`call-row-${call.id}`} />
              ))}
            </div>
          ) : (
            <div className="px-6 py-20 text-center">
              <Phone className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground font-medium">
                {activeFilter === 'all' && !search ? 'No calls yet' : 'No calls match this filter'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {activeFilter === 'all' && !search
                  ? 'Launch a campaign to start making calls'
                  : 'Try a different filter or clear the search'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
