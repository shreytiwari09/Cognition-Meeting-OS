import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import LandingPage       from './pages/LandingPage'
import Login             from './pages/Login'
import PMDashboard       from './pages/PMDashboard'
import EmployeeDashboard from './pages/EmployeeDashboard'
import ManagerDashboard  from './pages/ManagerDashboard'
import MeetingDetail     from './pages/MeetingDetail'

import ConnectExtension  from './pages/ConnectExtension'
import AppShell          from './components/AppShell'
import ErrorBoundary     from './components/ErrorBoundary'
import ScrollToTop       from './components/ScrollToTop'
import { PageMetaProvider } from './lib/pageMeta'
import NotFound          from './pages/NotFound'

const ROLE_HOME = { pm: '/pm', manager: '/pm', employee: '/employee' }

function ProtectedRoute({ children, allow }) {
  const { user, userProfile, loading } = useAuth()
  if (loading) return null
  if (!user || !userProfile) return <Navigate to="/login" replace />
  if (!userProfile.companyId || !userProfile.role) return <Navigate to="/login" replace />
  // The backend enforces roles too; this just keeps people on the right dashboard
  if (allow && !allow.includes(userProfile.role)) return <Navigate to={ROLE_HOME[userProfile.role] || '/login'} replace />
  return <PageMetaProvider><AppShell>{children}</AppShell></PageMetaProvider>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/"            element={<LandingPage />} />
      <Route path="/login"       element={<Login />} />
      <Route path="/pm"          element={<ProtectedRoute allow={['pm', 'manager']}><PMDashboard /></ProtectedRoute>} />
      <Route path="/employee"    element={<ProtectedRoute><EmployeeDashboard /></ProtectedRoute>} />
      <Route path="/manager"     element={<ProtectedRoute allow={['manager', 'pm']}><ManagerDashboard /></ProtectedRoute>} />
      <Route path="/meeting/:id" element={<ProtectedRoute><MeetingDetail /></ProtectedRoute>} />
      <Route path="/connect-extension" element={<ProtectedRoute allow={['pm', 'manager']}><ConnectExtension /></ProtectedRoute>} />
      <Route path="*"            element={<NotFound />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ScrollToTop />
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
