import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/utils/cn'
import { Button } from './Button'
import type { UserStatus } from '@/types'

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
type AvatarRingColor = 'default' | 'gradient' | 'online' | 'busy' | 'away'
type BadgeType = 'verified' | 'bot' | 'admin' | 'premium' | null

interface AvatarProps {
  src?: string
  name?: string
  publicKey?: string
  size?: AvatarSize
  status?: UserStatus
  showStatus?: boolean
  className?: string
  onClick?: () => void
  onUpload?: (dataUrl: string) => void
  editable?: boolean
  lazy?: boolean
  /** Ring around avatar (like Instagram stories) */
  ring?: AvatarRingColor
  /** Badge overlay (verified, bot, etc.) */
  badge?: BadgeType
  /** Whether the ring has been viewed (for stories) */
  ringViewed?: boolean
}

const sizes: Record<AvatarSize, { container: string; text: string; status: string }> = {
  xs:  { container: 'w-6 h-6',    text: 'text-xxs',  status: 'w-2 h-2 bottom-0 right-0 border' },
  sm:  { container: 'w-8 h-8',    text: 'text-xs',   status: 'w-2.5 h-2.5 bottom-0 right-0 border' },
  md:  { container: 'w-10 h-10',  text: 'text-sm',   status: 'w-3 h-3 bottom-0 right-0 border-2' },
  lg:  { container: 'w-12 h-12',  text: 'text-base', status: 'w-3.5 h-3.5 bottom-0 right-0 border-2' },
  xl:  { container: 'w-20 h-20',  text: 'text-2xl',  status: 'w-5 h-5 bottom-0.5 right-0.5 border-2' },
  '2xl': { container: 'w-28 h-28', text: 'text-4xl', status: 'w-6 h-6 bottom-1 right-1 border-2' },
}

const statusColors: Record<UserStatus, string> = {
  online: 'status-online',
  away: 'status-away',
  busy: 'status-busy',
  offline: 'status-offline',
  invisible: 'status-offline',
  dnd: 'status-busy',
}

const ringColors: Record<AvatarRingColor, string> = {
  default: 'ring-asgard-border',
  gradient: 'ring-gradient-story',
  online: 'ring-green-500',
  busy: 'ring-red-500',
  away: 'ring-yellow-500',
}

const badgeIcons: Record<NonNullable<BadgeType>, string> = {
  verified: '✓',
  bot: '🤖',
  admin: '★',
  premium: '◆',
}

const badgeColors: Record<NonNullable<BadgeType>, string> = {
  verified: 'bg-blue-500 text-white',
  bot: 'bg-gray-600 text-white',
  admin: 'bg-yellow-500 text-black',
  premium: 'bg-purple-500 text-white',
}

/**
 * Generates a deterministic gradient background from a string (name or public key).
 */
function getAvatarGradient(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  const gradients = [
    'from-blue-600 to-cyan-500',
    'from-indigo-600 to-blue-400',
    'from-violet-600 to-indigo-400',
    'from-cyan-600 to-teal-400',
    'from-blue-700 to-indigo-500',
    'from-sky-600 to-blue-400',
    'from-teal-600 to-cyan-400',
    'from-purple-600 to-blue-400',
  ]
  return gradients[Math.abs(hash) % gradients.length]
}

function getInitials(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

/**
 * Compress an image file to WebP format for efficient P2P transmission.
 * OPTIMIZATION: WebP is ~30% smaller than JPEG at equivalent quality.
 */
export async function compressAvatarToWebP(
  file: File,
  maxSize = 256,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let { width, height } = img
      // Scale down to fit within maxSize
      if (width > height) {
        if (width > maxSize) { height = height * (maxSize / width); width = maxSize }
      } else {
        if (height > maxSize) { width = width * (maxSize / height); height = maxSize }
      }
      canvas.width = Math.round(width)
      canvas.height = Math.round(height)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      // Use WebP for better compression (~30% smaller than JPEG)
      const compressed = canvas.toDataURL('image/webp', quality)
      resolve(compressed)
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    const reader = new FileReader()
    reader.onload = (e) => { img.src = e.target?.result as string }
    reader.readAsDataURL(file)
  })
}

/**
 * Asgard Avatar — displays user avatar with status indicator.
 * Falls back to initials with deterministic gradient if no image.
 * OPTIMIZATION: Supports lazy loading and WebP compression.
 */
