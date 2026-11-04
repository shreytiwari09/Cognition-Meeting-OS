import { createContext, useContext, useState, useCallback } from 'react'

const ToastCtx = createContext(null)

const CONFIG = {
  success: { icon: 'check_circle', color: '#15803d', bg: '#dcfce7' },
  error:   { icon: 'error',        color: '#dc2626', bg: '#fee2e2' },
  warning: { icon: 'warning',      color: '#b45309', bg: '#fef3c7' },
  info:    { icon: 'info',         color: '#b02f00', bg: '#ffdbd1' },
}

function ToastItem({ toast, onDismiss }) {
  const c = CONFIG[toast.type] || CONFIG.info
  return (
    <div className="anim-fade-up relative overflow-hidden flex items-center gap-3 bg-white rounded-2xl pl-3 pr-2 py-3 min-w-[280px] max-w-[400px]"
         style={{ boxShadow: '0 16px 40px -8px rgba(24,24,27,0.18), 0 0 0 1px rgba(0,0,0,0.04)' }}>
      <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: c.bg, color: c.color }}>
        <span className="icon icon-fill" style={{ fontSize: 18 }}>{c.icon}</span>
      </span>
      <span className="text-body-md text-ink flex-1">{toast.message}</span>
      <button onClick={() => onDismiss(toast.id)} className="w-7 h-7 rounded-full flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-container" aria-label="Dismiss">
        <span className="icon" style={{ fontSize: 16 }}>close</span>
      </button>
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-surface-container">
        <div className="h-full" style={{ background: c.color, animation: `toast-shrink ${toast.duration}ms linear forwards` }} />
      </div>
      <style>{`@keyframes toast-shrink { from { width: 100% } to { width: 0% } }`}</style>
    </div>
  )
}

function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null
  return (
    <div className="fixed top-20 right-4 sm:right-6 flex flex-col gap-2 z-[9999] pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto"><ToastItem toast={t} onDismiss={onDismiss} /></div>
      ))}
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type, duration }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration + 400)
  }, [])

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
