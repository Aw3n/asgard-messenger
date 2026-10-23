import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { i18nReady } from '@/i18n/config'
import '@/styles/globals.css'

/**
 * Asgard — Application Entry Point
 * Uses HashRouter for file:// protocol compatibility (Electron production builds).
 * Force redirect to /conversations on every fresh start (not on reload).
 */

// Force navigation to /conversations on app start
// This prevents the app from landing on whatever route was last visited
if (window.location.hash === '' || window.location.hash === '#/' || window.location.hash === '#') {
  window.location.hash = '#/conversations'
}

// La langue enregistrée arrive dans un chunk séparé : on attend sa résolution
// pour que le premier rendu ne montre pas de clés brutes.
i18nReady.finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>
  )
})