export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  publicKey,
  size = 'md',
  status,
  showStatus = false,
  className,
  onClick,
  onUpload,
  editable = false,
  lazy = true,
  ring,
  badge,
  ringViewed = false,
}) => {
  const { t } = useTranslation()
  const sizeConfig = sizes[size]
  const seed = publicKey ?? name ?? 'default'
  const gradient = getAvatarGradient(seed)
  const initials = getInitials(name)
  const [isVisible, setIsVisible] = useState(!lazy)
  const [imgError, setImgError] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Lazy loading with IntersectionObserver
  useEffect(() => {
    if (!lazy || isVisible) return
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.disconnect() } },
      { rootMargin: '100px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [lazy, isVisible])

  const handleUploadClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onUpload) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/jpeg,image/png,image/webp'
    input.onchange = async (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0]
      if (!file) return
      if (file.size > 10 * 1024 * 1024) return // 10MB max
      try {
        // OPTIMIZATION: Compress to WebP for efficient P2P transmission
        const compressed = await compressAvatarToWebP(file)
        onUpload(compressed)
      } catch {
        // Fallback to raw read if compression fails
        const reader = new FileReader()
        reader.onload = () => {
          if (typeof reader.result === 'string') onUpload(reader.result)
        }
        reader.readAsDataURL(file)
      }
    }
    input.click()
  }

  const showImage = isVisible && src && !imgError

  // Ring classes
  const ringClass = ring
    ? `ring-2 ${ringViewed ? 'ring-asgard-border/50' : ringColors[ring]}`
    : ''

  return (
    <div
      ref={containerRef}
      className={cn('relative flex-shrink-0', className)}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <div
        className={cn(
          'rounded-full overflow-hidden flex items-center justify-center select-none',
          sizeConfig.container,
          !showImage && `bg-gradient-to-br ${gradient}`,
          ringClass,
          onClick && 'cursor-pointer hover:ring-asgard-glacier/30 transition-all'
        )}
      >
        {showImage ? (
          <img
            src={src}
            alt={name ?? 'Avatar'}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className={cn('font-semibold text-white', sizeConfig.text)}>
            {initials}
          </span>
        )}
      </div>

      {/* Status indicator */}
      {showStatus && status && (
        <span
          className={cn(
            'absolute rounded-full border-asgard-surface',
            sizeConfig.status,
            statusColors[status]
          )}
        />
      )}

      {/* Badge overlay */}
      {badge && (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center border-2 border-asgard-surface',
            size === 'xs' || size === 'sm' ? 'w-3 h-3 text-[8px]' : 'w-4 h-4 text-[10px]',
            badgeColors[badge]
          )}
        >
          {badgeIcons[badge]}
        </span>
      )}

      {/* Upload overlay */}
      {editable && (
        <button
          onClick={handleUploadClick}
          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity rounded-full"
          aria-label={t('avatar.uploadPhoto')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M19 7v2.99s-1.99.01-2 0V7h-3s.01-1.99 0-2h3V2h2v3h3v2h-3zm-3 4V8h-3V5H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-8h-3zM5 19l3-4 2 3 3-4 4 5H5z"/>
          </svg>
        </button>
      )}
    </div>
  )
}

// ─── AvatarGroup Component ────────────────────────────────────────────────────

interface AvatarGroupProps {
  members: {
    src?: string
    name?: string
    publicKey?: string
  }[]
  size?: AvatarSize
  max?: number
  className?: string
}

/**
 * AvatarGroup — displays stacked avatars for group conversations.
 * Shows up to `max` avatars with a "+N" counter for overflow.
 */
export const AvatarGroup: React.FC<AvatarGroupProps> = ({
  members,
  size = 'md',
  max = 4,
  className,
}) => {
  const visibleMembers = members.slice(0, max)
  const overflowCount = members.length - max

  return (
    <div className={cn('flex items-center', className)}>
      {visibleMembers.map((member, index) => (
        <div
          key={member.publicKey ?? member.name ?? index}
          className="-ml-2 first:ml-0 ring-2 ring-asgard-surface rounded-full"
        >
          <Avatar
            src={member.src}
            name={member.name}
            publicKey={member.publicKey}
            size={size}
          />
        </div>
      ))}
      {overflowCount > 0 && (
        <div className={cn(
          '-ml-2 ring-2 ring-asgard-surface rounded-full flex items-center justify-center',
          'bg-asgard-surface text-asgard-text-secondary font-medium',
          sizes[size].container,
          sizes[size].text
        )}>
          +{overflowCount}
        </div>
      )}
    </div>
  )
}

// ─── AvatarCropDialog Component ───────────────────────────────────────────────

interface AvatarCropDialogProps {
  imageSrc: string
  onCrop: (croppedDataUrl: string) => void
  onClose: () => void
}

/**
 * AvatarCropDialog — allows users to crop and resize their avatar.
 * Uses Canvas API for client-side cropping.
 */
