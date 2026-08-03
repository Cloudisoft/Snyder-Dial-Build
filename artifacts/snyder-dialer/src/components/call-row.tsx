import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Clock, MessageSquare, Mic, ExternalLink, RefreshCw, Radio } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'wouter';
import { getToken } from '@/lib/auth';
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export interface CallRecord {
  id: number;
  campaignId?: number | null;
  campaignName?: string | null;
  leadId?: number | null;
  leadName?: string | null;
  leadPhone?: string | null;
  vapiCallId?: string | null;
  status: string;
  duration?: number | null;
  transcript?: string | null;
  recordingUrl?: string | null;
  outcome?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt?: string | null;
}

/** Map a call to a canonical disposition for filtering and display. */
export function getDisposition(call: CallRecord): string {
  const outcome = (call.outcome ?? '').toLowerCase();
  if (outcome.includes('appointment') || outcome.includes('booked') || outcome.includes('book')) return 'appointment';
  if (outcome.includes('not interested') || outcome.includes('not_interested')) return 'not_interested';
  if (outcome.includes('do not call') || outcome.includes('dnc')) return 'dnc';
  if (outcome.includes('hung up') || outcome.includes('hangup') || outcome.includes('hang up')) return 'hung_up';
  const s = call.status;
  if (s === 'voicemail') return 'voicemail';
  if (s === 'completed') return 'completed';
  if (s === 'in_progress') return 'in_progress';
  if (s === 'initiated') return 'in_progress';
  if (s === 'failed' || s === 'no_answer') return 'disconnected';
  return 'other';
}

export const FILTER_TABS = [
  { id: 'all',           label: 'All' },
  { id: 'in_progress',   label: 'Live' },
  { id: 'completed',     label: 'Completed' },
  { id: 'appointment',   label: 'Appointment Booked' },
  { id: 'not_interested',label: 'Not Interested' },
  { id: 'dnc',           label: 'Do Not Call' },
  { id: 'voicemail',     label: 'Voicemail' },
  { id: 'hung_up',       label: 'Hung Up' },
  { id: 'disconnected',  label: 'Disconnected' },
] as const;

export type FilterId = typeof FILTER_TABS[number]['id'];

export function statusBadgeClass(disposition: string): string {
  switch (disposition) {
    case 'completed':      return 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30';
    case 'appointment':    return 'bg-teal-500/15 text-teal-600 border-teal-500/30';
    case 'not_interested': return 'bg-slate-400/15 text-slate-500 border-slate-400/30';
    case 'dnc':            return 'bg-red-500/15 text-red-600 border-red-500/30';
    case 'voicemail':      return 'bg-purple-500/15 text-purple-600 border-purple-500/30';
    case 'hung_up':        return 'bg-orange-500/15 text-orange-600 border-orange-500/30';
    case 'disconnected':   return 'bg-amber-500/15 text-amber-600 border-amber-500/30';
    case 'in_progress':    return 'bg-blue-500/15 text-blue-600 border-blue-500/30 animate-pulse';
    default:               return 'bg-muted text-muted-foreground border-border';
  }
}

