import { Link, useLocation, Outlet, Navigate } from 'react-router-dom'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import {
  Webhook,
  LayoutDashboard,
  MonitorPlay,
  Plug2,
  Users,
  LogOut,
  ChevronUp,
  Terminal,
} from 'lucide-react'
import { useAuth } from '@/store/auth'
import { useNavigate } from 'react-router-dom'

const navMain = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Webhooks', url: '/webhooks', icon: Webhook },
  { title: 'Clients', url: '/clients', icon: Plug2 },
  { title: 'Connections', url: '/connections', icon: MonitorPlay },
  { title: 'Setup CLI', url: '/setup-cli', icon: Terminal },
]

const navAdmin = [
  { title: 'Users', url: '/admin/users', icon: Users },
]

export default function AppLayout() {
  const { user, isLoading, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar>
          <SidebarHeader className="px-4 py-4">
            <div className="flex items-center gap-2">
              <Webhook className="h-6 w-6 text-primary" />
              <span className="font-semibold text-base">WebhookCatcher</span>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navMain.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={location.pathname === item.url || (item.url !== '/' && location.pathname.startsWith(item.url))}
                      >
                        <Link to={item.url}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {user.role === 'admin' && (
              <SidebarGroup>
                <SidebarGroupLabel>Administration</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navAdmin.map((item) => (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton
                          asChild
                          isActive={location.pathname.startsWith(item.url)}
                        >
                          <Link to={item.url}>
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>

          <SidebarFooter>
            <Separator />
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton className="h-10">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {user.email.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col items-start text-left overflow-hidden">
                        <span className="text-sm font-medium truncate w-full">{user.email}</span>
                        <span className="text-xs text-muted-foreground capitalize">{user.role}</span>
                      </div>
                      <ChevronUp className="ml-auto h-4 w-4" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="start" className="w-56">
                    <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                      <LogOut className="mr-2 h-4 w-4" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex h-12 items-center gap-2 border-b px-4">
            <SidebarTrigger />
          </header>
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
