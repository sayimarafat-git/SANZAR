'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  createAccount,
  logOut,
  refreshVerification,
  resendVerification,
  sendPasswordReset,
  signIn,
  watchSession,
} from '@/lib/auth';
import { api, setSession } from '@/lib/api';
import { atLeast, type Role } from '@/lib/model';
import { errorText } from './ui';

export interface Me { uid: string; email: string; display_name: string; role: Role }
const MeCtx = createContext<Me | null>(null);
export const useMe = () => useContext(MeCtx)!;

const NAV: { href: string; label: string; min: Role }[] = [
  { href: '/', label: 'Dashboard', min: 'moderator' },
  { href: '/content/', label: 'Books & chapters', min: 'content_admin' },
  { href: '/exams/', label: 'Exams', min: 'content_admin' },
  { href: '/moderation/', label: 'Moderation', min: 'moderator' },
  { href: '/announcements/', label: 'Announcements', min: 'admin' },
  { href: '/users/', label: 'Users & roles', min: 'admin' },
  { href: '/settings/', label: 'Settings', min: 'admin' },
  { href: '/audit/', label: 'Audit log', min: 'admin' },
];

export function Shell({ children, min = 'moderator' }: { children: ReactNode; min?: Role }) {
  const [state, setState] = useState<{ phase: 'loading' | 'out' | 'unverified' | 'denied' | 'in' | 'error'; me?: Me; error?: string }>({ phase: 'loading' });
  const path = usePathname();

  useEffect(() => watchSession(async (s) => {
    setSession(s);
    if (!s) return setState({ phase: 'out' });
    if (!s.emailVerified) return setState({ phase: 'unverified' });
    try {
      const { user } = await api<{ user: Me }>('/v1/me');
      setState(atLeast(user.role, 'moderator') ? { phase: 'in', me: user } : { phase: 'denied', me: user });
    } catch (e) { setState({ phase: 'error', error: errorText(e) }); }
  }), []);

  if (state.phase === 'loading') return <div className="login"><p className="muted">Loading…</p></div>;
  if (state.phase === 'out') return <Login />;
  if (state.phase === 'unverified') return <VerifyEmail />;
  if (state.phase === 'error') return <div className="login"><div className="card"><div className="errors">{state.error}</div><button onClick={() => location.reload()}>Retry</button></div></div>;
  if (state.phase === 'denied') {
    return <div className="login"><div className="card"><h1>No access</h1><p>{state.me?.email} is a student account. Ask the owner to give you a staff role.</p></div></div>;
  }
  const me = state.me!;
  return (
    <MeCtx.Provider value={me}>
      <div className="layout">
        <aside className="side">
          <div className="brand"><div className="mark">S</div><div>Sanzar<br /><small className="muted">Admin</small></div></div>
          <nav className="nav">
            {NAV.filter((n) => atLeast(me.role, n.min)).map((n) => (
              <Link key={n.href} href={n.href} className={(n.href === '/' ? path === '/' : path.startsWith(n.href.replace(/\/$/, ''))) ? 'on' : ''}>{n.label}</Link>
            ))}
          </nav>
          <p className="muted" style={{ margin: '18px 8px 6px' }}>{me.display_name || me.email}<br /><span className="pill">{me.role}</span></p>
        </aside>
        <main className="main">{atLeast(me.role, min) ? children : <div className="errors">Your role ({me.role}) cannot open this page.</div>}</main>
      </div>
    </MeCtx.Provider>
  );
}

function Login() {
  return (
    <div className="login">
      <div className="card">
        <div className="brand"><div className="mark">S</div><div>Sanzar Admin</div></div>
        <LoginForm />
      </div>
    </div>
  );
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (register) await createAccount(email, password);
      else await signIn(email, password);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to authenticate.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <h1>{register ? 'Create your Sanzar account' : 'Admin sign in'}</h1>
      <p className="muted">Use your email and password. New accounts must verify their email before access.</p>
      <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Password<input type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {message && <div className="errors" role="alert">{message}</div>}
      <button className="primary" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
      <div className="row">
        <button type="button" onClick={() => { setRegister(!register); setMessage(''); }}>
          {register ? 'Already registered? Sign in' : 'Create account'}
        </button>
        {!register && <button type="button" onClick={async () => {
          setMessage('');
          try {
            if (!email.trim()) throw new Error('Enter your email first.');
            await sendPasswordReset(email);
            setMessage('Password reset email sent. Check your inbox.');
          } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Unable to send reset email.');
          }
        }}>Reset password</button>}
      </div>
    </form>
  );
}

function VerifyEmail() {
  const [message, setMessage] = useState('Verify the address from the link in your inbox.');
  const [busy, setBusy] = useState(false);
  return (
    <div className="login"><div className="card stack">
      <h1>Verify your email</h1>
      <p className="muted">{message}</p>
      <button disabled={busy} onClick={async () => {
        setBusy(true);
        try {
          await resendVerification();
          setMessage('Verification email sent. Check your inbox.');
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Unable to send verification email.');
        } finally { setBusy(false); }
      }}>Resend verification email</button>
      <button onClick={async () => {
        setBusy(true);
        try {
          if (await refreshVerification()) location.reload();
          else setMessage('The email is not verified yet. Open the link in your inbox, then try again.');
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Unable to refresh verification status.');
        } finally { setBusy(false); }
      }}>I verified my email</button>
      <button onClick={() => void logOut()}>Sign out</button>
    </div></div>
  );
}