export const AvatarCropDialog: React.FC<AvatarCropDialogProps> = ({
  imageSrc,
  onCrop,
  onClose,
}) => {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0, size: 200 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Fit image to canvas (max 400x400)
      const maxDim = 400
      let { width, height } = img
      if (width > height) {
        if (width > maxDim) { height = height * (maxDim / width); width = maxDim }
      } else {
        if (height > maxDim) { width = width * (maxDim / height); height = maxDim }
      }
      canvas.width = width
      canvas.height = height
      setImgSize({ width, height })
      setCrop({ x: 0, y: 0, size: Math.min(width, height) })
      ctx.drawImage(img, 0, 0, width, height)
    }
    img.src = imageSrc
  }, [imageSrc])

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - crop.x, y: e.clientY - crop.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    const newX = e.clientX - dragStart.x
    const newY = e.clientY - dragStart.y
    setCrop((c) => ({
      ...c,
      x: Math.max(0, Math.min(imgSize.width - c.size, newX)),
      y: Math.max(0, Math.min(imgSize.height - c.size, newY)),
    }))
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleSizeChange = (newSize: number) => {
    setCrop((c) => ({
      ...c,
      size: Math.max(50, Math.min(Math.min(imgSize.width, imgSize.height), newSize)),
    }))
  }

  const handleCrop = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Create output canvas with cropped region
    const outputCanvas = document.createElement('canvas')
    outputCanvas.width = 256
    outputCanvas.height = 256
    const outputCtx = outputCanvas.getContext('2d')
    if (!outputCtx) return

    // Draw cropped region scaled to 256x256
    outputCtx.drawImage(
      canvas,
      crop.x,
      crop.y,
      crop.size,
      crop.size,
      0,
      0,
      256,
      256
    )

    const croppedDataUrl = outputCanvas.toDataURL('image/webp', 0.85)
    onCrop(croppedDataUrl)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-asgard-surface rounded-2xl p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-asgard-text-primary mb-4">
          {t('avatar.cropAvatar')}
        </h3>

        <div className="relative mb-4 overflow-hidden rounded-lg">
          <canvas
            ref={canvasRef}
            className="w-full cursor-move"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          {/* Crop overlay */}
          <div
            className="absolute border-2 border-white pointer-events-none"
            style={{
              left: crop.x,
              top: crop.y,
              width: crop.size,
              height: crop.size,
            }}
          />
        </div>

        {/* Size slider */}
        <div className="mb-4">
          <label className="text-sm text-asgard-text-secondary block mb-2">
            {t('avatar.size')}
          </label>
          <input
            type="range"
            min={50}
            max={Math.min(imgSize.width, imgSize.height)}
            value={crop.size}
            onChange={(e) => handleSizeChange(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            {t('common.cancel')}
          </Button>
          <Button onClick={handleCrop} className="flex-1">
            {t('avatar.cropSave')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── GroupAvatar Component ────────────────────────────────────────────────────

interface GroupAvatarProps {
  /** Group name for generating initials */
  name?: string
  /** Custom image for the group */
  src?: string
  /** Size of the avatar */
  size?: AvatarSize
  /** Member avatars to display in grid */
  memberAvatars?: {
    src?: string
    name?: string
    publicKey?: string
  }[]
  className?: string
}

/**
 * GroupAvatar — displays a group avatar with member avatars in a grid.
 * If no member avatars, falls back to initials with gradient.
 */
export const GroupAvatar: React.FC<GroupAvatarProps> = ({
  name,
  src,
  size = 'md',
  memberAvatars = [],
  className,
}) => {
  const sizeConfig = sizes[size]
  const initials = getInitials(name)
  const seed = name ?? 'group'
  const gradient = getAvatarGradient(seed)

  // If we have a custom image, use it
  if (src) {
    return (
      <div className={cn('relative flex-shrink-0', className)}>
        <div
          className={cn(
            'rounded-xl overflow-hidden flex items-center justify-center select-none',
            sizeConfig.container
          )}
        >
          <img
            src={src}
            alt={name ?? 'Group'}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>
    )
  }

  // If we have member avatars, create a grid
  if (memberAvatars.length > 0) {
    const displayMembers = memberAvatars.slice(0, 4)
    const gridClass = displayMembers.length === 1
      ? 'grid-cols-1'
      : displayMembers.length === 2
      ? 'grid-cols-2'
      : displayMembers.length <= 4
      ? 'grid-cols-2'
      : 'grid-cols-3'

    return (
      <div className={cn('relative flex-shrink-0', className)}>
        <div
          className={cn(
            'rounded-xl overflow-hidden bg-gradient-to-br p-0.5',
            sizeConfig.container,
            gradient
          )}
        >
          <div className={cn('grid w-full h-full gap-0.5', gridClass)}>
            {displayMembers.map((member, index) => (
              <div
                key={member.publicKey ?? member.name ?? index}
                className="bg-asgard-surface rounded-sm overflow-hidden flex items-center justify-center"
              >
                {member.src ? (
                  <img
                    src={member.src}
                    alt={member.name ?? 'Member'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="text-white text-[8px] font-semibold">
                    {getInitials(member.name).charAt(0)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Fallback to initials
  return (
    <div className={cn('relative flex-shrink-0', className)}>
      <div
        className={cn(
          'rounded-xl overflow-hidden flex items-center justify-center select-none bg-gradient-to-br',
          sizeConfig.container,
          gradient
        )}
      >
        <span className={cn('font-semibold text-white', sizeConfig.text)}>
          {initials}
        </span>
      </div>
    </div>
  )
}
