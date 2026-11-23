import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  googleProvider,
  auth,
  sendPasswordResetEmail,
} from '../../lib/firebase';
import { sendEmailVerification, updateProfile as fbUpdateProfile } from 'firebase/auth';
import { Mail, Lock, User as UserIcon, AlertCircle, Compass } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { useSettings } from '../../lib/settings-context';
import { BrandMark } from '../../components/SanzarUI';

interface AuthPageProps {
  mode: 'login' | 'register' | 'forgot';
}

export const AuthPage: React.FC<AuthPageProps> = ({ mode }) => {
  const { t } = useSettings();
  const { setGuestMode } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [verifySent, setVerifySent] = useState(false);
  const navigate = useNavigate();

  const mapAuthError = (err: any) => {
    const code = err?.code || '';
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/user-not-found') {
      return t('err.wrongCredentials');
    }
    if (code === 'auth/email-already-in-use') return t('err.emailInUse');
    return err?.message || t('err.generic');
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'register' && name.trim().length < 2) {
      setError(t('err.name'));
      return;
    }
    if (mode !== 'forgot' && password.length < 8) {
      setError(t('err.password'));
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        navigate('/');
      } else if (mode === 'register') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await fbUpdateProfile(cred.user, { displayName: name.trim() });
        try {
          await sendEmailVerification(cred.user);
        } catch {}
        setVerifySent(true);
      } else {
        await sendPasswordResetEmail(auth, email.trim());
        setResetSent(true);
      }
    } catch (err: any) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      navigate('/');
    } catch (err: any) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = () => {
    setGuestMode(true);
    navigate('/library');
  };

  return (
    <div className="max-w-md mx-auto py-8">
      <div className="sanzar-card p-7 shadow-sm space-y-6">
        <div className="text-center flex flex-col items-center">
          <BrandMark size={48} className="mb-3" />
          <h1 className="text-2xl font-extrabold text-sanzar-text">
            {mode === 'login' ? t('signIn') : mode === 'register' ? t('signUp') : t('forgot')}
          </h1>
          <p className="text-sanzar-muted text-sm mt-1">{t('tagline')}</p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-sanzar-danger/10 border border-sanzar-danger/30 flex items-start gap-2 text-sanzar-danger text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {verifySent ? (
          <div className="text-center space-y-4">
            <div className="p-4 bg-sanzar-primarySoft rounded-xl text-sanzar-primary text-sm font-medium">
              {t('verifyEmail', { email })}
            </div>
            <button
              onClick={() => navigate('/')}
              className="w-full py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-semibold text-sm"
            >
              {t('continue')}
            </button>
          </div>
        ) : resetSent ? (
          <div className="text-center space-y-4">
            <div className="p-4 bg-sanzar-primarySoft rounded-xl text-sanzar-primary text-sm font-medium">
              {t('resetSent', { email })}
            </div>
            <Link to="/login" className="block text-sm text-sanzar-primary font-semibold hover:underline">
              {t('signIn')}
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={handleEmailAuth} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-semibold text-sanzar-text2 uppercase tracking-wider mb-1">
                    {t('name')}
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-sanzar-muted absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="sanzar-input pl-9 text-sm"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-sanzar-text2 uppercase tracking-wider mb-1">
                  {t('email')}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-sanzar-muted absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="sanzar-input pl-9 text-sm"
                  />
                </div>
              </div>

              {mode !== 'forgot' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-sanzar-text2 uppercase tracking-wider">
                      {t('password')}
                    </label>
                    {mode === 'login' && (
                      <Link to="/forgot-password" className="text-xs text-sanzar-primary font-semibold hover:underline">
                        {t('forgot')}
                      </Link>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-sanzar-muted absolute left-3 top-3" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="sanzar-input pl-9 text-sm"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-semibold text-sm transition shadow-sm hover:opacity-95 disabled:opacity-50"
              >
                {loading
                  ? '…'
                  : mode === 'login'
                    ? t('signIn')
                    : mode === 'register'
                      ? t('signUp')
                      : t('forgot')}
              </button>
            </form>

            {mode !== 'forgot' && (
              <div className="space-y-3">
                <div className="relative flex items-center justify-center">
                  <div className="border-t border-sanzar-border w-full" />
                  <span className="bg-sanzar-surface px-3 text-xs text-sanzar-muted uppercase font-semibold">
                    {t('or')}
                  </span>
                  <div className="border-t border-sanzar-border w-full" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl border border-sanzar-border hover:bg-sanzar-surface2 text-sanzar-text font-semibold text-sm flex items-center justify-center gap-2 transition"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  {t('google')}
                </button>

                <button
                  type="button"
                  onClick={handleGuest}
                  className="w-full py-2.5 rounded-xl border border-sanzar-border bg-sanzar-surface2 hover:opacity-90 text-sanzar-text2 font-semibold text-sm flex items-center justify-center gap-2 transition"
                >
                  <Compass className="w-4 h-4 text-sanzar-primary" />
                  {t('browseAsGuest')}
                </button>
              </div>
            )}
          </>
        )}

        <div className="text-center text-xs text-sanzar-muted pt-3 border-t border-sanzar-border">
          {mode === 'login' ? (
            <p>
              {t('noAccount')}{' '}
              <Link to="/register" className="text-sanzar-primary font-semibold hover:underline">
                {t('signUp')}
              </Link>
            </p>
          ) : (
            <p>
              {t('haveAccount')}{' '}
              <Link to="/login" className="text-sanzar-primary font-semibold hover:underline">
                {t('signIn')}
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
