import React from 'react'
import { motion } from 'framer-motion'

interface PageTransitionProps {
  children: React.ReactNode
}

/**
 * PageTransition — reusable animation wrapper for page transitions.
 * Provides smooth fade + slide animations when navigating between pages.
 */
export const PageTransition: React.FC<PageTransitionProps> = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}
  >
    {children}
  </motion.div>
)

/**
 * StaggerContainer — animates children with stagger effect.
 * Use for lists of items that should appear sequentially.
 */
export const StaggerContainer: React.FC<PageTransitionProps> = ({ children }) => (
  <motion.div
    initial="hidden"
    animate="visible"
    variants={{
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: {
          staggerChildren: 0.05,
          delayChildren: 0.1,
        },
      },
    }}
  >
    {children}
  </motion.div>
)

/**
 * StaggerItem — individual item for stagger animation.
 * Use inside StaggerContainer.
 */
export const StaggerItem: React.FC<PageTransitionProps> = ({ children }) => (
  <motion.div
    variants={{
      hidden: { opacity: 0, y: 10 },
      visible: {
        opacity: 1,
        y: 0,
        transition: {
          duration: 0.3,
          ease: [0.16, 1, 0.3, 1],
        },
      },
    }}
  >
    {children}
  </motion.div>
)
