import { useState, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  RefreshCw, Eye, Loader2, Copy, Check, Terminal,
  Trash2, StickyNote, ChevronRight, ChevronDown,
  Play, Square, ListRestart,
} from 'lucide-react'
import api from '@/lib/api'
import { formatDistanceToNow, format } from 'date-fns'
import { toast } from 'sonner'

interface Webhook {
  id: string
  method: string
  endpointId: string
  endpointName: string
  endpointToken: string
  clientName: string
  sourceIp: string
  sizeBytes: number
  receivedAt: string
  note?: string | null
}

interface WebhookDetail extends Webhook {
  headers: Record<string, string>
  body: string
  bodyParsed: Record<string, unknown> | null
}

interface Replay {
  id: string
  targetType: string
  targetUrl: string | null
  status: string
  responseCode: number | null
  errorMsg: string | null
  createdAt: string
}

interface Delivery {
  id: string
  sessionId: string | null
  statusCode: number | null
  responseHeaders: Record<string, string> | null
  responseBody: string | null
  durationMs: number | null
  errorMsg: string | null
  forwardedAt: string
  sessionIp: string | null
  sessionConnectedAt: string | null
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function JsonHighlight({ value }: { value: string }) {
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { return <>{value}</> }

  const highlighted = JSON.stringify(parsed, null, 2).replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'text-sky-600 dark:text-sky-400'
      if (/^"/.test(match)) {
        cls = /:$/.test(match)
          ? 'text-violet-600 dark:text-violet-400 font-medium'
          : 'text-green-700 dark:text-green-400'
      } else if (/true|false/.test(match)) {
        cls = 'text-amber-600 dark:text-amber-400'
      } else if (/null/.test(match)) {
        cls = 'text-rose-500 dark:text-rose-400'
      }
      return `<span class="${cls}">${match}</span>`
    },
  )
  return <span dangerouslySetInnerHTML={{ __html: highlighted }} />
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    POST:    'bg-blue-500/10 text-blue-600',
    GET:     'bg-green-500/10 text-green-600',
    PUT:     'bg-yellow-500/10 text-yellow-700',
    PATCH:   'bg-orange-500/10 text-orange-600',
    DELETE:  'bg-red-500/10 text-red-600',
    HEAD:    'bg-cyan-500/10 text-cyan-600',
    OPTIONS: 'bg-muted text-muted-foreground',
  }
  return (
    <Badge variant="outline" className={`text-xs font-mono shrink-0 ${colors[method] ?? ''}`}>
      {method}
    </Badge>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === 'success' ? 'default' : 'destructive'} className="text-xs">
      {status}
    </Badge>
  )
}

function HttpStatusBadge({ code }: { code: number | null }) {
  if (code === null) return <Badge variant="destructive" className="text-xs font-mono">ERR</Badge>
  const cls =
    code < 300 ? 'bg-green-500/10 text-green-700' :
    code < 400 ? 'bg-blue-500/10 text-blue-600' :
    code < 500 ? 'bg-orange-500/10 text-orange-600' :
    'bg-red-500/10 text-red-600'
  return <Badge variant="outline" className={`text-xs font-mono ${cls}`}>{code}</Badge>
}

const HOP_BY_HOP_WEB = new Set([
  'host', 'connection', 'keep-alive', 'transfer-encoding',
  'te', 'trailer', 'upgrade', 'proxy-authorization', 'content-length',
])

