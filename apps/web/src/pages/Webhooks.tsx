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
import { RefreshCw, Eye, Loader2 } from 'lucide-react'
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

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    POST: 'bg-blue-500/10 text-blue-600',
    GET: 'bg-green-500/10 text-green-600',
    PUT: 'bg-yellow-500/10 text-yellow-700',
    PATCH: 'bg-orange-500/10 text-orange-600',
    DELETE: 'bg-red-500/10 text-red-600',
  }
  return (
    <Badge variant="outline" className={`text-xs font-mono ${colors[method] ?? ''}`}>
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

export default function Webhooks() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replayTarget, setReplayTarget] = useState<'ws' | 'url'>('ws')
  const [replayUrl, setReplayUrl] = useState('')
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

  function handleReplay() {
    if (!selectedId) return
    replayMutation.mutate({
      id: selectedId,
      target: replayTarget,
      url: replayTarget === 'url' ? replayUrl : undefined,
    })
  }

  const body = detail?.bodyParsed
    ? JSON.stringify(detail.bodyParsed, null, 2)
    : detail?.body ?? ''

  return (
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
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 cursor-pointer transition-colors"
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
                <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
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
                <TabsTrigger value="replay">Replay</TabsTrigger>
                <TabsTrigger value="history">History ({replays?.length ?? 0})</TabsTrigger>
              </TabsList>

              <TabsContent value="body" className="flex-1 min-h-0">
                <ScrollArea className="h-64 w-full border rounded-md">
                  <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-all">
                    {body || <span className="text-muted-foreground italic">empty body</span>}
                  </pre>
                </ScrollArea>
                <div className="mt-3 text-xs text-muted-foreground space-y-1">
                  <p>Received: {format(new Date(detail.receivedAt), 'PPpp')}</p>
                  <p>Source: {detail.sourceIp} · {detail.sizeBytes} bytes</p>
                </div>
              </TabsContent>

              <TabsContent value="headers" className="flex-1 min-h-0">
                <ScrollArea className="h-64 w-full border rounded-md">
                  <div className="p-4 space-y-1">
                    {Object.entries(detail.headers ?? {}).map(([k, v]) => (
                      <div key={k} className="flex gap-2 text-xs font-mono">
                        <span className="text-muted-foreground shrink-0">{k}:</span>
                        <span className="break-all">{v}</span>
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
  )
}
