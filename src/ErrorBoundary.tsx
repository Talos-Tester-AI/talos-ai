import React from 'react'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', backgroundColor: '#fee', border: '2px solid red' }}>
          <h1 style={{ color: 'red', fontSize: '24px' }}>Something went wrong</h1>
          <pre style={{ backgroundColor: '#fff', padding: '10px', overflow: 'auto' }}>
            {this.state.error?.toString()}
          </pre>
          <pre style={{ backgroundColor: '#fff', padding: '10px', overflow: 'auto', fontSize: '12px' }}>
            {this.state.error?.stack}
          </pre>
        </div>
      )
    }

    return this.props.children
  }
}

