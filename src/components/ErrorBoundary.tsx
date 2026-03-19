import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '20px', color: 'red', fontFamily: 'system-ui, sans-serif' }}>
                    <h1>Something went wrong.</h1>
                    <p>Please take a screenshot of this for support:</p>
                    <pre style={{
                        backgroundColor: '#f1f1f1',
                        padding: '10px',
                        borderRadius: '4px',
                        overflow: 'auto',
                        fontSize: '12px'
                    }}>
                        {this.state.error?.toString()}
                        <br />
                        {this.state.error?.stack}
                    </pre>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: '10px',
                            padding: '10px 20px',
                            backgroundColor: '#007AFF',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '16px'
                        }}
                    >
                        Reload App
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
