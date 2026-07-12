import { useEffect, useMemo, useState } from 'react'
import {
  Users, ShieldAlert, LogIn, XCircle, MonitorSmartphone, Shield, Search, Loader2,
  RefreshCw, Ban, CheckCircle2, Trash2, UserCog, Globe, Clock, StickyNote, X,
} from 'lucide-react'
import {
  api, type AdminOverview, type AdminUser, type AdminUserDetails, type Role,
} from '../../api'
import { Button } from '../../components/ui'
import { useContextMenu } from '../../components/ui'
import { useAuth } from '../../AuthContext'

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return '—'
  const s = Math.floor((Date.now() - d) / 1000)
  if (s < 60) return 'agora'
  if (s < 3600) return `${Math.floor(s / 60)}min`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function StatCard({ icon: Icon, label, value, tone = 'default' }: {
  icon: typeof Users; label: string; value: number | string
  tone?: 'default' | 'danger' | 'success' | 'primary'
}) {
  const tones = {
    default: 'text-slate-300', danger: 'text-error-400',
    success: 'text-success-400', primary: 'text-primary-400',
  }
  return (
    <div className="flex items-center gap-md rounded-xl border border-slate-800 bg-slate-925 px-lg py-md">
      <span className={`flex h-10 w-10 items-center justify-center rounded-lg bg-slate-850 ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-2xl font-bold text-slate-50">{value}</p>
        <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      </div>
    </div>
  )
}

function BarList({ data, max }: { data: { name: string; count: number }[]; max?: number }) {
  const top = max ?? Math.max(1, ...data.map((d) => d.count))
  return (
    <div className="space-y-xs">
      {data.length === 0 && <p className="text-xs text-slate-500">Sem dados ainda.</p>}
      {data.map((d) => (
        <div key={d.name} className="flex items-center gap-sm">
          <span className="w-24 shrink-0 truncate text-xs text-slate-400">{d.name}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-850">
            <div className="h-full rounded-full bg-primary-500" style={{ width: `${(d.count / top) * 100}%` }} />
          </div>
          <span className="w-8 shrink-0 text-right text-xs text-slate-300">{d.count}</span>
        </div>
      ))}
    </div>
  )
}

function RoleBadge({ role }: { role: Role }) {
  const map = {
    admin: 'border-primary-500/40 bg-primary-500/10 text-primary-300',
    support: 'border-warning-500/40 bg-warning-500/10 text-warning-300',
    user: 'border-slate-700 bg-slate-850 text-slate-400',
  }
  return <span className={`rounded-full border px-sm py-[1px] text-[10px] font-semibold ${map[role]}`}>{role}</span>
}

// ---- per-user drawer -------------------------------------------------------
function UserDrawer({ uid, onClose, onChanged }: {
  uid: string; onClose: () => void; onChanged: () => void
}) {
  const { toast } = useContextMenu()
  const { profile: me } = useAuth()
  const [data, setData] = useState<AdminUserDetails | null>(null)
  const [tab, setTab] = useState<'summary' | 'logins' | 'devices' | 'notes'>('summary')
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setData(await api.adminUserDetails(uid)) }
    catch (e) { toast(e instanceof Error ? e.message : 'Falha ao carregar', 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [uid])

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); toast(ok, 'success'); await load(); onChanged() }
    catch (e) { toast(e instanceof Error ? e.message : 'Falha', 'error') }
    finally { setBusy(false) }
  }

  const u = data?.user
  const isSelf = me?.uid === uid

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div className="flex h-full w-full max-w-[560px] flex-col border-l border-slate-800 bg-slate-950 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center gap-sm border-b border-slate-800 px-lg py-md">
          {loading || !u ? (
            <span className="flex items-center gap-sm text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</span>
          ) : (
            <>
              {u.photoURL
                ? <img src={u.photoURL} alt="" className="h-10 w-10 rounded-full object-cover" />
                : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-500 text-sm font-bold text-white">{(u.displayName || u.email || '?')[0]?.toUpperCase()}</span>}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-xs truncate text-sm font-semibold text-slate-100">{u.displayName || '—'} <RoleBadge role={u.role} /></p>
                <p className="truncate text-xs text-slate-500">{u.email}</p>
              </div>
            </>
          )}
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100/10 hover:text-slate-100"><X className="h-4 w-4" /></button>
        </div>

        {u && (
          <>
            {/* actions */}
            <div className="flex flex-wrap gap-xs border-b border-slate-800 px-lg py-sm">
              {u.role !== 'admin' && (
                <Button variant="secondary" size="sm" disabled={busy}
                  onClick={() => act(() => api.adminSetRole(uid, u.role === 'support' ? 'user' : 'support'), 'Cargo atualizado')}>
                  <UserCog className="h-3 w-3" /> {u.role === 'support' ? 'Tornar usuário' : 'Tornar suporte'}
                </Button>
              )}
              {u.banned
                ? <Button variant="secondary" size="sm" disabled={busy} onClick={() => act(() => api.adminUnban(uid), 'Desbanido')}><CheckCircle2 className="h-3 w-3" /> Desbanir</Button>
                : <Button variant="danger" size="sm" disabled={busy || isSelf} onClick={() => act(() => api.adminBan(uid, 'Violação', 'permanent'), 'Usuário banido')}><Ban className="h-3 w-3" /> Banir</Button>}
              {u.disabled
                ? <Button variant="secondary" size="sm" disabled={busy} onClick={() => act(() => api.adminReactivate(uid), 'Reativado')}><CheckCircle2 className="h-3 w-3" /> Reativar</Button>
                : <Button variant="secondary" size="sm" disabled={busy || isSelf} onClick={() => act(() => api.adminSuspend(uid), 'Suspenso')}><XCircle className="h-3 w-3" /> Suspender</Button>}
              <Button variant="danger" size="sm" disabled={busy || isSelf}
                onClick={() => { if (window.confirm('Excluir permanentemente este usuário?')) act(async () => { await api.adminDelete(uid); onClose() }, 'Usuário excluído') }}>
                <Trash2 className="h-3 w-3" /> Excluir
              </Button>
            </div>

            {/* tabs */}
            <div className="flex shrink-0 gap-xs border-b border-slate-800 px-lg">
              {(['summary', 'logins', 'devices', 'notes'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`relative px-sm py-sm text-xs font-semibold capitalize ${tab === t ? 'text-slate-50' : 'text-slate-500 hover:text-slate-300'}`}>
                  {t === 'summary' ? 'Resumo' : t === 'logins' ? 'Logins' : t === 'devices' ? 'Dispositivos' : 'Notas'}
                  {tab === t && <span className="absolute inset-x-1 -bottom-px h-[2px] rounded bg-primary-500" />}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-lg py-md">
              {tab === 'summary' && (
                <div className="space-y-sm text-sm">
                  <Row label="UID" value={<span className="font-mono text-xs">{u.uid}</span>} />
                  <Row label="Último IP" value={u.lastIp || '—'} />
                  <Row label="Último SO" value={u.lastOs || '—'} />
                  <Row label="Navegador" value={u.lastBrowser || '—'} />
                  <Row label="Total de logins" value={String(u.loginCount)} />
                  <Row label="Criado" value={timeAgo(u.createdAt)} />
                  <Row label="Último login" value={timeAgo(u.lastLoginAt)} />
                  <Row label="Status" value={u.banned ? 'Banido' : u.disabled ? 'Suspenso' : 'Ativo'} />
                </div>
              )}

              {tab === 'logins' && (
                <div className="space-y-xs">
                  {data!.loginEvents.length === 0 && <p className="text-xs text-slate-500">Nenhum login registrado.</p>}
                  {data!.loginEvents.map((e) => (
                    <div key={e.id} className={`rounded-lg border p-sm text-xs ${e.success ? 'border-slate-800 bg-slate-925' : 'border-error-500/30 bg-error-500/5'}`}>
                      <div className="flex items-center gap-xs">
                        {e.success ? <CheckCircle2 className="h-3 w-3 text-success-400" /> : <XCircle className="h-3 w-3 text-error-400" />}
                        <span className="font-mono text-slate-300">{e.ip}</span>
                        <span className="text-slate-500">· {e.os} · {e.browser} · {e.deviceType}</span>
                        {e.suspicious && <span className="ml-auto rounded bg-warning-500/20 px-1 text-[9px] text-warning-300">suspeito</span>}
                      </div>
                      <div className="mt-[2px] flex items-center gap-md text-[11px] text-slate-500">
                        <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> {e.location || e.country || 'local'}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {timeAgo(e.loginAt)}</span>
                        {!e.success && e.failureReason && <span className="text-error-300">{e.failureReason}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'devices' && (
                <div className="space-y-xs">
                  {data!.devices.length === 0 && <p className="text-xs text-slate-500">Nenhum dispositivo.</p>}
                  {data!.devices.map((d) => (
                    <div key={d.id} className="rounded-lg border border-slate-800 bg-slate-925 p-sm text-xs">
                      <p className="flex items-center gap-xs font-semibold text-slate-200">
                        <MonitorSmartphone className="h-3.5 w-3.5 text-primary-400" /> {d.name || d.deviceType}
                        {d.current && <span className="rounded bg-primary-500/20 px-1 text-[9px] text-primary-300">atual</span>}
                        {d.suspicious && <span className="ml-auto rounded bg-warning-500/20 px-1 text-[9px] text-warning-300">suspeito</span>}
                      </p>
                      <p className="mt-[2px] text-slate-500">{d.os} · {d.browser} · <span className="font-mono">{d.ip}</span></p>
                      <p className="text-[11px] text-slate-500">{d.location || d.country || 'local'} · {d.loginCount} login(s) · visto {timeAgo(d.lastSeenAt)}</p>
                      {d.recentIps?.length > 1 && <p className="mt-[2px] font-mono text-[10px] text-slate-600">IPs: {d.recentIps.slice(0, 5).join(', ')}</p>}
                    </div>
                  ))}
                </div>
              )}

              {tab === 'notes' && (
                <div className="space-y-sm">
                  <div className="flex gap-xs">
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota interna…"
                      className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-sm py-xs text-xs text-slate-100 placeholder-slate-500" />
                    <Button size="sm" disabled={!note.trim() || busy}
                      onClick={() => act(async () => { await api.adminAddNote(uid, note.trim()); setNote('') }, 'Nota adicionada')}>
                      <StickyNote className="h-3 w-3" /> Add
                    </Button>
                  </div>
                  {data!.notes.length === 0 && <p className="text-xs text-slate-500">Nenhuma nota.</p>}
                  {data!.notes.map((n) => (
                    <div key={n.id} className="rounded-lg border border-slate-800 bg-slate-925 p-sm text-xs text-slate-300">
                      <p>{n.note}</p>
                      <p className="mt-[2px] text-[10px] text-slate-500">{n.createdByEmail || 'admin'} · {timeAgo(n.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-md border-b border-slate-850 py-xs">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-right text-sm text-slate-200">{value}</span>
    </div>
  )
}

// ---- main page -------------------------------------------------------------
export default function AdminPage() {
  const { toast } = useContextMenu()
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [ov, us] = await Promise.all([api.adminOverview(), api.adminListUsers()])
      setOverview(ov); setUsers(us.users)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao carregar o painel', 'error')
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return users
    return users.filter((u) =>
      (u.email || '').toLowerCase().includes(s) ||
      (u.displayName || '').toLowerCase().includes(s) ||
      (u.lastIp || '').includes(s))
  }, [users, q])

  if (loading && !overview) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary-400" /></div>
  }

  const s = overview?.stats

  return (
    <div className="h-full overflow-y-auto px-lg py-md">
      <div className="mb-md flex items-center gap-sm">
        <Shield className="h-5 w-5 text-primary-400" />
        <h2 className="text-lg font-bold text-slate-50">Painel de administração</h2>
        <button onClick={load} className="ml-auto rounded-full p-2 text-slate-400 hover:bg-slate-100/10 hover:text-slate-100" title="Atualizar">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-2 gap-sm sm:grid-cols-3 lg:grid-cols-6">
        <StatCard icon={Users} label="Usuários" value={s?.totalUsers ?? 0} />
        <StatCard icon={Shield} label="Admins" value={s?.admins ?? 0} tone="primary" />
        <StatCard icon={ShieldAlert} label="Banidos" value={s?.bannedUsers ?? 0} tone="danger" />
        <StatCard icon={LogIn} label="Logins 24h" value={s?.logins24h ?? 0} tone="success" />
        <StatCard icon={XCircle} label="Falhas 24h" value={s?.failedLogins24h ?? 0} tone="danger" />
        <StatCard icon={MonitorSmartphone} label="Dispositivos" value={s?.activeDevices ?? 0} />
      </div>

      {/* charts */}
      <div className="mt-md grid grid-cols-1 gap-md lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-925 p-lg">
          <p className="mb-sm text-xs font-semibold uppercase tracking-wide text-slate-500">Sistemas operacionais</p>
          <BarList data={overview?.usersByOs ?? []} />
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-925 p-lg">
          <p className="mb-sm text-xs font-semibold uppercase tracking-wide text-slate-500">Logins por dia</p>
          <BarList data={(overview?.loginsByDay ?? []).map((d) => ({ name: d.date.slice(5), count: d.count }))} />
        </div>
      </div>

      {/* recent logins */}
      <div className="mt-md rounded-xl border border-slate-800 bg-slate-925 p-lg">
        <p className="mb-sm text-xs font-semibold uppercase tracking-wide text-slate-500">Logins recentes (IP · SO · local)</p>
        <div className="max-h-64 space-y-xs overflow-y-auto">
          {(overview?.recentLogins ?? []).length === 0 && <p className="text-xs text-slate-500">Nenhum login ainda.</p>}
          {(overview?.recentLogins ?? []).map((e) => (
            <div key={e.id} className="flex items-center gap-sm rounded-lg border border-slate-800 bg-slate-950 px-sm py-xs text-xs">
              {e.success ? <CheckCircle2 className="h-3 w-3 shrink-0 text-success-400" /> : <XCircle className="h-3 w-3 shrink-0 text-error-400" />}
              <span className="font-mono text-slate-300">{e.ip}</span>
              <span className="truncate text-slate-500">{e.os} · {e.browser}</span>
              <span className="ml-auto shrink-0 text-slate-500">{e.location || e.country || 'local'}</span>
              <span className="shrink-0 text-slate-600">{timeAgo(e.loginAt)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* users */}
      <div className="mt-md rounded-xl border border-slate-800 bg-slate-925 p-lg">
        <div className="mb-sm flex items-center gap-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Usuários ({filtered.length})</p>
          <div className="ml-auto flex items-center gap-xs rounded-lg border border-slate-700 bg-slate-900 px-sm">
            <Search className="h-3.5 w-3.5 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar e-mail, nome ou IP…"
              className="w-52 bg-transparent py-xs text-xs text-slate-100 outline-none placeholder:text-slate-500" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr className="border-b border-slate-800">
                <th className="py-xs pr-md font-medium">Usuário</th>
                <th className="py-xs pr-md font-medium">Cargo</th>
                <th className="py-xs pr-md font-medium">Último IP</th>
                <th className="py-xs pr-md font-medium">SO</th>
                <th className="py-xs pr-md font-medium">Logins</th>
                <th className="py-xs pr-md font-medium">Visto</th>
                <th className="py-xs font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.uid} onClick={() => setSelected(u.uid)}
                  className="cursor-pointer border-b border-slate-850 hover:bg-slate-850/50">
                  <td className="py-sm pr-md">
                    <div className="flex items-center gap-sm">
                      {u.photoURL
                        ? <img src={u.photoURL} alt="" className="h-6 w-6 rounded-full object-cover" />
                        : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-500 text-[10px] font-bold text-white">{(u.displayName || u.email || '?')[0]?.toUpperCase()}</span>}
                      <div className="min-w-0">
                        <p className="truncate text-slate-200">{u.displayName || '—'}</p>
                        <p className="truncate text-[11px] text-slate-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-sm pr-md"><RoleBadge role={u.role} /></td>
                  <td className="py-sm pr-md font-mono text-slate-400">{u.lastIp || '—'}</td>
                  <td className="py-sm pr-md text-slate-400">{u.lastOs || '—'}</td>
                  <td className="py-sm pr-md text-slate-400">{u.loginCount}</td>
                  <td className="py-sm pr-md text-slate-500">{timeAgo(u.lastLoginAt)}</td>
                  <td className="py-sm">
                    {u.banned ? <span className="text-error-400">Banido</span>
                      : u.disabled ? <span className="text-warning-400">Suspenso</span>
                      : <span className="text-success-400">Ativo</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <UserDrawer uid={selected} onClose={() => setSelected(null)} onChanged={load} />}
    </div>
  )
}
