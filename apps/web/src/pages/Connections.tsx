import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { MonitorPlay, WifiOff } from 'lucide-react'
import api from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

interface Connection {
  id: string
  endpointId: string
  endpointName: string
  endpointToken: string
  clientId: string
  clientName: string
  ip: string
  connectedAt: string
}

export default function Connections() {
  const qc = useQueryClient()

  const { data: connections, isLoading } = useQuery({
    queryKey: ['connections'],
    queryFn: () => api.get('/connections').then((r) => r.data as Connection[]),
    refetchInterval: 5000,
  })

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/connections/${id}`),
    onSuccess: () => {
      toast.success('Session disconnected')
      qc.invalidateQueries({ queryKey: ['connections'] })
    },
    onError: () => toast.error('Failed to disconnect'),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Active Connections</h1>
          <p className="text-muted-foreground text-sm">Live WebSocket sessions from local clients</p>
        </div>
        <Badge variant="secondary" className="text-sm px-3 py-1">
          {connections?.length ?? 0} live
        </Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-4">
                <Skeleton className="h-2 w-2 rounded-full" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}

            {!isLoading && connections?.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <MonitorPlay className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">No active connections</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Run <code className="bg-muted px-1 rounded">hooky connect</code> to start forwarding webhooks
                  </p>
                </div>
              </div>
            )}

            {connections?.map((conn) => (
              <div key={conn.id} className="group flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
                {/* Live indicator */}
                <div className="relative shrink-0">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <div className="absolute inset-0 h-2 w-2 rounded-full bg-green-500 animate-ping opacity-75" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{conn.endpointName}</span>
                    <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0 font-mono">
                      {conn.endpointToken.slice(0, 8)}…
                    </code>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {conn.clientName} · <span className="font-mono">{conn.ip}</span>
                  </p>
                </div>

                {/* Time + disconnect */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-xs font-medium text-green-600 dark:text-green-400">connected</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(conn.connectedAt), { addSuffix: true })}
                    </p>
                  </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      >
                        <WifiOff className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect session?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will mark the session from <strong>{conn.ip}</strong> as disconnected.
                          The CLI will reconnect automatically if still running.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => disconnectMutation.mutate(conn.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Disconnect
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
