import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { ArrowClockwise, House } from '@phosphor-icons/react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    incidentId: string | null;
}

function createIncidentId(): string {
    const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Date.now().toString(36);
    return `NFS-${suffix.toUpperCase()}`;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        incidentId: null,
    };

    public static getDerivedStateFromError(): State {
        return { hasError: true, incidentId: createIncidentId() };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        if (import.meta.env.DEV) {
            console.error('Uncaught application error:', error.message, errorInfo.componentStack);
        }
    }

    private retry = () => {
        this.setState({ hasError: false, incidentId: null });
    };

    private returnHome = () => {
        window.location.hash = '#/';
        window.location.reload();
    };

    public render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <main className="app-error-shell" role="alert" aria-labelledby="app-error-heading">
                <section className="app-error-panel">
                    <p className="editorial-kicker">No Fridge Spoil</p>
                    <h1 id="app-error-heading">The kitchen view needs a reset</h1>
                    <p>Your device data is still stored locally. Retry the view or return to the inventory screen.</p>
                    <div className="app-error-actions">
                        <button type="button" onClick={this.retry}>
                            <ArrowClockwise size={18} />
                            Retry view
                        </button>
                        <button type="button" onClick={this.returnHome}>
                            <House size={18} />
                            Return home
                        </button>
                    </div>
                    {this.state.incidentId && (
                        <small>Reference {this.state.incidentId}</small>
                    )}
                </section>
            </main>
        );
    }
}
