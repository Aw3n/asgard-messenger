import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: React.ReactNode
  iconRight?: React.ReactNode
  fullWidth?: boolean
  children?: React.ReactNode
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-gradient-to-br from-asgard-nordic to-asgard-nordic-light text-white hover:from-asgard-nordic-light hover:to-blue-500 shadow-md hover:shadow-asgard-nordic/40',
  secondary: 'bg-asgard-surface-alt border border-asgard-border text-asgard-text-primary hover:bg-asgard-border hover:border-asgard-border-alt',
  ghost: 'bg-transparent text-asgard-text-secondary hover:bg-asgard-surface-alt hover:text-asgard-text-primary',
  danger: 'bg-gradient-to-br from-red-700 to-red-600 text-white hover:from-red-600 hover:to-red-500',
  success: 'bg-gradient-to-br from-green-700 to-green-600 text-white hover:from-green-600 hover:to-green-500',
}

const sizes: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-xs rounded-md gap-1',
  sm: 'h-8 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-6 text-base rounded-xl gap-2.5',
}

/**
 * Asgard Button — primary interactive element with Fluent Design aesthetics.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      iconRight,
      fullWidth = false,
      children,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading

    return (
      <motion.button
        ref={ref}
        whileTap={isDisabled ? undefined : { scale: 0.97 }}
        className={cn(
          'inline-flex items-center justify-center font-medium',
          'transition-all duration-150 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asgard-glacier/50',
          'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
          variants[variant],
          sizes[size],
          fullWidth && 'w-full',
          className
        )}
        disabled={isDisabled}
        {...(props as any)}
      >
        {loading ? (
          <LoadingSpinner size={size} />
        ) : (
          icon && <span className="flex-shrink-0">{icon}</span>
        )}
        {children}
        {!loading && iconRight && <span className="flex-shrink-0">{iconRight}</span>}
      </motion.button>
    )
  }
)

Button.displayName = 'Button'

function LoadingSpinner({ size }: { size: ButtonSize }) {
  const spinnerSize = { xs: 10, sm: 12, md: 14, lg: 16 }[size]
  return (
    <svg
      width={spinnerSize}
      height={spinnerSize}
      viewBox="0 0 24 24"
      className="animate-spin"
      fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="32" strokeDashoffset="8" />
    </svg>
  )
}
