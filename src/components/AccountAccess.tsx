import { useState, type FormEvent } from 'react';
import { ArrowRight, CloudSlash, EnvelopeSimple, Eye, EyeSlash, LockKey, User } from '@phosphor-icons/react';
import { useAuth } from '../context/AuthContext';

type AccessMode = 'sign-in' | 'create' | 'reset' | 'recovery';

export function AccountAccess({ embedded = false }: { embedded?: boolean }) {
    const { configured, recoveryMode, signIn, signUp, sendPasswordReset, updatePassword } = useAuth();
    const [mode, setMode] = useState<AccessMode>(recoveryMode ? 'recovery' : 'sign-in');
    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const effectiveMode: AccessMode = recoveryMode ? 'recovery' : mode;

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setMessage(null);
        setError(null);

        try {
            if (effectiveMode === 'sign-in') await signIn(email.trim(), password);
            if (effectiveMode === 'create') setMessage(await signUp(displayName.trim(), email.trim(), password));
            if (effectiveMode === 'reset') {
                await sendPasswordReset(email.trim());
                setMessage('Password reset email sent.');
            }
            if (effectiveMode === 'recovery') {
                await updatePassword(password);
                setMessage('Password updated. You can continue to your account.');
            }
        } catch (submissionError) {
            setError(submissionError instanceof Error ? submissionError.message : 'Account request failed.');
        } finally {
            setBusy(false);
        }
    };

    if (!configured) {
        return (
            <div className={`account-access-shell${embedded ? ' is-embedded' : ''}`}>
                <section className="account-access-panel" aria-labelledby="cloud-setup-heading">
                    <CloudSlash size={28} weight="duotone" />
                    <h1 id="cloud-setup-heading">Cloud accounts are not configured</h1>
                    <p>The app is running in local-only mode on this device.</p>
                </section>
            </div>
        );
    }

    const title = effectiveMode === 'create'
        ? 'Create account'
        : effectiveMode === 'reset'
            ? 'Reset password'
            : effectiveMode === 'recovery'
                ? 'Choose a new password'
                : 'Sign in';
    const Heading = embedded ? 'h2' : 'h1';

    return (
        <div className={`account-access-shell${embedded ? ' is-embedded' : ''}`}>
            <section className="account-access-panel" aria-labelledby="account-access-heading">
                <p className="editorial-kicker">No Fridge Spoil</p>
                <Heading id="account-access-heading">{title}</Heading>

                {effectiveMode !== 'reset' && effectiveMode !== 'recovery' && (
                    <div className="account-access-tabs" role="tablist" aria-label="Account access">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={effectiveMode === 'sign-in'}
                            onClick={() => setMode('sign-in')}
                        >
                            Sign in
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={effectiveMode === 'create'}
                            onClick={() => setMode('create')}
                        >
                            Create account
                        </button>
                    </div>
                )}

                <form onSubmit={submit} className="account-access-form">
                    {effectiveMode === 'create' && (
                        <label htmlFor="account-display-name">
                            <span>Name</span>
                            <div className="account-field">
                                <User size={18} />
                                <input
                                    id="account-display-name"
                                    aria-label="Name"
                                    value={displayName}
                                    onChange={event => setDisplayName(event.target.value)}
                                    autoComplete="name"
                                    required
                                    maxLength={80}
                                />
                            </div>
                        </label>
                    )}

                    {effectiveMode !== 'recovery' && (
                        <label htmlFor="account-email">
                            <span>Email</span>
                            <div className="account-field">
                                <EnvelopeSimple size={18} />
                                <input
                                    id="account-email"
                                    aria-label="Email"
                                    type="email"
                                    value={email}
                                    onChange={event => setEmail(event.target.value)}
                                    autoComplete="email"
                                    required
                                />
                            </div>
                        </label>
                    )}

                    {effectiveMode !== 'reset' && (
                        <label htmlFor="account-password">
                            <span>Password</span>
                            <div className="account-field">
                                <LockKey size={18} />
                                <input
                                    id="account-password"
                                    aria-label="Password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={event => setPassword(event.target.value)}
                                    autoComplete={effectiveMode === 'sign-in' ? 'current-password' : 'new-password'}
                                    aria-describedby={effectiveMode === 'create' || effectiveMode === 'recovery'
                                        ? 'account-password-requirements'
                                        : undefined}
                                    required
                                    minLength={8}
                                />
                                <button
                                    type="button"
                                    className="account-password-toggle"
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    title={showPassword ? 'Hide password' : 'Show password'}
                                    onClick={() => setShowPassword(value => !value)}
                                >
                                    {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            {(effectiveMode === 'create' || effectiveMode === 'recovery') && (
                                <small id="account-password-requirements" className="account-field-help">
                                    Use at least 8 characters.
                                </small>
                            )}
                        </label>
                    )}

                    {error && <p className="account-access-error" role="alert">{error}</p>}
                    {message && <p className="account-access-message" role="status">{message}</p>}

                    <button type="submit" className="account-submit" disabled={busy}>
                        <span>{busy ? 'Working' : title}</span>
                        <ArrowRight size={18} />
                    </button>
                </form>

                {effectiveMode === 'sign-in' && (
                    <button type="button" className="account-text-command" onClick={() => setMode('reset')}>
                        Forgot password?
                    </button>
                )}
                {effectiveMode === 'reset' && (
                    <button type="button" className="account-text-command" onClick={() => setMode('sign-in')}>
                        Back to sign in
                    </button>
                )}
            </section>
        </div>
    );
}