function buildCurl(detail: WebhookDetail, parsedHeaders: Record<string, string>, body: string, targetUrl: string): string {
  const lines: string[] = [`curl -X ${detail.method ?? 'POST'} '${targetUrl}'`]
  for (const [k, v] of Object.entries(parsedHeaders)) {
    if (!HOP_BY_HOP_WEB.has(k.toLowerCase())) {
      lines.push(`  -H '${k}: ${String(v).replace(/'/g, "'\\''")}'`)
    }
  }
  if (body) {
    const escaped = body.replace(/'/g, "'\\''")
    lines.push(`  -d '${escaped}'`)
  }
  return lines.join(' \\\n')
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="h-7 gap-1.5 text-xs">
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied!' : label}
    </Button>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export default function Webhooks() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replayTarget, setReplayTarget] = useState<'ws' | 'url'>('ws')
  const [replayUrl, setReplayUrl] = useState('')
  const [replayingId, setReplayingId] = useState<string | null>(null)
  const [curlTarget, setCurlTarget] = useState('http://localhost:3000/webhook')

  // selection
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<'single' | 'bulk' | null>(null)
  const [deleteSingleId, setDeleteSingleId] = useState<string | null>(null)

  // collapsed endpoint groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // bulk replay
  const [bulkReplayOpen, setBulkReplayOpen] = useState(false)
  const [bulkReplayTarget, setBulkReplayTarget] = useState<'ws' | 'url'>('ws')
  const [bulkReplayUrl, setBulkReplayUrl] = useState('')
  const [bulkReplayDelay, setBulkReplayDelay] = useState(500)
  const [bulkReplayProgress, setBulkReplayProgress] = useState<{
    current: number; total: number; running: boolean; succeeded: number; failed: number
  } | null>(null)
  const cancelRef = useRef(false)

  // note editing state (local to dialog)
  const [noteValue, setNoteValue] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)

  const qc = useQueryClient()

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => api.get('/webhooks?limit=200').then((r) => r.data as Webhook[]),
    refetchInterval: 8000,
  })

  // group by endpoint
  const groups = useMemo(() => {
    if (!webhooks) return []
    const map = new Map<string, { endpointId: string; endpointName: string; clientName: string; items: Webhook[] }>()
    for (const wh of webhooks) {
      if (!map.has(wh.endpointId)) {
        map.set(wh.endpointId, {
          endpointId: wh.endpointId,
          endpointName: wh.endpointName,
          clientName: wh.clientName,
          items: [],
        })
      }
      map.get(wh.endpointId)!.items.push(wh)
    }
    return Array.from(map.values())
  }, [webhooks])

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['webhook', selectedId],
    queryFn: () => api.get(`/webhooks/${selectedId}`).then((r) => r.data as WebhookDetail),
    enabled: !!selectedId,
  })

  // sync note value when detail loads
  const openDetail = (id: string) => {
    setSelectedId(id)
    setNoteSaved(false)
  }

  // when detail changes reset note field
  const currentNote = detail?.note ?? ''

  const { data: replays } = useQuery({
    queryKey: ['replays', selectedId],
    queryFn: () => api.get(`/webhooks/${selectedId}/replays`).then((r) => r.data as Replay[]),
    enabled: !!selectedId,
  })

  const { data: deliveries } = useQuery({
    queryKey: ['deliveries', selectedId],
    queryFn: () => api.get(`/webhooks/${selectedId}/deliveries`).then((r) => r.data as Delivery[]),
    enabled: !!selectedId,
    refetchInterval: 5000,
  })

  // ── mutations ───────────────────────────────────────────────────────────────

  const replayMutation = useMutation({
    mutationFn: (vars: { id: string; target: string; url?: string }) =>
      api.post(`/webhooks/${vars.id}/replay`, { target: vars.target, url: vars.url }),
    onSuccess: (res) => {
      const d = res.data
      if (d.status === 'success') toast.success(`Replayed — ${d.forwarded ?? 1} client(s) reached`)
      else toast.error(`Replay failed${d.errorMsg ? `: ${d.errorMsg}` : ''}`)
      qc.invalidateQueries({ queryKey: ['replays', selectedId] })
    },
    onError: () => toast.error('Replay failed'),
  })

  const quickReplayMutation = useMutation({
    mutationFn: (id: string) => api.post(`/webhooks/${id}/replay`, { target: 'ws' }),
    onMutate: (id) => setReplayingId(id),
    onSettled: () => setReplayingId(null),
    onSuccess: (res, id) => {
      const d = res.data
      if (d.status === 'success') toast.success(`Replayed to ${d.forwarded ?? 1} client(s)`)
      else toast.error(`Replay failed${d.errorMsg ? `: ${d.errorMsg}` : ''}`)
      qc.invalidateQueries({ queryKey: ['replays', id] })
    },
    onError: () => toast.error('Replay failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/webhooks/${id}`),
    onSuccess: (_, id) => {
      toast.success('Webhook deleted')
      if (selectedId === id) setSelectedId(null)
      setCheckedIds((prev) => { const next = new Set(prev); next.delete(id); return next })
      qc.invalidateQueries({ queryKey: ['webhooks'] })
    },
    onError: () => toast.error('Delete failed'),
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.post('/webhooks/bulk-delete', { ids }),
    onSuccess: (res) => {
      toast.success(`${res.data.deleted} webhook(s) deleted`)
      setCheckedIds(new Set())
      if (selectedId && checkedIds.has(selectedId)) setSelectedId(null)
      qc.invalidateQueries({ queryKey: ['webhooks'] })
    },
    onError: () => toast.error('Bulk delete failed'),
  })

  const noteMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.patch(`/webhooks/${id}`, { note: note || null }),
    onSuccess: (_, { note }) => {
      setNoteSaved(true)
      setTimeout(() => setNoteSaved(false), 2000)
      // update cached list
      qc.setQueryData(['webhooks'], (old: Webhook[] | undefined) =>
        old?.map((w) => w.id === selectedId ? { ...w, note: note || null } : w),
      )
      qc.invalidateQueries({ queryKey: ['webhook', selectedId] })
    },
    onError: () => toast.error('Failed to save note'),
  })

  // ── helpers ─────────────────────────────────────────────────────────────────

  function toggleCheck(id: string, checked: boolean) {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleGroup(_endpointId: string, allIds: string[], checked: boolean) {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      allIds.forEach((id) => checked ? next.add(id) : next.delete(id))
      return next
    })
  }

  function toggleCollapse(endpointId: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(endpointId)) next.delete(endpointId)
      else next.add(endpointId)
      return next
    })
  }

  function handleReplay() {
    if (!selectedId) return
    replayMutation.mutate({ id: selectedId, target: replayTarget, url: replayTarget === 'url' ? replayUrl : undefined })
  }

  function confirmDeleteSingle(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setDeleteSingleId(id)
    setConfirmDelete('single')
  }

  async function startBulkReplay() {
    if (!webhooks) return
    const selected = webhooks
      .filter((w) => checkedIds.has(w.id))
      .sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime())

    cancelRef.current = false
    setBulkReplayProgress({ current: 0, total: selected.length, running: true, succeeded: 0, failed: 0 })

    let succeeded = 0
    let failed = 0

    for (let i = 0; i < selected.length; i++) {
      if (cancelRef.current) break
      try {
        const res = await api.post(`/webhooks/${selected[i].id}/replay`, {
          target: bulkReplayTarget,
          url: bulkReplayTarget === 'url' ? bulkReplayUrl : undefined,
        })
        if (res.data.status === 'success') succeeded++
        else failed++
      } catch {
        failed++
      }

      const isLast = i === selected.length - 1
      setBulkReplayProgress({
        current: i + 1, total: selected.length,
        running: !isLast && !cancelRef.current,
        succeeded, failed,
      })

      if (!isLast && !cancelRef.current && bulkReplayDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, bulkReplayDelay))
      }
    }

    if (cancelRef.current) {
      toast.info(`Replay annulé — ${succeeded} envoyé(s)`)
    } else {
      toast.success(`Bulk replay terminé — ${succeeded} ok${failed > 0 ? `, ${failed} échec(s)` : ''}`)
    }
  }

  const parsedHeaders = detail
    ? typeof detail.headers === 'string' ? JSON.parse(detail.headers) : (detail.headers ?? {})
    : {}

  const rawBodyParsed = detail?.bodyParsed
    ? typeof detail.bodyParsed === 'string' ? JSON.parse(detail.bodyParsed) : detail.bodyParsed
    : null

  const body = rawBodyParsed ? JSON.stringify(rawBodyParsed, null, 2) : detail?.body ?? ''

  const checkedCount = checkedIds.size

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Webhooks</h1>
            <p className="text-muted-foreground text-sm">Received webhooks history — grouped by endpoint</p>
          </div>
          {checkedCount > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setBulkReplayOpen(true)}
              >
                <ListRestart className="h-3.5 w-3.5" />
                Replay selected ({checkedCount})
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                onClick={() => setConfirmDelete('bulk')}
                disabled={bulkDeleteMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete selected ({checkedCount})
              </Button>
            </div>
          )}
        </div>

        {/* ── table ─────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-0">
            {isLoading && (
              <div className="divide-y">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-4">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-5 w-14" />
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-24 ml-auto" />
                  </div>
                ))}
              </div>
            )}

            {!isLoading && webhooks?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-10">
                No webhooks received yet. Send a POST to <code>/hook/:token</code>
              </p>
            )}

            {!isLoading && groups.map((group) => {
              const groupIds = group.items.map((w) => w.id)
              const allChecked = groupIds.every((id) => checkedIds.has(id))
              const someChecked = groupIds.some((id) => checkedIds.has(id))
              const isCollapsed = collapsedGroups.has(group.endpointId)

              return (
                <div key={group.endpointId} className="border-b last:border-b-0">
                  {/* group header */}
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b select-none">
                    <Checkbox
                      checked={allChecked ? true : someChecked ? 'indeterminate' : false}
                      onCheckedChange={(v) => toggleGroup(group.endpointId, groupIds, !!v)}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0"
                    />
                    <button
                      className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground/80 transition-colors min-w-0"
                      onClick={() => toggleCollapse(group.endpointId)}
                    >
                      {isCollapsed
                        ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      }
                      <span className="truncate">{group.endpointName}</span>
                      <span className="text-muted-foreground font-normal truncate">· {group.clientName}</span>
                    </button>
                    <span className="ml-auto text-xs text-muted-foreground shrink-0">
                      {group.items.length} webhook{group.items.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* rows */}
                  {!isCollapsed && (
                    <table className="w-full text-sm">
                      <tbody className="divide-y">
                        {group.items.map((wh) => (
                          <tr
                            key={wh.id}
                            className="group hover:bg-muted/40 cursor-pointer transition-colors"
                            onClick={() => openDetail(wh.id)}
                          >
                            {/* checkbox */}
                            <td className="pl-4 pr-2 py-3 w-8" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={checkedIds.has(wh.id)}
                                onCheckedChange={(v) => toggleCheck(wh.id, !!v)}
                              />
                            </td>

                            {/* method */}
                            <td className="pr-3 py-3 w-20">
                              <MethodBadge method={wh.method} />
                            </td>

                            {/* source IP */}
                            <td className="pr-3 py-3 w-36 font-mono text-xs text-muted-foreground">
                              {wh.sourceIp}
                            </td>

                            {/* note indicator */}
                            <td className="pr-3 py-3 w-8">
                              {wh.note && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <StickyNote className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs text-xs">
                                    {wh.note}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </td>

                            {/* size + time */}
                            <td className="py-3 pl-2 text-right pr-3 w-32">
                              <p className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(wh.receivedAt), { addSuffix: true })}
                              </p>
                              <p className="text-xs text-muted-foreground">{(wh.sizeBytes / 1024).toFixed(1)} KB</p>
                            </td>

                            {/* actions */}
                            <td className="py-3 pr-3 w-20 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost" size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                      onClick={(e) => { e.stopPropagation(); quickReplayMutation.mutate(wh.id) }}
                                      disabled={replayingId === wh.id}
                                    >
                                      {replayingId === wh.id
                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        : <RefreshCw className="h-3.5 w-3.5" />}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top"><p>Replay to WS clients</p></TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost" size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                      onClick={(e) => confirmDeleteSingle(wh.id, e)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top"><p>Delete</p></TooltipContent>
                                </Tooltip>

                                <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* ── detail dialog ─────────────────────────────────── */}
        <Dialog open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
          <DialogContent className="w-[80vw] max-w-[80vw] sm:w-[80vw] sm:max-w-[80vw] max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {detail && <MethodBadge method={detail.method} />}
                <span className="truncate">{detail?.endpointName}</span>
                {detail?.note && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <StickyNote className="h-4 w-4 text-amber-500 shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs text-xs">{detail.note}</TooltipContent>
                  </Tooltip>
                )}
              </DialogTitle>
            </DialogHeader>

            {loadingDetail ? (
              <div className="space-y-3 flex-1">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : detail && (
              <Tabs defaultValue="body" className="flex-1 flex flex-col min-h-0">
                <TabsList className="shrink-0 flex-wrap">
                  <TabsTrigger value="body">Body</TabsTrigger>
                  <TabsTrigger value="headers">Headers</TabsTrigger>
                  <TabsTrigger value="note">
                    <StickyNote className="h-3.5 w-3.5 mr-1" />
                    Note {detail.note && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-amber-500 inline-block" />}
                  </TabsTrigger>
                  <TabsTrigger value="curl">
                    <Terminal className="h-3.5 w-3.5 mr-1" />curl
                  </TabsTrigger>
                  <TabsTrigger value="deliveries">
                    Deliveries {deliveries && deliveries.length > 0 && (
                      <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] font-medium">{deliveries.length}</span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="replay">Replay</TabsTrigger>
                  <TabsTrigger value="history">History ({replays?.length ?? 0})</TabsTrigger>
                </TabsList>

                {/* body */}
                <TabsContent value="body" className="flex-1 min-h-0">
                  <ScrollArea className="h-64 w-full border rounded-md bg-muted/30">
                    {body ? (
                      <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">
                        <JsonHighlight value={body} />
                      </pre>
                    ) : (
                      <p className="p-4 text-xs text-muted-foreground italic">empty body</p>
                    )}
                  </ScrollArea>
                  <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                    <span>Received: {format(new Date(detail.receivedAt), 'PPpp')}</span>
                    <span className="ml-auto">{detail.sourceIp} · {detail.sizeBytes} B</span>
                  </div>
                </TabsContent>

                {/* headers */}
                <TabsContent value="headers" className="flex-1 min-h-0">
                  <ScrollArea className="h-64 w-full border rounded-md">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                        <tr>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 w-2/5">Header</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {Object.entries(parsedHeaders).map(([k, v]) => (
                          <tr key={k} className="hover:bg-muted/40">
                            <td className="px-3 py-1.5 font-mono text-muted-foreground align-top whitespace-nowrap">{k}</td>
                            <td className="px-3 py-1.5 font-mono break-all">{String(v)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                </TabsContent>

                {/* note tab */}
                <TabsContent value="note" className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Note personnelle</Label>
                    <Textarea
                      key={selectedId}
                      defaultValue={currentNote}
                      onChange={(e) => setNoteValue(e.target.value)}
                      placeholder="Ajouter une note à ce webhook…"
                      className="min-h-[120px] text-sm font-mono resize-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => noteMutation.mutate({ id: detail.id, note: noteValue !== '' ? noteValue : currentNote })}
                      disabled={noteMutation.isPending}
                      className="gap-1.5"
                    >
                      {noteSaved
                        ? <><Check className="h-3.5 w-3.5" /> Saved</>
                        : noteMutation.isPending
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                          : <><StickyNote className="h-3.5 w-3.5" /> Save note</>
                      }
                    </Button>
                    {currentNote && (
                      <Button
                        size="sm" variant="ghost"
                        className="text-destructive hover:text-destructive gap-1.5"
                        onClick={() => {
                          setNoteValue('')
                          noteMutation.mutate({ id: detail.id, note: '' })
                        }}
                        disabled={noteMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Supprimer la note
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    La note est stockée côté serveur et visible dans la liste.
                  </p>
                </TabsContent>

                {/* curl */}
                <TabsContent value="curl" className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Target URL</Label>
                    <div className="flex gap-2">
                      <Input
                        value={curlTarget}
                        onChange={(e) => setCurlTarget(e.target.value)}
                        placeholder="http://localhost:3000/webhook"
                        className="font-mono text-xs"
                      />
                      <CopyButton text={detail ? buildCurl(detail, parsedHeaders, body, curlTarget) : ''} label="Copy curl" />
                    </div>
                  </div>
                  <ScrollArea className="h-56 w-full border rounded-md bg-muted/30">
                    <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-all leading-relaxed text-muted-foreground">
                      {detail ? buildCurl(detail, parsedHeaders, body, curlTarget) : ''}
                    </pre>
                  </ScrollArea>
                  <p className="text-[11px] text-muted-foreground">
                    Paste this curl in your terminal, or import it directly into Bruno / Insomnia.
                  </p>
                </TabsContent>

                {/* deliveries */}
                <TabsContent value="deliveries" className="flex-1 min-h-0 space-y-2">
                  <div className="flex gap-2 items-center">
                    <Label className="text-xs text-muted-foreground shrink-0">Target URL</Label>
                    <Input
                      value={curlTarget}
                      onChange={(e) => setCurlTarget(e.target.value)}
                      placeholder="http://localhost:3000/webhook"
                      className="font-mono text-xs h-7"
                    />
                  </div>
                  <ScrollArea className="h-60">
                    <div className="space-y-2">
                      {(!deliveries || deliveries.length === 0) && (
                        <p className="text-sm text-muted-foreground text-center py-6">
                          No deliveries yet — connect the CLI to start forwarding.
                        </p>
                      )}
                      {deliveries?.map((d) => (
                        <div key={d.id} className="border rounded-md p-3 text-sm space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <HttpStatusBadge code={d.statusCode} />
                            {d.durationMs !== null && <span className="text-xs text-muted-foreground">{d.durationMs}ms</span>}
                            {d.sessionIp && (
                              <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {d.sessionIp}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto">
                              {formatDistanceToNow(new Date(d.forwardedAt), { addSuffix: true })}
                            </span>
                            <CopyButton text={detail ? buildCurl(detail, parsedHeaders, body, curlTarget) : ''} label="curl" />
                          </div>
                          {d.errorMsg && <p className="text-xs text-destructive font-mono break-all">{d.errorMsg}</p>}
                          {d.responseBody && (
                            <details className="group">
                              <summary className="text-xs text-muted-foreground cursor-pointer select-none hover:text-foreground">
                                Response body
                              </summary>
                              <ScrollArea className="mt-1 h-28 border rounded bg-muted/30">
                                <pre className="p-2 text-[11px] font-mono whitespace-pre-wrap break-all leading-relaxed">
                                  <JsonHighlight value={d.responseBody} />
                                </pre>
                              </ScrollArea>
                            </details>
                          )}
                          {d.responseHeaders && Object.keys(d.responseHeaders).length > 0 && (
                            <details>
                              <summary className="text-xs text-muted-foreground cursor-pointer select-none hover:text-foreground">
                                Response headers
                              </summary>
                              <div className="mt-1 space-y-0.5">
                                {Object.entries(d.responseHeaders).map(([k, v]) => (
                                  <div key={k} className="flex gap-2 text-[11px] font-mono">
                                    <span className="text-muted-foreground shrink-0">{k}:</span>
                                    <span className="break-all">{String(v)}</span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* replay */}
                <TabsContent value="replay" className="space-y-4">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label>Target</Label>
                      <Select value={replayTarget} onValueChange={(v: string) => setReplayTarget(v as 'ws' | 'url')}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ws">WebSocket clients (live)</SelectItem>
                          <SelectItem value="url">External URL</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {replayTarget === 'url' && (
                      <div className="space-y-1">
                        <Label>URL</Label>
                        <Input
                          placeholder="https://example.com/webhook"
                          value={replayUrl}
                          onChange={(e) => setReplayUrl(e.target.value)}
                        />
                      </div>
                    )}
                    <Button
                      onClick={handleReplay}
                      disabled={replayMutation.isPending || (replayTarget === 'url' && !replayUrl)}
                      className="w-full"
                    >
                      {replayMutation.isPending
                        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Replaying…</>
                        : <><RefreshCw className="mr-2 h-4 w-4" /> Replay</>}
                    </Button>
                  </div>
                </TabsContent>

                {/* history */}
                <TabsContent value="history" className="flex-1 min-h-0">
                  <ScrollArea className="h-64">
                    <div className="space-y-2">
                      {replays?.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">No replays yet</p>
                      )}
                      {replays?.map((r) => (
                        <div key={r.id} className="border rounded-md p-3 text-sm space-y-1">
                          <div className="flex items-center gap-2">
                            <StatusBadge status={r.status} />
                            <Badge variant="outline" className="text-xs">{r.targetType}</Badge>
                            {r.responseCode && <span className="text-xs text-muted-foreground">HTTP {r.responseCode}</span>}
                            <span className="text-xs text-muted-foreground ml-auto">
                              {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                          {r.targetUrl && <p className="text-xs text-muted-foreground truncate">{r.targetUrl}</p>}
                          {r.errorMsg && <p className="text-xs text-destructive">{r.errorMsg}</p>}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>

        {/* ── bulk replay dialog ────────────────────────────── */}
        <Dialog open={bulkReplayOpen} onOpenChange={(o) => {
          if (!o && bulkReplayProgress?.running) {
            cancelRef.current = true
          }
          if (!o) setBulkReplayProgress(null)
          setBulkReplayOpen(o)
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ListRestart className="h-4 w-4" />
                Replay {checkedCount} webhook{checkedCount !== 1 ? 's' : ''}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Les webhooks seront rejoués dans l'ordre d'arrivée (du plus ancien au plus récent).
              </p>

              <div className="space-y-1">
                <Label>Cible</Label>
                <Select
                  value={bulkReplayTarget}
                  onValueChange={(v) => setBulkReplayTarget(v as 'ws' | 'url')}
                  disabled={bulkReplayProgress?.running}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ws">WebSocket clients (live)</SelectItem>
                    <SelectItem value="url">URL externe</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {bulkReplayTarget === 'url' && (
                <div className="space-y-1">
                  <Label>URL</Label>
                  <Input
                    placeholder="https://example.com/webhook"
                    value={bulkReplayUrl}
                    onChange={(e) => setBulkReplayUrl(e.target.value)}
                    disabled={bulkReplayProgress?.running}
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label className="flex items-center justify-between">
                  <span>Délai entre chaque replay</span>
                  <span className="text-muted-foreground font-normal tabular-nums">
                    {bulkReplayDelay >= 1000
                      ? `${(bulkReplayDelay / 1000).toFixed(bulkReplayDelay % 1000 === 0 ? 0 : 1)} s`
                      : `${bulkReplayDelay} ms`}
                  </span>
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0} max={5000} step={100}
                    value={bulkReplayDelay}
                    onChange={(e) => setBulkReplayDelay(Number(e.target.value))}
                    disabled={bulkReplayProgress?.running}
                    className="flex-1 accent-primary"
                  />
                  <Input
                    type="number"
                    min={0} max={30000} step={100}
                    value={bulkReplayDelay}
                    onChange={(e) => setBulkReplayDelay(Math.max(0, Number(e.target.value)))}
                    disabled={bulkReplayProgress?.running}
                    className="w-24 font-mono text-xs text-right"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">ms</span>
                </div>
              </div>

              {/* progress */}
              {bulkReplayProgress && (
                <div className="space-y-2 rounded-md border p-3 bg-muted/30">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">
                      {bulkReplayProgress.running
                        ? `Envoi ${bulkReplayProgress.current} / ${bulkReplayProgress.total}…`
                        : `Terminé — ${bulkReplayProgress.current} / ${bulkReplayProgress.total}`}
                    </span>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      {bulkReplayProgress.succeeded > 0 && (
                        <span className="text-green-600">✓ {bulkReplayProgress.succeeded}</span>
                      )}
                      {bulkReplayProgress.failed > 0 && (
                        <span className="text-destructive">✗ {bulkReplayProgress.failed}</span>
                      )}
                    </div>
                  </div>
                  {/* progress bar */}
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${(bulkReplayProgress.current / bulkReplayProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                {!bulkReplayProgress?.running ? (
                  <Button
                    className="flex-1 gap-1.5"
                    onClick={startBulkReplay}
                    disabled={bulkReplayTarget === 'url' && !bulkReplayUrl}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Lancer le replay
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    className="flex-1 gap-1.5"
                    onClick={() => { cancelRef.current = true }}
                  >
                    <Square className="h-3.5 w-3.5" />
                    Annuler
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── delete confirm dialogs ─────────────────────────── */}
        <AlertDialog open={confirmDelete === 'single'} onOpenChange={(o) => !o && setConfirmDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer ce webhook ?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (deleteSingleId) deleteMutation.mutate(deleteSingleId)
                  setConfirmDelete(null)
                }}
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={confirmDelete === 'bulk'} onOpenChange={(o) => !o && setConfirmDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer {checkedCount} webhook{checkedCount !== 1 ? 's' : ''} ?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  bulkDeleteMutation.mutate(Array.from(checkedIds))
                  setConfirmDelete(null)
                }}
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  )
}
