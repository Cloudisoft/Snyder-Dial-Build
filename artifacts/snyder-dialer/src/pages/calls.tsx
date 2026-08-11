import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Phone, RefreshCw, Search, Radio, PhoneOff, PhoneMissed,
  Voicemail, PhoneForwarded, Bot, CheckCircle2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  CallRow, FilterTabs, getDisposition, DispositionIcon,
  statusBadgeClass, type CallRecord, type FilterId,
} from '@/components/call-row';
import { getToken } from '@/lib/auth';
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const PAGE_SIZE = 50;

async function fetchAllCalls(): Promise<CallRecord[]> {
  const res = await fetch(`${BASE}/api/calls/all`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Failed to fetch calls');
  return res.json();
}

interface StatChipProps {
  label: string;
  count: number;
  icon: React.ReactNode;
  colorClass: string;
  active?: boolean;
  onClick: () => void;
}
function StatChip({ label, count, icon, colorClass, active, onClick }: StatChipProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-left ${
        active
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-card-border bg-card hover:border-foreground/20 hover:bg-muted/30'
      }`}
    >
      <span className={`${colorClass} shrink-0`}>{icon}</span>
      <div>
        <p className={`text-lg font-bold leading-none ${active ? 'text-primary' : 'text-foreground'}`}>{count}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 whitespace-nowrap">{label}</p>
      </div>
    </button>
  );
}

export default function Calls() {
  const [activeFilter, setActiveFilter] = useState<FilterId>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const { data: calls = [], isLoading, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['calls', 'all'],
    queryFn: fetchAllCalls,
    refetchInterval: 10_000,
    staleTime: 8_000,
  });

  useEffect(() => {
    if (dataUpdatedAt) setLastRefreshed(new Date(dataUpdatedAt));
  }, [dataUpdatedAt]);

  // Reset page when filter/search changes
  useEffect(() => { setPage(1); }, [activeFilter, search]);

  // Disposition counts for stat chips + filter tabs
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

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const secondsAgo = Math.round((Date.now() - lastRefreshed.getTime()) / 1000);

  const STAT_CHIPS = [
    {
      id: 'in_progress' as FilterId,
      label: 'Live',
      icon: <Radio className="w-4 h-4" />,
      color: 'text-blue-500',
    },
    {
      id: 'appointment' as FilterId,
      label: 'Appointment',
      icon: <CheckCircle2 className="w-4 h-4" />,
      color: 'text-teal-500',
    },
    {
      id: 'transferred' as FilterId,
      label: 'Transferred',
      icon: <PhoneForwarded className="w-4 h-4" />,
      color: 'text-violet-500',
    },
    {
      id: 'voicemail' as FilterId,
      label: 'Voicemail',
      icon: <Voicemail className="w-4 h-4" />,
      color: 'text-purple-500',
    },
    {
      id: 'answering_machine' as FilterId,
      label: 'Answ. Machine',
      icon: <Bot className="w-4 h-4" />,
      color: 'text-indigo-500',
    },
    {
      id: 'hung_up' as FilterId,
      label: 'Hung Up',
      icon: <PhoneOff className="w-4 h-4" />,
      color: 'text-orange-500',
    },
    {
      id: 'no_answer' as FilterId,
      label: 'No Answer',
      icon: <PhoneMissed className="w-4 h-4" />,
      color: 'text-amber-500',
    },
    {
      id: 'completed' as FilterId,
      label: 'Completed',
      icon: <Phone className="w-4 h-4" />,
      color: 'text-emerald-500',
    },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Call Logs</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {calls.length.toLocaleString()} total calls · auto-refreshes every 10s
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-primary' : ''}`} />
          {isFetching ? 'Refreshing…' : `${secondsAgo}s ago`}
        </button>
      </div>

      {/* Stats chips */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {STAT_CHIPS.map((chip) => (
          <StatChip
            key={chip.id}
            label={chip.label}
            count={counts[chip.id] ?? 0}
            icon={chip.icon}
            colorClass={chip.color}
            active={activeFilter === chip.id}
            onClick={() => setActiveFilter(activeFilter === chip.id ? 'all' : chip.id)}
          />
        ))}
      </div>

      {/* Call list card */}
      <div className="bg-card border border-card-border rounded-lg overflow-hidden">
        {/* Search + count bar */}
        <div className="px-4 py-2.5 border-b border-card-border flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, campaign…"
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="ml-auto flex items-center gap-3">
            {counts['in_progress'] > 0 && (
              <span className="flex items-center gap-1 text-xs text-blue-500 font-semibold animate-pulse">
                <Radio className="w-3 h-3" /> {counts['in_progress']} live
              </span>
            )}
            <span className="text-xs text-muted-foreground font-mono">
              {filtered.length.toLocaleString()} calls
            </span>
          </div>
        </div>

        {/* Filter tabs */}
        <FilterTabs active={activeFilter} counts={counts} onChange={(f) => setActiveFilter(f)} />

        {/* Column headers (desktop) */}
        {!isLoading && filtered.length > 0 && (
          <div className="hidden sm:grid grid-cols-[20px_1.5fr_1fr_1fr_auto_auto] gap-x-3 px-4 py-2 bg-muted/20 border-b border-card-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span />
            <span>Lead</span>
            <span>Campaign</span>
            <span>Duration</span>
            <span>Disposition</span>
            <span>When</span>
          </div>
        )}

        {/* Rows */}
        <div>
          {isLoading ? (
            <div className="divide-y divide-card-border">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="px-4 py-3 h-16 animate-pulse bg-muted/20" />
              ))}
            </div>
          ) : paginated.length > 0 ? (
            <div>
              {paginated.map((call) => (
                <CallRow
                  key={call.id}
                  call={call}
                  showCampaign
                  onSync={() => refetch()}
                  data-testid={`call-row-${call.id}`}
                />
              ))}
            </div>
          ) : (
            <div className="px-6 py-16 text-center">
              <Phone className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground font-medium">
                {activeFilter === 'all' && !search ? 'No calls yet' : 'No calls match this filter'}
              </p>
              <p className="text-sm text-muted-foreground mt-1 opacity-70">
                {activeFilter === 'all' && !search
                  ? 'Launch a campaign to start making calls'
                  : 'Try a different filter or clear the search'}
              </p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-card-border bg-muted/10">
            <p className="text-xs text-muted-foreground">
              Showing {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2.5 py-1 rounded text-xs border border-border disabled:opacity-30 hover:bg-muted transition-colors"
              >
                ← Prev
              </button>
              {/* Page number pills — show up to 5 */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const offset = Math.max(0, Math.min(totalPages - 5, page - 3));
                const p = i + 1 + offset;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-7 h-7 rounded text-xs transition-colors ${
                      p === page
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border hover:bg-muted'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-2.5 py-1 rounded text-xs border border-border disabled:opacity-30 hover:bg-muted transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
