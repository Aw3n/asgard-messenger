import React from 'react'
import { Outlet } from 'react-router-dom'
import { TitleBar } from './TitleBar'
import { Sidebar } from './Sidebar'
import { ToastContainer } from '@/components/ui/Toast'

/**
 * AppShell — root layout.
 * TitleBar (38px, matches titleBarOverlay height) + Sidebar + main content.
 */
export const AppShell: React.FC = () => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
      background: '#0B0E1A',
    }}>
      {/* Titlebar — 38px matching Electron titleBarOverlay height */}
      <TitleBar />

      {/* App body */}
      <div style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
        minHeight: 0,
      }}>
        {/* Navigation sidebar */}
        <Sidebar />

        {/* Page content */}
        <main style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
          <Outlet />
        </main>
      </div>

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  )
}
