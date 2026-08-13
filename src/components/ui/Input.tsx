import React from 'react'
import { cn } from '@/utils/cn'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  icon?: React.ReactNode
  iconRight?: React.ReactNode
  onClear?: () => void
}

/**
 * Asgard Input — styled form input with Fluent Design aesthetics.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, icon, iconRight, onClear, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-sm font-medium text-asgard-text-secondary">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <span className="absolute left-3 text-asgard-text-muted pointer-events-none">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            className={cn(
              'asgard-input w-full h-10 px-3 text-sm',
              !!icon && 'pl-9',
              (!!iconRight || !!onClear) && 'pr-9',
              error && 'border-red-500/50 focus:border-red-400',
              className
            )}
            {...props}
          />
          {(iconRight || (onClear && props.value)) && (
            <span
              className="absolute right-3 text-asgard-text-muted cursor-pointer hover:text-asgard-text-primary transition-colors"
              onClick={onClear}
            >
              {iconRight ?? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              )}
            </span>
          )}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {hint && !error && <p className="text-xs text-asgard-text-muted">{hint}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
