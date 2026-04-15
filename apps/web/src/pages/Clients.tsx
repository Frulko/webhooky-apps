import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Plus, Copy, RotateCcw, Trash2, Loader2, Eye, EyeOff, Link, ShieldCheck, Globe } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

interface Client {
  id: string
  name: string
  description: string | null
  apiKey: string
  active: boolean
  createdAt: string
}

interface Endpoint {
  id: string
  clientId: string
  name: string
  token: string
  hmacHeader: string
  hasHmac: boolean
  active: boolean
  createdAt: string
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  function copy() {
    navigator.clipboard.writeText(value)
    toast.success(label ? `${label} copied!` : 'Copied!')
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={copy}>
          <Copy className="h-3 w-3" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Copy{label ? ` ${label}` : ''}</TooltipContent>
    </Tooltip>
  )
}

function EndpointRow({ endpoint, onDelete }: {
  endpoint: Endpoint
  onDelete: (id: string) => void
}) {
  const webhookUrl = `${window.location.origin}/hook/${endpoint.token}`
  return (
    <div className="group rounded-lg border bg-card p-3 space-y-2.5 transition-colors hover:bg-muted/30">
      {/* Name row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${endpoint.active ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
          <span className="font-medium text-sm truncate">{endpoint.name}</span>
          {endpoint.hasHmac && (
            <Tooltip>
              <TooltipTrigger>
                <ShieldCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              </TooltipTrigger>
              <TooltipContent>HMAC signature verification enabled</TooltipContent>
            </Tooltip>
          )}
          {!endpoint.active && (
            <Badge variant="secondary" className="text-xs">inactive</Badge>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(endpoint.createdAt), { addSuffix: true })}
          </span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete endpoint?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete <strong>{endpoint.name}</strong> and all its webhook history.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(endpoint.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Webhook URL */}
      <div className="flex items-center gap-1.5 text-xs font-mono bg-muted/60 rounded px-2.5 py-1.5">
        <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="truncate text-muted-foreground flex-1">{webhookUrl}</span>
        <CopyButton value={webhookUrl} label="URL" />
      </div>
    </div>
  )
}

