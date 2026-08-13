import React from 'react'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

/**
 * ErrorBoundary — catches React rendering errors and prevents the whole app
 * from crashing to a blank screen. Logs the error so it can be diagnosed.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] React render error:', error)
    if (info?.componentStack) {
      console.error('[ErrorBoundary] Component stack:', info.componentStack)
    }
    try {
      window.asgard?.debugLog?.('[ErrorBoundary] ' + error.message + (info?.componentStack ? '\n' + info.componentStack : ''))
    } catch {
      // ignore logging failures
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-asgard-deep text-asgard-text-primary p-8">
          <div className="w-16 h-16 rounded-2xl bg-asgard-busy/15 flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-busy">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
          <p className="text-sm text-asgard-text-secondary text-center max-w-sm mb-4">
            The interface crashed while rendering. Please reload the app or open the developer console for details.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm rounded-lg bg-asgard-glacier text-asgard-deep-black font-medium hover:bg-asgard-glacier/90 transition-colors"
            >
              Reload app
            </button>
            <button
              onClick={() => this.setState({ hasError: false, error: undefined })}
              className="px-4 py-2 text-sm rounded-lg text-asgard-text-secondary hover:bg-asgard-surface-alt transition-colors"
            >
              Try again
            </button>
          </div>
          {this.state.error && (
            <pre className="mt-4 text-xs text-asgard-text-muted bg-asgard-surface p-3 rounded-lg max-w-lg overflow-auto">
              {this.state.error.message}
            </pre>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
