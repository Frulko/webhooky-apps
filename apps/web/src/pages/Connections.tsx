import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { MonitorPlay } from 'lucide-react'
import api from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'

interface Connection {
  id: string
  endpoint_id: string
  endpoint_name: string
  endpoint_token: string
  client_id: string
  client_name: string
  ip: string
  connected_at: string
}

export default function Connections() {
  const { data: connections, isLoading } = useQuery({
    queryKey: ['connections'],
    queryFn: () => api.get('/connections').then((r) => r.data as Connection[]),
    refetchInterval: 5000,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Active Connections</h1>
          <p className="text-muted-foreground text-sm">Live WebSocket sessions from local clients</p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {connections?.length ?? 0} live
        </Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-4">
                <Skeleton className="h-8 w-8 rounded-full" />
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
                    Run <code className="bg-muted px-1 rounded">npx webhook-catcher connect --token &lt;token&gt;</code> to connect
                  </p>
                </div>
              </div>
            )}

            {connections?.map((conn) => (
              <div key={conn.id} className="flex items-center gap-4 px-4 py-3">
                <div className="h-2 w-2 rounded-full bg-green-500 shrink-0 animate-pulse" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{conn.endpoint_name}</span>
                    <code className="text-xs text-muted-foreground bg-muted px-1 rounded shrink-0">
                      {conn.endpoint_token.slice(0, 8)}…
                    </code>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {conn.client_name} · {conn.ip}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground shrink-0 text-right">
                  <p>connected</p>
                  <p>{formatDistanceToNow(new Date(conn.connected_at), { addSuffix: true })}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
