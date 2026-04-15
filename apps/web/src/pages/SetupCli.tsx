import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Copy, Check, Terminal, Plug2, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'

const serverUrl = window.location.origin

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    toast.success('Copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group rounded-md bg-muted border text-sm font-mono">
      <pre className="px-4 py-3 overflow-x-auto whitespace-pre-wrap break-all pr-10">{code}</pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={copy}
      >
        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  )
}

interface StepProps {
  number: number
  title: string
  children: React.ReactNode
}

function Step({ number, title, children }: StepProps) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 flex items-start pt-0.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
          {number}
        </div>
      </div>
      <div className="flex-1 space-y-3 pb-8">
        <h3 className="font-semibold text-base leading-7">{title}</h3>
        {children}
      </div>
    </div>
  )
}

export default function SetupCli() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">CLI Setup</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Connect your local environment to this server in a few steps.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Getting started</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="divide-y">

            {/* Step 1 */}
            <Step number={1} title="Install the CLI">
              <p className="text-sm text-muted-foreground">
                Install <Badge variant="secondary" className="font-mono text-xs">webhooky</Badge> globally via npm.
              </p>
              <CodeBlock code="npm install -g webhooky" />
            </Step>

            <Separator className="my-0" />

            {/* Step 2 */}
            <div className="pt-8">
              <Step number={2} title="Create a client & endpoint">
                <p className="text-sm text-muted-foreground">
                  Go to the{' '}
                  <Link to="/clients" className="underline underline-offset-2 hover:text-foreground transition-colors">
                    Clients page
                  </Link>{' '}
                  and create a client, then add an endpoint under it. You'll need the{' '}
                  <span className="font-medium">API key</span> and the{' '}
                  <span className="font-medium">endpoint token</span> in the next step.
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/clients">
                    <Plug2 className="h-3.5 w-3.5 mr-2" />
                    Open Clients
                    <ArrowRight className="h-3.5 w-3.5 ml-2" />
                  </Link>
                </Button>
              </Step>
            </div>

            <Separator className="my-0" />

            {/* Step 3 */}
            <div className="pt-8">
              <Step number={3} title="Run the setup wizard">
                <p className="text-sm text-muted-foreground">
                  Run <code className="bg-muted px-1 rounded text-xs font-mono">hooky init</code> and follow the prompts.
                  The server URL is pre-filled for you below.
                </p>
                <CodeBlock code="hooky init" />
                <div className="rounded-md border bg-muted/40 p-3 space-y-1.5 text-sm">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-28 shrink-0">Server URL</span>
                    <code className="font-mono text-xs break-all">{serverUrl}</code>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-28 shrink-0">Email</span>
                    <span className="text-xs text-muted-foreground">your account email</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-28 shrink-0">Password</span>
                    <span className="text-xs text-muted-foreground">never stored on disk</span>
                  </div>
                </div>
              </Step>
            </div>

            <Separator className="my-0" />

            {/* Step 4 */}
            <div className="pt-8">
              <Step number={4} title="Start listening">
                <p className="text-sm text-muted-foreground">
                  Connect and forward incoming webhooks to your local server.
                </p>
                <CodeBlock code={`hooky connect --forward http://localhost:8080/webhook`} />
                <p className="text-xs text-muted-foreground">
                  Replace <code className="bg-muted px-1 rounded font-mono">http://localhost:8080/webhook</code> with your actual local endpoint.
                  If you ran <code className="bg-muted px-1 rounded font-mono">hooky init</code>, the forward URL is already saved in config — just run{' '}
                  <code className="bg-muted px-1 rounded font-mono">hooky connect</code>.
                </p>
              </Step>
            </div>

            <Separator className="my-0" />

            {/* Step 5 */}
            <div className="pt-8">
              <Step number={5} title="Verify the connection">
                <p className="text-sm text-muted-foreground">
                  Check your connection status and configuration at any time.
                </p>
                <CodeBlock code="hooky status" />
                <p className="text-xs text-muted-foreground">
                  Active connections appear on the{' '}
                  <Link to="/connections" className="underline underline-offset-2 hover:text-foreground transition-colors">
                    Connections page
                  </Link>.
                </p>
              </Step>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Quick reference */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Quick reference</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { cmd: 'hooky init', desc: 'Interactive setup wizard' },
              { cmd: 'hooky connect', desc: 'Start forwarding webhooks locally' },
              { cmd: 'hooky replay --id <id>', desc: 'Replay a past webhook' },
              { cmd: 'hooky status', desc: 'Show config & connection state' },
              { cmd: 'hooky login', desc: 'Re-authenticate (keep config)' },
              { cmd: 'hooky logout', desc: 'Clear saved credentials' },
            ].map(({ cmd, desc }) => (
              <div key={cmd} className="flex items-center gap-3 text-sm">
                <code className="bg-muted px-2 py-0.5 rounded font-mono text-xs w-52 shrink-0">{cmd}</code>
                <span className="text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
