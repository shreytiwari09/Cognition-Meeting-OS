import { Component } from 'react'

// Last line of defence: a page that throws shows a friendly screen instead of a blank one
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[MeetingOS] page crashed', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div className="bento p-10 max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-overdue-bg text-overdue flex items-center justify-center mx-auto mb-5">
            <span className="icon" style={{ fontSize: 28 }}>sentiment_dissatisfied</span>
          </div>
          <h1 className="text-headline-md text-ink">Something went wrong</h1>
          <p className="text-body-md text-ink-2 mt-2">This page hit an unexpected error. Reloading usually fixes it; your data is safe.</p>
          <div className="flex justify-center gap-2.5 mt-6">
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload page</button>
            <button className="btn btn-secondary" onClick={() => { window.location.href = '/' }}>Go home</button>
          </div>
        </div>
      </div>
    )
  }
}
