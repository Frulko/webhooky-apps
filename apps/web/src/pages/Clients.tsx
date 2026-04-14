import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
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
import { Plus, Copy, RotateCcw, Trash2, ChevronDown, ChevronRight, Loader2, Eye, EyeOff } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'

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

function CopyButton({ value }: { value: string }) {
  function copy() {
    navigator.clipboard.writeText(value)
    toast.success('Copied!')
  }
  return (
    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copy}>
      <Copy className="h-3 w-3" />
    </Button>
  )
}

function EndpointRow({ endpoint, onDelete }: { endpoint: Endpoint; onDelete: (id: string) => void }) {
  const webhookUrl = `${window.location.origin}/hook/${endpoint.token}`
  return (
    <div className="border rounded-md p-3 space-y-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate">{endpoint.name}</span>
          {!endpoint.active && <Badge variant="secondary" className="text-xs">disabled</Badge>}
          {endpoint.hasHmac && <Badge variant="outline" className="text-xs">HMAC</Badge>}
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete endpoint?</AlertDialogTitle>
              <AlertDialogDescription>This will delete all associated webhooks and history.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(endpoint.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono bg-muted rounded px-2 py-1">
        <span className="truncate">{webhookUrl}</span>
        <CopyButton value={webhookUrl} />
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
        <Button variant="outline" size="sm" className="h-7 text-xs">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add endpoint
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Endpoint</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input placeholder="Stripe webhooks" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>HMAC Secret <span className="text-muted-foreground text-xs">(optional)</span></Label>
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
            Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ClientCard({ client }: { client: Client }) {
  const [expanded, setExpanded] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const qc = useQueryClient()

  const { data: endpoints } = useQuery({
    queryKey: ['endpoints', client.id],
    queryFn: () => api.get(`/clients/${client.id}/endpoints`).then((r) => r.data as Endpoint[]),
    enabled: expanded,
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
    mutationFn: (endpointId: string) =>
      api.delete(`/clients/${client.id}/endpoints/${endpointId}`),
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              {client.name}
              {!client.active && <Badge variant="secondary" className="text-xs">disabled</Badge>}
            </CardTitle>
            {client.description && (
              <CardDescription className="mt-0.5">{client.description}</CardDescription>
            )}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete client?</AlertDialogTitle>
                <AlertDialogDescription>All endpoints and webhooks will be permanently deleted.</AlertDialogDescription>
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
        <div className="flex items-center gap-1 mt-2">
          <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground bg-muted rounded px-2 py-1 flex-1 min-w-0">
            <span className="truncate">{showKey ? client.apiKey : '•'.repeat(20)}</span>
            <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => setShowKey(!showKey)}>
              {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </Button>
            <CopyButton value={client.apiKey} />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => rotateMutation.mutate()}
            disabled={rotateMutation.isPending}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="pt-3 pb-3 space-y-3">
        <Button
          variant="ghost"
          className="w-full justify-between h-8 text-sm"
          onClick={() => setExpanded(!expanded)}
        >
          <span>Endpoints ({endpoints?.length ?? '…'})</span>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>

        {expanded && (
          <div className="space-y-2">
            {endpoints?.map((ep) => (
              <EndpointRow
                key={ep.id}
                endpoint={ep}
                onDelete={(id) => deleteEndpoint.mutate(id)}
              />
            ))}
            {endpoints?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">No endpoints yet</p>
            )}
            <CreateEndpointDialog
              clientId={client.id}
              onCreated={() => qc.invalidateQueries({ queryKey: ['endpoints', client.id] })}
            />
          </div>
        )}
      </CardContent>
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="text-muted-foreground text-sm">Manage clients and their webhook endpoints</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> New Client
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Client</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input placeholder="My local app" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input placeholder="What is this client for?" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <Button
                className="w-full"
                disabled={!name || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      )}

      {!isLoading && clients?.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground">No clients yet. Create one to start receiving webhooks.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {clients?.map((client) => <ClientCard key={client.id} client={client} />)}
      </div>
    </div>
  )
}
