import { useState } from 'react';
import {
  ChevronDown, ChevronRight, Clock, MessageSquare, Mic, ExternalLink,
  RefreshCw, Radio, PhoneOff, PhoneMissed, PhoneForwarded,
  Voicemail, Bot, Wifi, Phone, CheckCircle2,
} from 'lucide-react';
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

/** Canonical disposition derived from status + outcome text. */
export function getDisposition(call: CallRecord): string {
  const s = call.status;

  // Live calls first
  if (s === 'in_progress' || s === 'initiated') return 'in_progress';

  // Direct status dispositions (set by webhook from VAPI endedReason)
  if (s === 'hung_up')         return 'hung_up';
  if (s === 'transferred')     return 'transferred';
  if (s === 'voicemail')       return 'voicemail';
  if (s === 'answering_machine') return 'answering_machine';
  if (s === 'no_answer')       return 'no_answer';
  if (s === 'disconnected')    return 'disconnected';
  if (s === 'failed')          return 'failed';

  // For "completed" calls, read AI analysis for richer disposition
  const outcome = (call.outcome ?? '').toLowerCase();
  if (outcome.includes('appointment') || outcome.includes('booked')) return 'appointment';
  if (outcome.includes('not interested') || outcome.includes('not_interested')) return 'not_interested';
  if (outcome.includes('do not call') || outcome.includes('dnc')) return 'dnc';
  if (outcome.includes('transferred') || outcome.includes('forwarded')) return 'transferred';
  if (outcome.includes('voicemail')) return 'voicemail';
  if (outcome.includes('hung up') || outcome.includes('hang up') || outcome.includes('customer ended')) return 'hung_up';
  if (outcome.includes('answering machine') || outcome.includes('machine detected')) return 'answering_machine';
  if (outcome.includes('no answer') || outcome.includes('did not answer')) return 'no_answer';

  if (s === 'completed') return 'completed';
  return 'other';
}

export const FILTER_TABS = [
  { id: 'all',              label: 'All' },
  { id: 'in_progress',      label: 'Live' },
  { id: 'appointment',      label: 'Appointment' },
  { id: 'not_interested',   label: 'Not Interested' },
  { id: 'transferred',      label: 'Transferred' },
  { id: 'completed',        label: 'Completed' },
  { id: 'voicemail',        label: 'Voicemail' },
  { id: 'answering_machine',label: 'Answering Machine' },
  { id: 'hung_up',          label: 'Hung Up' },
  { id: 'no_answer',        label: 'No Answer' },
  { id: 'disconnected',     label: 'Disconnected' },
  { id: 'failed',           label: 'Failed' },
  { id: 'dnc',              label: 'Do Not Call' },
] as const;

export type FilterId = typeof FILTER_TABS[number]['id'];

export function statusBadgeClass(disposition: string): string {
  switch (disposition) {
    case 'in_progress':      return 'bg-blue-500/15 text-blue-600 border-blue-500/30';
    case 'appointment':      return 'bg-teal-500/15 text-teal-600 border-teal-500/30';
    case 'not_interested':   return 'bg-slate-400/15 text-slate-500 border-slate-400/30';
    case 'dnc':              return 'bg-red-600/15 text-red-700 border-red-600/30';
    case 'completed':        return 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30';
    case 'transferred':      return 'bg-violet-500/15 text-violet-600 border-violet-500/30';
    case 'voicemail':        return 'bg-purple-500/15 text-purple-600 border-purple-500/30';
    case 'answering_machine':return 'bg-indigo-500/15 text-indigo-600 border-indigo-500/30';
    case 'hung_up':          return 'bg-orange-500/15 text-orange-600 border-orange-500/30';
    case 'no_answer':        return 'bg-amber-500/15 text-amber-600 border-amber-500/30';
    case 'disconnected':     return 'bg-rose-500/15 text-rose-600 border-rose-500/30';
    case 'failed':           return 'bg-red-500/15 text-red-600 border-red-500/30';
    default:                 return 'bg-muted text-muted-foreground border-border';
  }
}

