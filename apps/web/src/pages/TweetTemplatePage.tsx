import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle, BadgeCheck, CheckCircle2, Download, FolderOpen, Link2, Loader2,
  Package, Play, RotateCcw, Save, Search, Trash2, Upload, UserPlus, X,
} from 'lucide-react'
import { api, isLocalBackend, type Clip, type JobStatus, type ProfileVideo } from '../api'
import { Button, ClearableInput, useContextMenu } from '../components/ui'

type CardTheme = 'light' | 'dark'
type CardMode = 'auto' | 'card' | 'reskin'

interface VideoItem {
  key: string
  fileName: string
  previewUrl: string | null
  thumb?: string | null
  videoId: number | null
  pendingId?: number | null   // id do vídeo no servidor enquanto ainda baixa (sobrevive ao reload)
  status?: string | null
  caption: string
  cardMode?: CardMode
  error?: string
}

interface SavedProfile {
  id: string
  name: string
  handle: string
  verified: boolean
  avatarId: string | null
}

// Tudo automático: fundo sempre desfoque do próprio vídeo, card sempre claro.
const BG_MODE = 'blur'
const CARD_MODE: CardTheme = 'light'

const CFG_KEY = 'vc-tweet-config'
const ITEMS_KEY = 'vc-tweet-items'
const JOB_KEY = 'vc-tweet-job'
const AUTOGEN_KEY = 'vc-tweet-autogen'
const RENDERED_KEY = 'vc-tweet-rendered'
const PROFILES_KEY = 'vc-tweet-profiles'

function loadCfg(): Record<string, unknown> {
  try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}') } catch { return {} }
}
function loadProfiles(): SavedProfile[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch { return [] }
}
const newProfileId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

/** "Template": renders videos inside an X/Twitter-style post card — editable
 *  avatar, name, @handle, verified badge and caption; single video or a batch. */