function CreateEndpointDialog({ clientId, onCreated }: { clientId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [hmacSecret, setHmacSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => api.post(`/clients/${clientId}/endpoints`, {
      name,
      ...(hmacSecret ? { hmacSecret } : {}),
    }),
    onSuccess: () => {
      toast.success('Endpoint created')
      qc.invalidateQueries({ queryKey: ['endpoints', clientId] })
      onCreated()
      setOpen(false)
      setName('')
      setHmacSecret('')
    },
    onError: () => toast.error('Failed to create endpoint'),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add endpoint
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Endpoint</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              placeholder="Stripe webhooks"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name && mutation.mutate()}
            />
          </div>
          <div className="space-y-2">
            <Label>
              HMAC Secret{' '}
              <span className="text-muted-foreground text-xs font-normal">(optional)</span>
            </Label>
            <div className="relative">
              <Input
                type={showSecret ? 'text' : 'password'}
                placeholder="Leave empty to skip signature verification"
                value={hmacSecret}
                onChange={(e) => setHmacSecret(e.target.value)}
                className="pr-9"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 h-7 w-7"
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <Button
            className="w-full"
            disabled={!name || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create endpoint
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ClientCard({ client }: { client: Client }) {
  const [showKey, setShowKey] = useState(false)
  const qc = useQueryClient()

  const { data: endpoints, isLoading: loadingEndpoints } = useQuery({
    queryKey: ['endpoints', client.id],
    queryFn: () => api.get(`/clients/${client.id}/endpoints`).then((r) => r.data as Endpoint[]),
  })

  const rotateMutation = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/rotate-key`),
    onSuccess: () => {
      toast.success('API key rotated')
      qc.invalidateQueries({ queryKey: ['clients'] })
    },
    onError: () => toast.error('Failed to rotate key'),
  })

  const deleteEndpoint = useMutation({
    mutationFn: (endpointId: string) => api.delete(`/clients/${client.id}/endpoints/${endpointId}`),
    onSuccess: () => {
      toast.success('Endpoint deleted')
      qc.invalidateQueries({ queryKey: ['endpoints', client.id] })
    },
    onError: () => toast.error('Failed to delete endpoint'),
  })

  const deleteClient = useMutation({
    mutationFn: () => api.delete(`/clients/${client.id}`),
    onSuccess: () => {
      toast.success('Client deleted')
      qc.invalidateQueries({ queryKey: ['clients'] })
    },
    onError: () => toast.error('Failed to delete client'),
  })

  const endpointCount = endpoints?.length ?? 0

  return (
    <Card className="overflow-hidden">
      {/* Client header */}
      <div className="px-5 py-4 flex items-start gap-3">
        {/* Active indicator */}
        <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${client.active ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />

        <div className="flex-1 min-w-0 space-y-3">
          {/* Name + badges + delete */}
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-base">{client.name}</h3>
                {!client.active && (
                  <Badge variant="secondary" className="text-xs">disabled</Badge>
                )}
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  <Link className="h-3 w-3 mr-1" />
                  {loadingEndpoints ? '…' : endpointCount} endpoint{endpointCount !== 1 ? 's' : ''}
                </Badge>
              </div>
              {client.description && (
                <p className="text-sm text-muted-foreground mt-0.5">{client.description}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                Created {formatDistanceToNow(new Date(client.createdAt), { addSuffix: true })}
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete client?</AlertDialogTitle>
                  <AlertDialogDescription>
                    All endpoints and webhooks for <strong>{client.name}</strong> will be permanently deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteClient.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* API Key */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">API Key</p>
            <div className="flex items-center gap-1">
              <div className="flex items-center gap-1 text-xs font-mono bg-muted rounded px-2.5 py-1.5 flex-1 min-w-0">
                <span className="truncate select-all">{showKey ? client.apiKey : '•'.repeat(24)}</span>
                <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => setShowKey(!showKey)}>
                  {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
                <CopyButton value={client.apiKey} label="API key" />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => rotateMutation.mutate()}
                    disabled={rotateMutation.isPending}
                  >
                    <RotateCcw className={`h-3.5 w-3.5 ${rotateMutation.isPending ? 'animate-spin' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Rotate API key</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>

      {/* Endpoints section */}
      <div className="border-t bg-muted/20 px-5 py-4 space-y-2.5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Endpoints</p>
          <CreateEndpointDialog
            clientId={client.id}
            onCreated={() => qc.invalidateQueries({ queryKey: ['endpoints', client.id] })}
          />
        </div>

        {loadingEndpoints && (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {!loadingEndpoints && endpoints?.length === 0 && (
          <div className="text-center py-4 border border-dashed rounded-lg">
            <p className="text-sm text-muted-foreground">No endpoints yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add one to start receiving webhooks</p>
          </div>
        )}

        {endpoints?.map((ep) => (
          <EndpointRow
            key={ep.id}
            endpoint={ep}
            onDelete={(id) => deleteEndpoint.mutate(id)}
          />
        ))}
      </div>
    </Card>
  )
}

export default function Clients() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const qc = useQueryClient()

  const { data: clients, isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients').then((r) => r.data as Client[]),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/clients', { name, description: description || undefined }),
    onSuccess: () => {
      toast.success('Client created')
      qc.invalidateQueries({ queryKey: ['clients'] })
      setOpen(false)
      setName('')
      setDescription('')
    },
    onError: () => toast.error('Failed to create client'),
  })

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Clients</h1>
            <p className="text-muted-foreground text-sm">Manage clients and their webhook endpoints</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> New Client
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Client</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    placeholder="My local app"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && name && createMutation.mutate()}
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Description{' '}
                    <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                  </Label>
                  <Input
                    placeholder="What is this client for?"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={!name || createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                >
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create client
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-52 w-full" />)}
          </div>
        )}

        {!isLoading && clients?.length === 0 && (
          <Card>
            <CardContent className="text-center py-16 space-y-2">
              <p className="text-muted-foreground">No clients yet.</p>
              <p className="text-sm text-muted-foreground">
                Create a client, then add endpoints to start receiving webhooks.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {clients?.map((client) => <ClientCard key={client.id} client={client} />)}
        </div>
      </div>
    </TooltipProvider>
  )
}
