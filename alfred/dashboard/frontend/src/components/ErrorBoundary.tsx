import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen items-center justify-center bg-surface-base p-8">
          <div className="max-w-lg rounded-lg border border-red-800 bg-red-950/50 p-6">
            <h2 className="text-lg font-bold text-red-400">Something went wrong</h2>
            <pre className="mt-3 overflow-auto rounded bg-surface-1 p-3 text-xs text-tertiary">
              {this.state.error.message}
            </pre>
            <button
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
              className="mt-4 rounded bg-accent-hover px-3 py-1.5 text-sm font-medium text-white hover:bg-accent"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