export function dispositionLabel(disposition: string): string {
  switch (disposition) {
    case 'in_progress':      return 'Live';
    case 'appointment':      return 'Appointment';
    case 'not_interested':   return 'Not Interested';
    case 'dnc':              return 'Do Not Call';
    case 'completed':        return 'Completed';
    case 'transferred':      return 'Transferred';
    case 'voicemail':        return 'Voicemail';
    case 'answering_machine':return 'Answering Machine';
    case 'hung_up':          return 'Hung Up';
    case 'no_answer':        return 'No Answer';
    case 'disconnected':     return 'Disconnected';
    case 'failed':           return 'Failed';
    default:                 return 'Unknown';
  }
}

export function DispositionIcon({ d, className = 'w-3 h-3' }: { d: string; className?: string }) {
  switch (d) {
    case 'in_progress':      return <Radio className={className} />;
    case 'appointment':      return <CheckCircle2 className={className} />;
    case 'transferred':      return <PhoneForwarded className={className} />;
    case 'voicemail':        return <Voicemail className={className} />;
    case 'answering_machine':return <Bot className={className} />;
    case 'hung_up':          return <PhoneOff className={className} />;
    case 'no_answer':        return <PhoneMissed className={className} />;
    case 'disconnected':     return <Wifi className={className} />;
    case 'failed':           return <PhoneOff className={className} />;
    case 'completed':        return <Phone className={className} />;
    default:                 return <Phone className={className} />;
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
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
  return 'bg-muted text-muted-foreground border border-border';
}

export interface CallRowProps {
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

  const timeLabel = call.startedAt
    ? formatDistanceToNow(new Date(call.startedAt), { addSuffix: true })
    : call.createdAt
    ? formatDistanceToNow(new Date(call.createdAt), { addSuffix: true })
    : null;

  return (
    <div data-testid={testId} className="border-b border-card-border last:border-b-0">
      {/* ── Summary row ─────────────────────────────────────────────────── */}
      <button
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors text-left group"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {/* Chevron */}
        <span className="shrink-0 text-muted-foreground/50 group-hover:text-foreground transition-colors">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>

        {/* Lead name + phone */}
        <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(160px,1.5fr)_minmax(130px,1fr)_minmax(100px,1fr)_auto_auto] gap-x-3 items-center">
          {/* Col 1: Name */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-medium text-sm truncate">{call.leadName ?? 'Unknown'}</p>
              {isLive && (
                <span className="flex items-center gap-0.5 text-xs text-blue-500 font-semibold animate-pulse shrink-0">
                  <Radio className="w-2.5 h-2.5" /> LIVE
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono truncate">{call.leadPhone ?? '—'}</p>
          </div>

          {/* Col 2: Campaign (desktop only, when showCampaign) */}
          {showCampaign ? (
            <div className="hidden sm:block min-w-0">
              {call.campaignName && call.campaignId ? (
                <Link
                  href={`${BASE}/campaigns/${call.campaignId}?tab=calls`}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors truncate block"
                  onClick={(e) => e.stopPropagation()}
                >
                  {call.campaignName}
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground/40">—</span>
              )}
            </div>
          ) : (
            <div className="hidden sm:block" />
          )}

          {/* Col 3: Duration */}
          <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
            {call.duration != null ? (
              <>
                <Clock className="w-3 h-3 shrink-0" />
                <span>{formatDuration(call.duration)}</span>
              </>
            ) : isLive ? (
              <span className="text-blue-400 animate-pulse text-xs">Ongoing</span>
            ) : (
              <span className="text-muted-foreground/30">—</span>
            )}
          </div>

          {/* Col 4: Disposition badge */}
          <div className="hidden sm:flex items-center">
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border font-medium ${statusBadgeClass(disposition)}`}>
              <DispositionIcon d={disposition} className="w-3 h-3" />
              {dispositionLabel(disposition)}
            </span>
          </div>

          {/* Col 5: Time (mobile: badge inline) */}
          <div className="flex flex-col items-end gap-1">
            {/* Mobile badge only */}
            <span className={`sm:hidden inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${statusBadgeClass(disposition)}`}>
              <DispositionIcon d={disposition} className="w-3 h-3" />
              {dispositionLabel(disposition)}
            </span>
            {timeLabel && (
              <span className="text-xs text-muted-foreground/60 whitespace-nowrap">{timeLabel}</span>
            )}
          </div>
        </div>
      </button>

      {/* ── Expanded detail ──────────────────────────────────────────────── */}
      {expanded && (
        <div className="px-5 pb-5 pt-2 space-y-4 bg-muted/10 border-t border-card-border/50">
          {/* Meta row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Disposition</p>
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${statusBadgeClass(disposition)}`}>
                <DispositionIcon d={disposition} className="w-3 h-3" />
                {dispositionLabel(disposition)}
              </span>
            </div>
            {call.outcome && !/^Call ended:/.test(call.outcome) && (
              <div className="col-span-2 sm:col-span-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">AI Summary</p>
                <p className="text-sm leading-relaxed">{call.outcome}</p>
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
                <audio controls src={call.recordingUrl} className="flex-1 h-9 rounded" preload="none" />
                <a href={call.recordingUrl} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 text-muted-foreground hover:text-foreground" title="Open recording">
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
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
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
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1 rounded border border-border bg-background p-3">
                {turns.map((turn, i) => (
                  <div key={i} className="flex gap-2.5 items-start text-sm">
                    {turn.speaker ? (
                      <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded mt-0.5 whitespace-nowrap ${speakerClass(turn.speaker)}`}>
                        {turn.speaker}
                      </span>
                    ) : null}
                    <p className="leading-relaxed text-foreground/90">{turn.text}</p>
                  </div>
                ))}
                {isLive && (
                  <div className="flex gap-2.5 items-start text-sm opacity-40">
                    <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded mt-0.5 bg-primary/10 text-primary border border-primary/20">AI</span>
                    <span className="inline-flex gap-0.5 items-center mt-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:300ms]" />
                    </span>
                  </div>
                )}
              </div>
            ) : isLive ? (
              <div className="rounded border border-border bg-background p-3 text-sm text-muted-foreground flex items-center gap-2">
                <span className="inline-flex gap-0.5 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:300ms]" />
                </span>
                Conversation starting…
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No transcript available.</p>
            )}
          </div>

          {/* Sync */}
          {canSync && (
            <div className="flex items-center gap-3 pt-1 border-t border-card-border/40">
              <button onClick={handleSync} disabled={syncing}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing…' : needsSync ? 'Fetch recording & transcript from VAPI' : 'Re-sync from VAPI'}
              </button>
              {syncError && <span className="text-xs text-destructive">{syncError}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Scrollable filter pill row */
export function FilterTabs({ active, counts, onChange }: {
  active: FilterId;
  counts: Record<string, number>;
  onChange: (id: FilterId) => void;
}) {
  return (
    <div className="flex gap-1.5 px-4 py-2.5 border-b border-card-border overflow-x-auto scrollbar-none">
      {FILTER_TABS.map((tab) => {
        const count = tab.id === 'all' ? (counts['all'] ?? 0) : (counts[tab.id] ?? 0);
        if (tab.id !== 'all' && count === 0) return null; // hide empty tabs
        const isActive = active === tab.id;
        return (
          <button key={tab.id} onClick={() => onChange(tab.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-background border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
            }`}
          >
            {tab.label}
            {count > 0 && (
              <span className={`text-[10px] px-1.5 py-0 rounded-full font-semibold ${isActive ? 'bg-white/25' : 'bg-muted'}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