export default function TweetTemplatePage() {
  const { toast } = useContextMenu()
  const cfg0 = loadCfg()

  const [name, setName] = useState((cfg0.name as string) ?? 'Fut360')
  const [handle, setHandle] = useState((cfg0.handle as string) ?? 'fut360')
  const [verified, setVerified] = useState((cfg0.verified as boolean) ?? true)
  const bg = BG_MODE
  const cardTheme = CARD_MODE
  const [avatarId, setAvatarId] = useState<string | null>((cfg0.avatarId as string) ?? null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    cfg0.avatarId ? api.tweetAvatarUrl(cfg0.avatarId as string) : null)
  const [defaultCaption, setDefaultCaption] = useState((cfg0.defaultCaption as string) ?? '')
  const [hook, setHook] = useState((cfg0.hook as string) ?? '')

  const [profiles, setProfiles] = useState<SavedProfile[]>(loadProfiles)
  const [activeProfileId, setActiveProfileId] = useState<string | null>(
    (cfg0.activeProfileId as string) ?? null)

  useEffect(() => {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify(
        { name, handle, verified, avatarId, defaultCaption, hook, activeProfileId }))
    } catch { /* full */ }
  }, [name, handle, verified, avatarId, defaultCaption, hook, activeProfileId])

  useEffect(() => {
    try { localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)) } catch { /* full */ }
  }, [profiles])

  const selectProfile = (p: SavedProfile) => {
    setName(p.name); setHandle(p.handle); setVerified(p.verified); setAvatarId(p.avatarId)
    setAvatarPreview(p.avatarId ? api.tweetAvatarUrl(p.avatarId) : null)
    setActiveProfileId(p.id)
  }

  const activeProfile = profiles.find(p => p.id === activeProfileId) ?? null
  const curProfile = {
    name: name.trim() || 'Usuário',
    handle: handle.trim() || 'usuario',
    verified,
    avatarId: avatarId ?? null,
  }
  const activeUnchanged = !!activeProfile
    && activeProfile.name === curProfile.name
    && activeProfile.handle === curProfile.handle
    && activeProfile.verified === curProfile.verified
    && (activeProfile.avatarId ?? null) === curProfile.avatarId

  const saveProfile = (mode: 'new' | 'update') => {
    if (mode === 'update' && activeProfileId) {
      setProfiles(prev => prev.map(p => p.id === activeProfileId ? { ...p, ...curProfile } : p))
      toast('Perfil atualizado')
    } else {
      const id = newProfileId()
      setProfiles(prev => [...prev, { id, ...curProfile }])
      setActiveProfileId(id)
      toast('Perfil salvo')
    }
  }
  const deleteProfile = (id: string) => {
    setProfiles(prev => prev.filter(p => p.id !== id))
    if (activeProfileId === id) setActiveProfileId(null)
    toast('Perfil removido')
  }

  const [items, setItems] = useState<VideoItem[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(ITEMS_KEY) || '[]') as VideoItem[]
      return raw
        // mantém prontos (videoId) E os que ainda baixavam (pendingId) — o reload
        // não perde mais o download em andamento.
        .filter(i => i.videoId != null || i.pendingId != null)
        .map(i => i.videoId != null
          ? { ...i, previewUrl: api.streamUrl(i.videoId), status: null }
          : { ...i, previewUrl: null, status: 'retomando…' })
    } catch { return [] }
  })
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [autoGen, setAutoGen] = useState<boolean>(() => localStorage.getItem(AUTOGEN_KEY) === '1')
  useEffect(() => {
    try { localStorage.setItem(AUTOGEN_KEY, autoGen ? '1' : '0') } catch { /* full */ }
  }, [autoGen])
  const [saveLoc, setSaveLoc] = useState<string | null>(null)
  useEffect(() => {
    api.tweetSaveLocation().then(r => setSaveLoc(r.folder)).catch(() => setSaveLoc(null))
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(ITEMS_KEY, JSON.stringify(items.map(({ previewUrl, ...rest }) => rest)))
    } catch { /* full */ }
  }, [items])

  const [jobId, setJobId] = useState<number | null>(() => {
    const v = localStorage.getItem(JOB_KEY)
    return v ? Number(v) : null
  })
  const [job, setJob] = useState<JobStatus | null>(null)
  const [clips, setClips] = useState<Clip[]>([])
  const [error, setError] = useState<string | null>(null)
  // idToken used to authenticate media loaded via <video src>/<a href download>
  const [mediaToken, setMediaToken] = useState<string | null>(null)
  const [selectedClips, setSelectedClips] = useState<Set<number>>(new Set())
  useEffect(() => {
    let alive = true
    api.authToken().then(t => { if (alive) setMediaToken(t) })
    return () => { alive = false }
  }, [])
  useEffect(() => { if (jobId == null) setSelectedClips(new Set()) }, [jobId])
  const [renderedKeys, setRenderedKeys] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(RENDERED_KEY) || '[]') } catch { return [] }
  })
  useEffect(() => {
    try { localStorage.setItem(RENDERED_KEY, JSON.stringify(renderedKeys)) } catch { /* full */ }
  }, [renderedKeys])
  const pollRef = useRef<number | null>(null)
  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current) }, [])
  useEffect(() => {
    if (jobId != null) localStorage.setItem(JOB_KEY, String(jobId))
    else localStorage.removeItem(JOB_KEY)
  }, [jobId])

  const uploadAvatar = async (f: File) => {
    setAvatarPreview(URL.createObjectURL(f))
    try {
      const r = await api.tweetUploadAvatar(f)
      setAvatarId(r.avatar_id)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao enviar o avatar', 'error')
    }
  }

  const addVideos = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter(f => f.type.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/i.test(f.name))
    if (!list.length) return
    setImporting(true)
    const newItems: VideoItem[] = list.map(f => ({
      key: `${Date.now()}_${f.name}_${Math.random().toString(36).slice(2, 6)}`,
      fileName: f.name.replace(/\.[^.]+$/, ''),
      previewUrl: URL.createObjectURL(f),
      videoId: null,
      caption: defaultCaption,
    }))
    setItems(prev => [...prev, ...newItems])
    setPreviewKey(k => k ?? newItems[0].key)
    for (let i = 0; i < list.length; i++) {
      const it = newItems[i]
      try {
        const p = await api.prepareVideo({ file: list[i] })
        setItems(prev => prev.map(x => x.key === it.key ? { ...x, videoId: p.video_id } : x))
      } catch (e) {
        setItems(prev => prev.map(x => x.key === it.key
          ? { ...x, error: e instanceof Error ? e.message : 'falha no envio' } : x))
      }
    }
    setImporting(false)
  }, [defaultCaption])

  const [urlInput, setUrlInput] = useState('')
  const [probing, setProbing] = useState(false)
  const [picker, setPicker] = useState<{ profile: string; videos: ProfileVideo[] } | null>(null)
  const [pickerSel, setPickerSel] = useState<Set<string>>(new Set())

  // Faz o polling de um vídeo (do servidor) até ficar pronto/erro. Reutilizado
  // tanto no download inicial quanto ao RETOMAR um download após recarregar.
  const pollVideoReady = useCallback(async (key: string, videoId: number) => {
    for (let i = 0; i < 400; i++) {
      const info = await api.getVideoInfo(videoId).catch(() => null)
      if (info?.error) {
        setItems(prev => prev.map(x => x.key === key
          ? { ...x, error: info.error!.split('\n')[0], status: null, pendingId: null } : x))
        return
      }
      if (info?.ready && info.duration > 0) {
        setItems(prev => prev.map(x => x.key === key
          ? { ...x, videoId, pendingId: null, previewUrl: api.streamUrl(videoId, mediaToken ?? undefined), status: null } : x))
        return
      }
      await new Promise(r => setTimeout(r, 3000 + Math.random() * 1500))
    }
    setItems(prev => prev.map(x => x.key === key
      ? { ...x, error: 'o download demorou demais', status: null, pendingId: null } : x))
  }, [mediaToken])

  const downloadUrlItem = useCallback(async (key: string, v: ProfileVideo) => {
    try {
      const p = await api.prepareVideo({ source_url: v.url, direct_url: v.video_url || undefined, title: v.title || undefined })
      // grava o id JÁ (sobrevive ao reload); só vira "pronto" (videoId) quando baixar
      setItems(prev => prev.map(x => x.key === key ? { ...x, pendingId: p.video_id, status: 'baixando…' } : x))
      await pollVideoReady(key, p.video_id)
    } catch (e) {
      setItems(prev => prev.map(x => x.key === key
        ? { ...x, error: e instanceof Error ? e.message : 'falha no download', status: null, pendingId: null } : x))
    }
  }, [pollVideoReady])

  // Ao montar (reload): retoma qualquer download que ficou pela metade.
  const resumedRef = useRef(false)
  useEffect(() => {
    if (resumedRef.current) return
    resumedRef.current = true
    items.forEach(it => {
      if (it.pendingId != null && it.videoId == null && !it.error) {
        void pollVideoReady(it.key, it.pendingId)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addFromUrls = useCallback((vids: ProfileVideo[]) => {
    const newItems: VideoItem[] = vids.map(v => ({
      key: `${Date.now()}_${v.url}_${Math.random().toString(36).slice(2, 6)}`,
      fileName: (v.title || v.url).slice(0, 90),
      previewUrl: null,
      thumb: v.thumbnail || null,
      videoId: null,
      status: 'baixando…',
      caption: defaultCaption,
    }))
    setItems(prev => [...prev, ...newItems])
    setPreviewKey(k => k ?? newItems[0]?.key ?? null)
    newItems.forEach((it, i) => { void downloadUrlItem(it.key, vids[i]) })
  }, [defaultCaption, downloadUrlItem])

  const probeUrl = async () => {
    const url = urlInput.trim()
    if (!url) return
    setProbing(true); setPicker(null)
    try {
      const r = await api.listProfileVideos(url)
      if (!r.videos.length) {
        toast('Nenhum vídeo encontrado nesse link', 'error')
      } else if (r.videos.length === 1) {
        addFromUrls(r.videos); setUrlInput(''); toast('Vídeo adicionado — baixando…')
      } else {
        setPicker({ profile: r.profile, videos: r.videos }); setPickerSel(new Set())
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao ler o link', 'error')
    } finally { setProbing(false) }
  }

  const confirmPicker = (direct: boolean) => {
    if (!picker) return
    const chosen = picker.videos.filter(v => pickerSel.has(v.url))
    if (!chosen.length) return
    addFromUrls(chosen); setPicker(null); setUrlInput('')
    if (direct) {
      setAutoGen(true)
      toast(`${chosen.length} vídeo(s) baixando — a geração começa sozinha quando terminarem`)
    } else {
      toast(`${chosen.length} vídeo(s) adicionados — baixando…`)
    }
  }

  const removeItem = (key: string) => {
    setItems(prev => prev.filter(x => x.key !== key))
    setPreviewKey(k => (k === key ? null : k))
  }
  const clearAll = () => {
    if (!items.length) return
    if (items.length > 1 && !window.confirm(`Remover todos os ${items.length} vídeos da fila?`)) return
    setItems([]); setPreviewKey(null); setAutoGen(false); toast('Fila esvaziada')
  }

  const readyItems = items.filter(i => i.videoId != null && !i.error)
  const preview = items.find(i => i.key === previewKey) ?? items[0] ?? null

  const pollJob = useCallback(async (id: number) => {
    try {
      const [js, cl] = await Promise.all([api.getJob(id), api.listClips(id).catch(() => [] as Clip[])])
      setJob(js); setClips(cl)
      if (js.status === 'done' || js.status === 'failed') {
        if (js.status === 'failed') setError(js.error_message || 'Falha ao gerar')
        return
      }
    } catch { /* keep polling */ }
    pollRef.current = window.setTimeout(() => pollJob(id), 1500)
  }, [])

  useEffect(() => {
    if (jobId != null) pollJob(jobId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (job?.status === 'done' && renderedKeys.length) {
      setItems(prev => prev.filter(i => !renderedKeys.includes(i.key)))
      setRenderedKeys([])
    }
  }, [job?.status, renderedKeys])

  const generate = async () => {
    if (!readyItems.length) { toast('Adicione pelo menos um vídeo', 'error'); return }
    setError(null); setJob(null); setClips([])
    try {
      const r = await api.tweetRender({
        items: readyItems.map(i => ({ video_id: i.videoId!, caption: i.caption, card_mode: i.cardMode || 'auto' })),
        profile: { name: name.trim() || 'Usuário', handle: handle.trim() || 'usuario', verified, avatar_id: avatarId },
        style: { bg, card: cardTheme, hook: hook.trim() },
      })
      setRenderedKeys(readyItems.map(i => i.key))
      setJobId(r.job_id)
      pollJob(r.job_id)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao iniciar', 'error')
    }
  }

  useEffect(() => {
    if (!autoGen) return
    if (jobId != null) { setAutoGen(false); return }
    if (!items.length || importing) return
    if (items.some(i => i.videoId == null && !i.error)) return
    const ready = items.filter(i => i.videoId != null && !i.error)
    setAutoGen(false)
    if (!ready.length) { toast('Nenhum vídeo baixou com sucesso — nada para gerar', 'error'); return }
    const failed = items.length - ready.length
    if (failed > 0) toast(`${failed} vídeo(s) falharam no download — gerando com ${ready.length}`)
    void generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGen, items, importing, jobId])

  // ---- preview REAL: o backend renderiza um frame idêntico ao vídeo final ----
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewErr, setPreviewErr] = useState<string | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  useEffect(() => {
    if (!preview || preview.videoId == null) {
      if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = null }
      setPreviewImg(null); setPreviewErr(null); setPreviewLoading(false)
      return
    }
    let cancelled = false
    setPreviewLoading(true); setPreviewErr(null)
    const t = window.setTimeout(async () => {
      try {
        const url = await api.tweetPreview({
          video_id: preview.videoId!, caption: preview.caption,
          card_mode: preview.cardMode || 'auto',
          profile: { name: name.trim() || 'Usuário', handle: handle.trim() || 'usuario', verified, avatar_id: avatarId },
          style: { bg, card: cardTheme, hook: hook.trim() },
        })
        if (cancelled) { URL.revokeObjectURL(url); return }
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = url
        setPreviewImg(url)
      } catch (e) {
        if (!cancelled) setPreviewErr(e instanceof Error ? e.message : 'falha no preview')
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }, 450)
    return () => { cancelled = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview?.key, preview?.videoId, preview?.caption, preview?.cardMode,
      name, handle, verified, avatarId, bg, cardTheme, hook])
  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current) }, [])

  // ================================ RESULTS ======================================
  if (jobId) {
    const rendering = !!job && job.status !== 'done' && job.status !== 'failed'
    return (
      <div className="flex h-full flex-col overflow-hidden px-lg py-sm">
        <div className="shrink-0 border-b border-slate-800 pb-sm">
          <div className="flex flex-wrap items-center gap-sm">
            {job?.status === 'done' ? (
              <span className="flex items-center gap-xs text-sm font-semibold text-success-300"><CheckCircle2 className="h-4 w-4" /> Concluído — {clips.length} vídeo(s)</span>
            ) : job?.status === 'failed' ? (
              <span className="flex items-center gap-xs text-sm font-semibold text-error-300"><AlertCircle className="h-4 w-4" /> Falhou</span>
            ) : (
              <span className="flex items-center gap-xs text-sm text-slate-300"><Loader2 className="h-4 w-4 animate-spin" /> {job?.stage_detail || 'Gerando…'}{job?.progress ? ` (${Math.round(job.progress)}%)` : ''}</span>
            )}
            {clips.length > 0 && <span className="text-xs text-slate-500">· {clips.length} pronto(s)</span>}
            <div className="ml-auto flex flex-wrap items-center gap-xs">
              {clips.length > 0 && (
                <>
                  <Button variant="ghost" size="sm"
                    onClick={() => setSelectedClips(prev =>
                      prev.size === clips.length ? new Set() : new Set(clips.map(c => c.id)))}>
                    {selectedClips.size === clips.length && clips.length > 0 ? 'Limpar' : 'Selecionar todos'}
                  </Button>
                  {isLocalBackend() && (
                    <button onClick={() => api.openClipsFolder().catch(() => {})}
                      className="inline-flex items-center gap-xs rounded-md border border-slate-700 px-md py-xs text-xs text-slate-300 hover:bg-slate-800">
                      <FolderOpen className="h-3.5 w-3.5" /> Abrir pasta
                    </button>
                  )}
                  <a href={api.downloadAllUrl(jobId, mediaToken ?? undefined)}
                    className="inline-flex items-center gap-xs rounded-md border border-slate-700 px-md py-xs text-xs text-slate-300 hover:bg-slate-800">
                    <Package className="w-3 h-3" /> Baixar todos (.zip)
                  </a>
                  {selectedClips.size > 0 && (
                    <a href={api.downloadAllUrl(jobId, mediaToken ?? undefined, [...selectedClips])}
                      className="inline-flex items-center gap-xs rounded-md border border-primary-500/50 bg-primary-500/10 px-md py-xs text-xs text-primary-200 hover:bg-primary-500/20">
                      <Package className="w-3 h-3" /> Baixar {selectedClips.size} (.zip)
                    </a>
                  )}
                </>
              )}
              <Button variant="secondary" size="sm" onClick={() => {
                if (pollRef.current) clearTimeout(pollRef.current)
                setJobId(null); setJob(null); setClips([]); setError(null)
              }}><RotateCcw className="w-3 h-3" /> Voltar</Button>
            </div>
          </div>
          {rendering && (
            <div className="mt-xs h-1 w-full overflow-hidden rounded-full bg-slate-800">
              <div className="h-full bg-primary-500 transition-all" style={{ width: `${job!.progress || 0}%` }} />
            </div>
          )}
          {error && <p className="mt-xs text-xs text-error-300">{error}</p>}
        </div>

        {/* grade de cortes — contida no viewport (sem scroll de página) */}
        <div className="min-h-0 flex-1 overflow-y-auto pt-sm">
          {clips.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-sm text-sm text-slate-500">
              {job?.status === 'failed'
                ? 'Nada foi gerado.'
                : <><Loader2 className="h-6 w-6 animate-spin text-primary-400" /> Renderizando os cortes…</>}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-sm sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7">
              {clips.map(c => {
                const sel = selectedClips.has(c.id)
                return (
                  <div key={c.id} className={`overflow-hidden rounded-lg border bg-slate-900 ${sel ? 'border-primary-500' : 'border-slate-800'}`}>
                    <div className="relative">
                      <video src={api.downloadClip(c.id, mediaToken ?? undefined)} controls preload="metadata" className="aspect-[9/16] max-h-[42vh] w-full bg-black object-contain" />
                      <button type="button" title={sel ? 'Desmarcar' : 'Selecionar'}
                        onClick={() => setSelectedClips(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n })}
                        className={`absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors ${sel ? 'border-primary-500 bg-primary-500 text-white' : 'border-white/70 bg-black/50 text-transparent hover:border-white'}`}>
                        ✓
                      </button>
                    </div>
                    <div className="flex items-center gap-xs px-xs py-[3px]">
                      <span className="flex-1 truncate text-[10px] text-slate-400">{c.topic_label || c.title || `Vídeo ${c.id}`}</span>
                      <a href={api.downloadClip(c.id, mediaToken ?? undefined)} download title="Baixar"
                        className="rounded p-[2px] text-slate-400 hover:bg-slate-800 hover:text-slate-200">
                        <Download className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ================================ EDITOR =======================================
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-1 min-h-0 flex-col gap-lg overflow-y-auto px-lg py-md lg:flex-row lg:overflow-hidden">
        {/* preview REAL */}
        <div className="flex shrink-0 flex-col items-center gap-xs lg:w-[300px]">
          <div className="relative w-full max-w-[300px] overflow-hidden rounded-xl border border-slate-800 bg-[#0a0a0a]">
            {preview && preview.videoId != null ? (
              <>
                {previewImg
                  ? <img src={previewImg} alt="Preview do vídeo final" className="block w-full" />
                  : <div className="flex aspect-[9/16] w-full items-center justify-center gap-xs text-[11px] text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> gerando preview…
                    </div>}
                {previewLoading && previewImg && (
                  <div className="absolute right-2 top-2 flex items-center gap-xs rounded-full bg-black/60 px-sm py-[2px] text-[10px] text-slate-100">
                    <Loader2 className="h-3 w-3 animate-spin" /> atualizando…
                  </div>
                )}
                {previewErr && (
                  <div className="absolute inset-x-0 bottom-0 bg-error-500/80 px-sm py-xs text-center text-[10px] text-white">{previewErr}</div>
                )}
              </>
            ) : (
              <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-xs p-4 text-center text-[11px] text-slate-500">
                {preview ? <><Loader2 className="h-4 w-4 animate-spin" /> baixando o vídeo…</> : <>Adicione um vídeo para ver o preview real</>}
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-500">Preview real — renderizado igual ao vídeo final</p>
        </div>

        {/* campos (perfil/legenda/gancho) — coluna do meio, largura fixa */}
        <div className="flex min-h-0 w-full flex-col gap-sm lg:w-[400px] lg:shrink-0 lg:overflow-y-auto lg:pr-sm">
          <div>
            <div className="mb-xs flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Perfil</p>
              {profiles.length > 0 && <span className="text-[10px] text-slate-500">{profiles.length} salvo(s) — clique para usar</span>}
            </div>

            {profiles.length > 0 && (
              <div className="mb-sm flex flex-wrap gap-xs">
                {profiles.map(p => {
                  const active = p.id === activeProfileId
                  return (
                    <div key={p.id} onClick={() => selectProfile(p)} title={`Usar @${p.handle}`}
                      className={`group relative flex shrink-0 cursor-pointer items-center gap-xs rounded-full border py-[3px] pl-[3px] pr-sm ${active ? 'border-primary-500 bg-primary-500/10' : 'border-slate-700 bg-slate-800/60 hover:border-slate-500'}`}>
                      {p.avatarId
                        ? <img src={api.tweetAvatarUrl(p.avatarId)} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                            className="h-6 w-6 rounded-full object-cover" />
                        : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">{(p.name.trim()[0] || '?').toUpperCase()}</span>}
                      <span className="max-w-[110px] truncate text-[11px] text-slate-200">{p.name}</span>
                      {active && <CheckCircle2 className="h-3 w-3 shrink-0 text-primary-400" />}
                      <button onClick={(e) => { e.stopPropagation(); deleteProfile(p.id) }} title="Excluir perfil"
                        className="ml-[1px] rounded-full p-[2px] text-slate-500 opacity-0 transition-opacity hover:bg-error-500/20 hover:text-error-400 group-hover:opacity-100">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex items-center gap-sm">
              <label className="group relative cursor-pointer" title="Trocar avatar">
                {avatarPreview
                  ? <img src={avatarPreview} alt="" onError={() => { setAvatarPreview(null); setAvatarId(null) }}
                      className="h-14 w-14 rounded-full object-cover ring-2 ring-slate-700 group-hover:ring-primary-500" />
                  : <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-lg font-bold text-white ring-2 ring-slate-700 group-hover:ring-primary-500">{(name.trim()[0] || '?').toUpperCase()}</span>}
                <span className="absolute -bottom-1 -right-1 rounded-full bg-slate-700 p-1 text-slate-200"><Upload className="h-3 w-3" /></span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
              </label>
              <div className="min-w-0 flex-1 space-y-xs">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do perfil"
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-sm py-xs text-xs text-slate-100 placeholder-slate-500" />
                <div className="flex items-center gap-xs">
                  <span className="text-xs text-slate-500">@</span>
                  <input value={handle} onChange={(e) => setHandle(e.target.value.replace(/[^\w.]/g, ''))} placeholder="usuario"
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-sm py-xs text-xs text-slate-100 placeholder-slate-500" />
                </div>
              </div>
            </div>
            <label className="mt-sm flex cursor-pointer items-center gap-xs text-xs text-slate-300">
              <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="accent-primary-500" />
              <BadgeCheck className="h-3.5 w-3.5 fill-[#1D9BF0] text-white" /> Selo de verificado
            </label>

            <div className="mt-sm flex flex-wrap items-center gap-xs">
              {activeProfile && activeUnchanged ? (
                <span className="flex items-center gap-xs text-[11px] text-success-300">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Perfil <span className="font-semibold text-slate-200">{activeProfile.name}</span> em uso nos cortes
                </span>
              ) : (
                <>
                  {activeProfile && (
                    <Button variant="secondary" size="sm" onClick={() => saveProfile('update')} title={`Sobrescreve o perfil "${activeProfile.name}"`}>
                      <Save className="h-3 w-3" /> Atualizar {activeProfile.name}
                    </Button>
                  )}
                  <Button variant={activeProfile ? 'ghost' : 'secondary'} size="sm" onClick={() => saveProfile('new')}
                    title="Salva a foto, nome, @ e selo atuais como um novo perfil">
                    <UserPlus className="h-3 w-3" /> {profiles.length ? 'Salvar como novo perfil' : 'Salvar perfil'}
                  </Button>
                </>
              )}
            </div>
          </div>

          <div>
            <p className="mb-xs text-[11px] font-semibold uppercase tracking-wide text-slate-500">Legenda padrão (aplicada aos novos vídeos)</p>
            <textarea value={defaultCaption} onChange={(e) => setDefaultCaption(e.target.value)} rows={2}
              placeholder="As ruas jamais esquecerão… 🥶  (deixe em branco para manter a legenda original do vídeo)"
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-sm py-xs text-xs text-slate-100 placeholder-slate-500" />
            <p className="mt-xs text-[10px] text-slate-500">Em vídeos que já vêm com card, a legenda em branco <span className="text-slate-300">mantém a original</span>; preencher substitui.</p>
          </div>

          <div>
            <p className="mb-xs text-[11px] font-semibold uppercase tracking-wide text-slate-500">Texto de gancho (faixa no topo do vídeo)</p>
            <input value={hook} onChange={(e) => setHook(e.target.value)} maxLength={80}
              placeholder="Ex.: ASSISTA ATÉ O FIM 👀  (deixe em branco para não mostrar faixa)"
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-sm py-xs text-xs text-slate-100 placeholder-slate-500" />
            <p className="mt-xs text-[10px] text-slate-500">O vídeo sai <span className="text-slate-300">menor e com moldura</span>; a faixa de gancho aparece no topo — deixa o corte diferente do original.</p>
          </div>
        </div>

        {/* vídeos — coluna da direita (scroll vertical próprio) */}
        <div className="flex min-h-0 w-full flex-col lg:flex-1 lg:overflow-hidden">
            <div className="mb-xs flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Vídeos ({items.length}){importing && <Loader2 className="ml-xs inline h-3 w-3 animate-spin text-amber-400" />}
              </p>
              <div className="flex items-center gap-xs">
                {items.length > 0 && (
                  <Button variant="secondary" size="sm" onClick={clearAll} disabled={autoGen} title="Remove todos os vídeos da fila">
                    <Trash2 className="h-3 w-3" /> Limpar tudo
                  </Button>
                )}
                <Button variant="primary" size="sm"
                  onClick={() => {
                    if (items.some(i => i.videoId == null && !i.error)) {
                      setAutoGen(true); toast('Beleza — gero sozinho assim que os downloads terminarem')
                    } else { void generate() }
                  }}
                  disabled={items.filter(i => !i.error).length === 0 || autoGen}>
                  Gerar {items.filter(i => !i.error).length > 1 ? `${items.filter(i => !i.error).length} vídeos` : 'vídeo'}
                </Button>
              </div>
            </div>

            {autoGen && (() => {
              const total = items.length
              const done = items.filter(i => i.videoId != null && !i.error)
              const failed = items.filter(i => i.error)
              const downloading = items.filter(i => i.videoId == null && !i.error)
              const current = downloading[0]
              return (
                <div className="mb-sm rounded-lg border border-primary-500/40 bg-primary-500/5 px-sm py-sm">
                  <div className="flex items-center gap-sm">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary-400" />
                    <span className="flex-1 text-[11px] font-semibold text-slate-200">
                      Modo direto — {done.length} de {total} baixado(s)
                      {downloading.length > 0 && `, faltam ${downloading.length}`}
                      {failed.length > 0 && ` · ${failed.length} falhou/falharam`}
                    </span>
                    <button onClick={() => setAutoGen(false)} className="shrink-0 rounded border border-slate-700 px-sm py-[2px] text-[10px] text-slate-400 hover:text-slate-200">cancelar</button>
                  </div>
                  <div className="mt-xs h-1 w-full overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full bg-primary-500 transition-all" style={{ width: `${total ? (done.length / total) * 100 : 0}%` }} />
                  </div>
                  {current && (
                    <p className="mt-xs truncate text-[11px] text-slate-300">⬇️ Baixando agora: <span className="text-slate-100">{current.fileName}</span></p>
                  )}
                  {downloading.length === 0 && <p className="mt-xs text-[11px] text-success-300">✓ Downloads concluídos — iniciando a geração…</p>}
                  {saveLoc && <p className="mt-xs truncate text-[10px] text-slate-500">Ao terminar, os prontos ficam disponíveis para download aqui.</p>}
                </div>
              )
            })()}


            <div className="mb-sm flex gap-xs">
              <ClearableInput value={urlInput} onChange={setUrlInput}
                onKeyDown={(e) => { if (e.key === 'Enter' && urlInput.trim() && !probing) probeUrl() }}
                placeholder="Cole um link de vídeo OU de perfil/canal (YouTube, TikTok, IG…)"
                icon={<Link2 className="h-4 w-4 shrink-0 text-slate-500" />} className="flex-1" />
              <Button variant="secondary" size="sm" onClick={probeUrl} isLoading={probing} disabled={!urlInput.trim()}>
                <Search className="h-3 w-3" /> Buscar
              </Button>
            </div>

            {picker && (
              <div className="mb-sm rounded-lg border border-primary-500/40 bg-slate-900/70 p-sm">
                <div className="mb-xs flex flex-wrap items-center gap-xs">
                  <p className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-200">{picker.videos.length} vídeos em "{picker.profile}" — escolha quantos quiser</p>
                  <Button variant="secondary" size="sm" onClick={() => setPickerSel(new Set(picker.videos.map(v => v.url)))}>Todos</Button>
                  <Button variant="secondary" size="sm" onClick={() => setPickerSel(new Set())}>Limpar</Button>
                  <Button variant="primary" size="sm" onClick={() => confirmPicker(true)} disabled={pickerSel.size === 0}>⚡ Gerar {pickerSel.size || ''} direto</Button>
                  <Button variant="secondary" size="sm" onClick={() => confirmPicker(false)} disabled={pickerSel.size === 0}>Só adicionar</Button>
                  <Button variant="secondary" size="sm" onClick={() => setPicker(null)}>Cancelar</Button>
                </div>
                <div className="grid max-h-64 grid-cols-3 gap-xs overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
                  {picker.videos.map(v => {
                    const sel = pickerSel.has(v.url)
                    return (
                      <button key={v.url} type="button"
                        onClick={() => setPickerSel(prev => { const n = new Set(prev); n.has(v.url) ? n.delete(v.url) : n.add(v.url); return n })}
                        className={`relative overflow-hidden rounded-md border-2 bg-black text-left ${sel ? 'border-primary-500' : 'border-slate-800 hover:border-slate-600'}`}>
                        {v.thumbnail
                          ? <img src={v.thumbnail} alt="" referrerPolicy="no-referrer" loading="lazy" className="aspect-[9/12] w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          : <span className="flex aspect-[9/12] items-center justify-center text-slate-700"><Play className="h-5 w-5" /></span>}
                        <span className={`absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full border text-[9px] ${sel ? 'border-primary-500 bg-primary-500 text-white' : 'border-white/70 bg-black/50 text-transparent'}`}>✓</span>
                        <span className="block truncate px-xs py-[2px] text-[9px] text-slate-400">{v.title || v.url}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <label onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); e.dataTransfer.files?.length && addVideos(e.dataTransfer.files) }}
              className="flex cursor-pointer items-center justify-center gap-sm rounded-lg border-2 border-dashed border-slate-700 bg-slate-900/50 py-md text-xs text-slate-400 hover:bg-slate-850">
              <Upload className="h-4 w-4" /> Ou arraste arquivos de vídeo aqui (um ou vários)
              <input type="file" accept="video/*" multiple className="hidden" onChange={(e) => e.target.files?.length && addVideos(e.target.files)} />
            </label>

            <div className="mt-sm min-h-0 flex-1 space-y-xs overflow-y-auto pr-xs">
              {items.map(it => (
                <div key={it.key}
                  className={`flex items-start gap-sm rounded-lg border p-sm ${previewKey === it.key ? 'border-primary-500/60 bg-slate-900' : 'border-slate-800 bg-slate-900/60'}`}
                  onClick={() => setPreviewKey(it.key)}>
                  {it.previewUrl
                    ? <video src={it.previewUrl} muted playsInline preload="metadata" className="h-16 w-10 shrink-0 rounded bg-black object-cover" />
                    : it.thumb
                      ? <img src={it.thumb} alt="" referrerPolicy="no-referrer" className="h-16 w-10 shrink-0 rounded bg-black object-cover" />
                      : <span className="flex h-16 w-10 shrink-0 items-center justify-center rounded bg-black text-slate-700"><Play className="h-4 w-4" /></span>}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-xs truncate text-xs text-slate-300">
                      {it.fileName}
                      {it.error ? <span className="text-error-400">· {it.error}</span>
                        : it.videoId == null
                          ? <span className="flex items-center gap-xs text-amber-400"><Loader2 className="h-3 w-3 animate-spin" /> {it.status || 'enviando…'}</span>
                          : <CheckCircle2 className="h-3 w-3 text-success-400" />}
                    </p>
                    <textarea value={it.caption} rows={2}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setItems(prev => prev.map(x => x.key === it.key ? { ...x, caption: e.target.value } : x))}
                      placeholder="Legenda deste vídeo…  (vazio = mantém a legenda original)"
                      className="mt-xs w-full rounded-md border border-slate-700 bg-slate-800 px-sm py-xs text-xs text-slate-100 placeholder-slate-500" />
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); removeItem(it.key) }}
                    className="rounded p-xs text-slate-500 hover:bg-error-500/10 hover:text-error-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
      </div>
    </div>
  )
}
