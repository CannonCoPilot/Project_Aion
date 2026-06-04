import { useState, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { useSession, useClaudeStatus } from '../api/account';

function formatDuration(seconds: number): string {
  if (seconds <= 0) return 'Expired';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

function StatusDot({ status }: { status: 'ok' | 'warning' | 'error' }) {
  const colors = {
    ok: 'bg-green-500',
    warning: 'bg-yellow-500 animate-pulse',
    error: 'bg-red-500 animate-pulse',
  };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status]}`} />;
}

function Card({ title, children, icon }: { title: string; children: React.ReactNode; icon?: string }) {
  return (
    <div className="rounded-lg border border-subtle bg-surface-1 p-5">
      <h3 className="text-sm font-semibold text-secondary mb-4 flex items-center gap-2">
        {icon && <span className="text-base">{icon}</span>}
        {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-subtle last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-sm ${muted ? 'text-muted' : 'text-primary'}`}>{value}</span>
    </div>
  );
}

function SessionCountdownBar({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = expiresAt - now;
  const totalDuration = 7 * 86400; // 7 days
  const pct = Math.max(0, Math.min(100, (remaining / totalDuration) * 100));

  const barColor =
    remaining < 3600 ? 'bg-red-500' : remaining < 21600 ? 'bg-yellow-500' : 'bg-green-500';
  const textColor =
    remaining < 3600 ? 'text-red-400' : remaining < 21600 ? 'text-yellow-400' : 'text-green-400';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">Session time remaining</span>
        <span className={`text-sm font-mono font-medium ${textColor}`}>
          {formatDuration(remaining)}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-surface-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted/50">
        <span>Expires {formatDate(expiresAt)}</span>
        <span>{remaining <= 0 ? 'Expired' : `${Math.round(pct)}%`}</span>
      </div>
    </div>
  );
}

export default function AccountPage() {
  const { data: session, isLoading: sessionLoading } = useSession();
  const { data: claude, isLoading: claudeLoading } = useClaudeStatus();

  if (sessionLoading) {
    return <div className="text-faint py-8 text-center">Loading account info...</div>;
  }

  const sessionStatus =
    !session?.authenticated ? 'error'
    : session.expiresAt && session.expiresAt - Math.floor(Date.now() / 1000) < 3600 ? 'warning'
    : 'ok';

  const claudeStatus =
    claudeLoading ? null
    : claude?.status === 'authenticated' ? 'ok'
    : 'error';

  return (
    <div className="space-y-6">
      <Header title="Account" />

      {/* Session countdown — prominent at top */}
      {session?.expiresAt && (
        <div className="rounded-lg border border-subtle bg-surface-1 p-5">
          <SessionCountdownBar expiresAt={session.expiresAt} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Authentik SSO */}
        <Card title="Dashboard Authentication" icon="\u26BF">
          <div className="space-y-0">
            <Row
              label="Status"
              value={
                <span className="flex items-center gap-2">
                  <StatusDot status={sessionStatus} />
                  {session?.authenticated ? 'Authenticated' : 'Not authenticated'}
                </span>
              }
            />
            <Row label="Username" value={session?.username || '\u2014'} muted={!session?.username} />
            <Row label="Email" value={session?.email || '\u2014'} muted={!session?.email} />
            <Row label="Groups" value={session?.groups?.join(', ') || 'None'} muted={!session?.groups?.length} />
            <Row label="Provider" value="Authentik SSO" />
            {session?.issuedAt && (
              <Row label="Session started" value={formatDate(session.issuedAt)} />
            )}
            {session?.expiresAt && (
              <Row label="Session expires" value={formatDate(session.expiresAt)} />
            )}
          </div>
          <div className="mt-4 flex gap-2">
            {session?.authenticated ? (
              <a
                href={session.logoutUrl}
                className="rounded bg-red-500/10 border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/20 transition-colors"
              >
                Log Out
              </a>
            ) : (
              <a
                href="/outpost.goauthentik.io/start"
                className="rounded bg-accent/10 border border-accent/30 px-4 py-2 text-sm text-accent-text hover:bg-accent/20 transition-colors"
              >
                Log In
              </a>
            )}
          </div>
        </Card>

        {/* Claude Code CLI */}
        <Card title="Claude Code CLI" icon="\u2726">
          {claudeLoading ? (
            <div className="text-faint text-sm py-4 text-center">Checking Claude auth...</div>
          ) : (
            <>
              <div className="space-y-0">
                <Row
                  label="Status"
                  value={
                    <span className="flex items-center gap-2">
                      <StatusDot status={claudeStatus || 'error'} />
                      {claude?.status === 'authenticated' ? 'Authenticated'
                        : claude?.status === 'not_authenticated' ? 'Not logged in'
                        : claude?.status === 'unknown' ? 'Unknown'
                        : 'CLI not found'}
                    </span>
                  }
                />
                <Row
                  label="Version"
                  value={claude?.version || '\u2014'}
                  muted={!claude?.version}
                />
                {claude?.model && (
                  <Row label="Model" value={claude.model} />
                )}
                {claude?.error && claude.status !== 'authenticated' && (
                  <Row
                    label="Error"
                    value={<span className="text-red-400">{claude.error}</span>}
                  />
                )}
                <Row label="Auth method" value="Subscription (OAuth)" />
                <Row label="Credential store" value="macOS Keychain" />
                {claude?.checkedAt && (
                  <Row
                    label="Last checked"
                    value={
                      <span className={claude.staleMinutes && claude.staleMinutes > 30 ? 'text-yellow-400' : ''}>
                        {formatDate(claude.checkedAt)}
                        {claude.staleMinutes != null && ` (${claude.staleMinutes}m ago)`}
                      </span>
                    }
                  />
                )}
              </div>
              {claude?.status !== 'authenticated' && (
                <div className="mt-4 rounded bg-yellow-500/10 border border-yellow-500/30 px-4 py-3 text-sm text-yellow-400">
                  <p className="font-medium">Headless jobs will fail until re-authenticated.</p>
                  <p className="mt-1 text-yellow-400/70">
                    Open a terminal and run: <code className="font-mono bg-surface-2 px-1.5 py-0.5 rounded text-yellow-300">claude</code> then <code className="font-mono bg-surface-2 px-1.5 py-0.5 rounded text-yellow-300">/login</code>
                  </p>
                </div>
              )}
              <p className="mt-3 text-[10px] text-muted/40">
                Status checked by host watchdog every 15 min. Dashboard cannot access host Keychain directly.
              </p>
            </>
          )}
        </Card>
      </div>

      {/* System info */}
      <Card title="Headless Execution" icon="\u2699">
        <div className="space-y-0">
          <Row label="Scheduler" value="launchd (user agent)" />
          <Row label="Dispatcher interval" value="Every 5 minutes" />
          <Row label="Executor interval" value="Every 15 minutes" />
          <Row label="Event watcher" value="Every 2 minutes" />
          <Row
            label="Auth dependency"
            value="Claude CLI reads from macOS Keychain at execution time"
          />
        </div>
        <p className="mt-3 text-[11px] text-muted/60 leading-relaxed">
          Headless jobs use the Claude Code CLI subscription credentials stored in the macOS Keychain.
          If the CLI shows "Not logged in" above, headless task execution will fail until re-authenticated.
          The scheduler runs as a launchd user agent to ensure Keychain access is available.
        </p>
      </Card>
    </div>
  );
}
