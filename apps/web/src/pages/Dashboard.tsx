import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Webhook, Plug2, MonitorPlay, Activity } from 'lucide-react'
import api from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'

export default function Dashboard() {
  const { data: webhooks, isLoading: loadingWh } = useQuery({
    queryKey: ['webhooks', 'recent'],
    queryFn: () => api.get('/webhooks?limit=5').then((r) => r.data),
    refetchInterval: 10000,
  })

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients').then((r) => r.data),
  })

  const { data: connections, isLoading: loadingCo } = useQuery({
    queryKey: ['connections'],
    queryFn: () => api.get('/connections').then((r) => r.data),
    refetchInterval: 5000,
  })

  const stats = [
    {
      label: 'Active Connections',
      value: connections?.length ?? 0,
      icon: MonitorPlay,
      color: 'text-green-500',
    },
    {
      label: 'Clients',
      value: clients?.length ?? 0,
      icon: Plug2,
      color: 'text-blue-500',
    },
    {
      label: 'Recent Webhooks',
      value: webhooks?.length ?? 0,
      icon: Webhook,
      color: 'text-violet-500',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Overview of your webhook activity</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Webhooks */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Recent Webhooks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingWh && Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
            {!loadingWh && webhooks?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No webhooks received yet</p>
            )}
            {webhooks?.map((wh: {
              id: string
              method: string
              endpoint_name: string
              client_name: string
              source_ip: string
              size_bytes: number
              received_at: string
            }) => (
              <div key={wh.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="text-xs shrink-0">{wh.method}</Badge>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{wh.endpoint_name}</p>
                    <p className="text-muted-foreground text-xs truncate">{wh.client_name}</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">
                  {formatDistanceToNow(new Date(wh.received_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Active Connections */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MonitorPlay className="h-4 w-4" />
              Active Connections
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingCo && Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
            {!loadingCo && connections?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No active connections</p>
            )}
            {connections?.map((conn: {
              id: string
              endpoint_name: string
              client_name: string
              endpoint_token: string
              ip: string
              connected_at: string
            }) => (
              <div key={conn.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{conn.endpoint_name}</p>
                  <p className="text-muted-foreground text-xs truncate">{conn.client_name} · {conn.ip}</p>
                </div>
                <Badge variant="secondary" className="text-xs shrink-0 ml-2 bg-green-500/10 text-green-600">
                  live
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
