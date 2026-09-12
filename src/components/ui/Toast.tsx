import React from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/utils/cn'
import type { Toast as ToastType } from '@/types'

const icons: Record<ToastType['type'], React.ReactNode> = {
  info: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
    </svg>
  ),
  success: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-online">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
    </svg>
  ),
  warning: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-yellow-400">
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
    </svg>
  ),
  error: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-red-400">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
    </svg>
  ),
}

const borderColors: Record<ToastType['type'], string> = {
  info: 'border-asgard-glacier/30',
  success: 'border-asgard-online/30',
  warning: 'border-yellow-400/30',
  error: 'border-red-400/30',
}

/**
 * Toast notification item
 */
const ToastItem: React.FC<{ toast: ToastType }> = ({ toast }) => {
  const removeToast = useUIStore((s) => s.removeToast)
  const { t } = useTranslation()

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn(
        'flex items-start gap-3 px-4 py-3',
        'mica-card rounded-xl border shadow-modal',
        'min-w-72 max-w-96',
        borderColors[toast.type]
      )}
    >
      <span className="flex-shrink-0 mt-0.5">{icons[toast.type]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-asgard-text-primary">{toast.title}</p>
        {toast.message && (
          <p className="text-xs text-asgard-text-secondary mt-0.5">{toast.message}</p>
        )}
        {toast.action && (
          <button
            className="text-xs text-asgard-glacier hover:underline mt-1"
            onClick={toast.action.onClick}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={() => removeToast(toast.id)}
        className="flex-shrink-0 text-asgard-text-muted hover:text-asgard-text-primary transition-colors"
        aria-label={t('toast.dismiss')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
    </motion.div>
  )
}

/**
 * Toast container — renders all active toasts in the bottom-right corner.
 */
export const ToastContainer: React.FC = () => {
  const toasts = useUIStore((s) => s.toasts)

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  )
}
