import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAuth } from '@/store/auth'

import AppLayout from '@/components/layout/AppLayout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Webhooks from '@/pages/Webhooks'
import Clients from '@/pages/Clients'
import Connections from '@/pages/Connections'
import AdminUsers from '@/pages/AdminUsers'
import SetupCli from '@/pages/SetupCli'

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
})

function AuthLoader({ children }: { children: React.ReactNode }) {
  const { token, user, fetchMe } = useAuth()

  useEffect(() => {
    if (token && !user) {
      fetchMe()
    }
  }, [token, user, fetchMe])

  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <BrowserRouter>
          <AuthLoader>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/webhooks" element={<Webhooks />} />
                <Route path="/clients" element={<Clients />} />
                <Route path="/connections" element={<Connections />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/setup-cli" element={<SetupCli />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthLoader>
        </BrowserRouter>
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