export function dispositionLabel(disposition: string): string {
  switch (disposition) {
    case 'completed':      return 'Completed';
    case 'appointment':    return 'Appointment Booked';
    case 'not_interested': return 'Not Interested';
    case 'dnc':            return 'Do Not Call';
    case 'voicemail':      return 'Voicemail';
    case 'hung_up':        return 'Hung Up';
    case 'disconnected':   return 'Disconnected';
    case 'in_progress':    return 'In Progress';
    default:               return 'Unknown';
  }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

interface TranscriptTurn { speaker: string; text: string; }

function parseTranscript(raw: string): TranscriptTurn[] {
  const lines = raw.split('\n').filter((l) => l.trim() !== '');
  const turns: TranscriptTurn[] = [];
  const speakerRe = /^([A-Za-z][A-Za-z0-9 _-]{0,30}):\s*(.+)$/;
  let current: TranscriptTurn | null = null;
  for (const line of lines) {
    const m = line.match(speakerRe);
    if (m) {
      if (current) turns.push(current);
      current = { speaker: m[1].trim(), text: m[2].trim() };
    } else if (current) {
      current.text += ' ' + line.trim();
    } else {
      current = { speaker: '', text: line.trim() };
    }
  }
  if (current) turns.push(current);
  return turns;
}

function speakerClass(speaker: string): string {
  const s = speaker.toLowerCase();
  if (s === 'ai' || s === 'assistant' || s === 'agent' || s === 'bot' || s === 'zack') {
    return 'bg-primary/10 text-primary border border-primary/20';
  }
  if (s === 'user' || s === 'human' || s === 'customer' || s === 'lead') {
    return 'bg-muted text-muted-foreground border border-border';
  }
  return 'bg-secondary/50 text-secondary-foreground border border-border';
}

interface CallRowProps {
  call: CallRecord;
  showCampaign?: boolean;
  onSync?: () => void;
  'data-testid'?: string;
}

export function CallRow({ call, showCampaign = false, onSync, 'data-testid': testId }: CallRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const hasTranscript = Boolean(call.transcript?.trim());
  const turns = hasTranscript ? parseTranscript(call.transcript!) : [];
  const disposition = getDisposition(call);
  const isLive = disposition === 'in_progress';

  const canSync = Boolean(call.vapiCallId);
  const needsSync = canSync && (!call.recordingUrl || !call.transcript);

  async function handleSync(e: React.MouseEvent) {
    e.stopPropagation();
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch(`${BASE}/api/calls/${call.id}/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Sync failed' }));
        throw new Error(err.error ?? 'Sync failed');
      }
      onSync?.();
    } catch (err: unknown) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div data-testid={testId} className="border-b border-card-border last:border-b-0">
      {/* Summary row */}
      <button
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/30 transition-colors text-left group"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="shrink-0 text-muted-foreground group-hover:text-foreground transition-colors">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium truncate">{call.leadName ?? 'Unknown'}</p>
              {isLive && (
                <span className="flex items-center gap-1 text-xs text-blue-500 font-semibold animate-pulse">
                  <Radio className="w-3 h-3" /> LIVE
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-muted-foreground font-mono">{call.leadPhone ?? '—'}</p>
              {showCampaign && call.campaignName && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <Link
                    href={`${BASE}/campaigns/${call.campaignId}?tab=calls`}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {call.campaignName}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 ml-4">
          {call.duration != null && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(call.duration)}
            </span>
          )}
          {hasTranscript && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 hidden sm:flex">
              <MessageSquare className="w-3 h-3" />
              {turns.length}
            </span>
          )}
          {call.startedAt && (
            <span className="text-xs text-muted-foreground hidden md:block">
              {formatDistanceToNow(new Date(call.startedAt), { addSuffix: true })}
            </span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded border font-medium ${statusBadgeClass(disposition)}`}>
            {dispositionLabel(disposition)}
          </span>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-6 pb-6 space-y-5 bg-muted/10">
          {/* Timestamps + outcome row */}
          <div className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {call.startedAt && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Started</p>
                <p className="text-sm">{new Date(call.startedAt).toLocaleString()}</p>
              </div>
            )}
            {call.duration != null && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Duration</p>
                <p className="text-sm">{formatDuration(call.duration)}</p>
              </div>
            )}
            {call.outcome && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Outcome</p>
                <p className="text-sm">{call.outcome}</p>
              </div>
            )}
          </div>

          {/* Recording */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
              <Mic className="w-3 h-3" /> Recording
            </p>
            {call.recordingUrl ? (
              <div className="flex items-center gap-3">
                <audio controls src={call.recordingUrl} className="flex-1 h-10 rounded" preload="none" />
                <a
                  href={call.recordingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  title="Open recording"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            ) : isLive ? (
              <p className="text-sm text-muted-foreground italic flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                Recording in progress…
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No recording available.</p>
            )}
          </div>

          {/* Transcript */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3" />
              {isLive ? 'Live Transcript' : 'Transcript'}
              {isLive && (
                <span className="ml-1 inline-flex items-center gap-1 text-blue-500 font-normal normal-case animate-pulse">
                  <Radio className="w-3 h-3" /> updating
                </span>
              )}
              {hasTranscript && !isLive && (
                <span className="ml-1 text-muted-foreground/60 normal-case font-normal">({turns.length} turns)</span>
              )}
            </p>
            {hasTranscript ? (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1 rounded border border-border bg-background p-3">
                {turns.map((turn, i) => (
                  <div key={i} className="flex gap-3 items-start text-sm">
                    {turn.speaker ? (
                      <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded mt-0.5 whitespace-nowrap ${speakerClass(turn.speaker)}`}>
                        {turn.speaker}
                      </span>
                    ) : null}
                    <p className="leading-relaxed text-foreground/90">{turn.text}</p>
                  </div>
                ))}
                {isLive && (
                  <div className="flex gap-3 items-start text-sm opacity-50">
                    <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded mt-0.5 bg-primary/10 text-primary border border-primary/20">AI</span>
                    <p className="leading-relaxed">
                      <span className="inline-flex gap-0.5 items-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:300ms]" />
                      </span>
                    </p>
                  </div>
                )}
              </div>
            ) : isLive ? (
              <div className="rounded border border-border bg-background p-4 text-sm text-muted-foreground flex items-center gap-2">
                <span className="inline-flex gap-0.5 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:300ms]" />
                </span>
                Conversation starting…
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No transcript available for this call.</p>
            )}
          </div>

          {/* Sync from VAPI */}
          {canSync && (
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                title="Fetch latest transcript and recording from VAPI"
              >
                <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing from VAPI…' : needsSync ? 'Fetch recording & transcript from VAPI' : 'Re-sync from VAPI'}
              </button>
              {syncError && <span className="text-xs text-destructive">{syncError}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Filter button group for reuse */
interface FilterTabsProps {
  active: FilterId;
  counts: Record<string, number>;
  onChange: (id: FilterId) => void;
}

export function FilterTabs({ active, counts, onChange }: FilterTabsProps) {
  return (
    <div className="flex flex-wrap gap-1.5 p-4 border-b border-card-border bg-muted/30">
      {FILTER_TABS.map((tab) => {
        const count = tab.id === 'all' ? counts['all'] : (counts[tab.id] ?? 0);
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-background border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
            }`}
          >
            {tab.label}
            {count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-muted'}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
