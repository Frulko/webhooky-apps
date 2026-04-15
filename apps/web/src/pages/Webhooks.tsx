import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { RefreshCw, Eye, Loader2, Copy, Check, Terminal } from 'lucide-react'
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

function JsonHighlight({ value }: { value: string }) {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return <>{value}</>
  }

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
    }
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

export default function Webhooks() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replayTarget, setReplayTarget] = useState<'ws' | 'url'>('ws')
  const [replayUrl, setReplayUrl] = useState('')
  const [replayingId, setReplayingId] = useState<string | null>(null)
  const [curlTarget, setCurlTarget] = useState('http://localhost:3000/webhook')
  const qc = useQueryClient()

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => api.get('/webhooks?limit=100').then((r) => r.data as Webhook[]),
    refetchInterval: 8000,
  })

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['webhook', selectedId],
    queryFn: () => api.get(`/webhooks/${selectedId}`).then((r) => r.data as WebhookDetail),
    enabled: !!selectedId,
  })

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

  const replayMutation = useMutation({
    mutationFn: (vars: { id: string; target: string; url?: string }) =>
      api.post(`/webhooks/${vars.id}/replay`, { target: vars.target, url: vars.url }),
    onSuccess: (res) => {
      const d = res.data
      if (d.status === 'success') {
        toast.success(`Replayed — ${d.forwarded ?? 1} client(s) reached`)
      } else {
        toast.error(`Replay failed${d.errorMsg ? `: ${d.errorMsg}` : ''}`)
      }
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
      if (d.status === 'success') {
        toast.success(`Replayed to ${d.forwarded ?? 1} client(s)`)
      } else {
        toast.error(`Replay failed${d.errorMsg ? `: ${d.errorMsg}` : ''}`)
      }
      qc.invalidateQueries({ queryKey: ['replays', id] })
    },
    onError: () => toast.error('Replay failed'),
  })

  function handleReplay() {
    if (!selectedId) return
    replayMutation.mutate({
      id: selectedId,
      target: replayTarget,
      url: replayTarget === 'url' ? replayUrl : undefined,
    })
  }

  const parsedHeaders = detail
    ? typeof detail.headers === 'string'
      ? JSON.parse(detail.headers)
      : (detail.headers ?? {})
    : {}

  const rawBodyParsed = detail?.bodyParsed
    ? typeof detail.bodyParsed === 'string'
      ? JSON.parse(detail.bodyParsed)
      : detail.bodyParsed
    : null

  const body = rawBodyParsed
    ? JSON.stringify(rawBodyParsed, null, 2)
    : detail?.body ?? ''

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Webhooks</h1>
          <p className="text-muted-foreground text-sm">Received webhooks history</p>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {isLoading && Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-4">
                  <Skeleton className="h-5 w-14" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-24 ml-auto" />
                </div>
              ))}
              {!isLoading && webhooks?.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-10">
                  No webhooks received yet. Send a POST to <code>/hook/:token</code>
                </p>
              )}
              {webhooks?.map((wh) => (
                <div
                  key={wh.id}
                  className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/40 cursor-pointer transition-colors"
                  onClick={() => setSelectedId(wh.id)}
                >
                  <MethodBadge method={wh.method} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{wh.endpointName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {wh.clientName} · {wh.sourceIp}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(wh.receivedAt), { addSuffix: true })}
                    </p>
                    <p className="text-xs text-muted-foreground">{(wh.sizeBytes / 1024).toFixed(1)} KB</p>
                  </div>

                  {/* Quick replay button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation()
                          quickReplayMutation.mutate(wh.id)
                        }}
                        disabled={replayingId === wh.id}
                      >
                        {replayingId === wh.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <RefreshCw className="h-3.5 w-3.5" />
                        }
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p>Replay to WS clients</p>
                    </TooltipContent>
                  </Tooltip>

                  <Eye className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Detail dialog */}
        <Dialog open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {detail && <MethodBadge method={detail.method} />}
                <span className="truncate">{detail?.endpointName}</span>
              </DialogTitle>
            </DialogHeader>

            {loadingDetail ? (
              <div className="space-y-3 flex-1">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : detail && (
              <Tabs defaultValue="body" className="flex-1 flex flex-col min-h-0">
                <TabsList className="shrink-0">
                  <TabsTrigger value="body">Body</TabsTrigger>
                  <TabsTrigger value="headers">Headers</TabsTrigger>
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

                {/* ── curl tab ─────────────────────────────── */}
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
                      <CopyButton
                        text={detail ? buildCurl(detail, parsedHeaders, body, curlTarget) : ''}
                        label="Copy curl"
                      />
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

                {/* ── deliveries tab ───────────────────────── */}
                <TabsContent value="deliveries" className="flex-1 min-h-0">
                  <ScrollArea className="h-64">
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
                            {d.durationMs !== null && (
                              <span className="text-xs text-muted-foreground">{d.durationMs}ms</span>
                            )}
                            {d.sessionIp && (
                              <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {d.sessionIp}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto">
                              {formatDistanceToNow(new Date(d.forwardedAt), { addSuffix: true })}
                            </span>
                          </div>
                          {d.errorMsg && (
                            <p className="text-xs text-destructive font-mono break-all">{d.errorMsg}</p>
                          )}
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

                <TabsContent value="replay" className="space-y-4">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label>Target</Label>
                      <Select value={replayTarget} onValueChange={(v: string) => setReplayTarget(v as 'ws' | 'url')}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
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
                        : <><RefreshCw className="mr-2 h-4 w-4" /> Replay</>
                      }
                    </Button>
                  </div>
                </TabsContent>

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
      </div>
    </TooltipProvider>
  )
}
