import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertCircle, Compass, LogIn } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { useSettings } from '../../lib/settings-context';
import { BrandMark } from '../../components/SanzarUI';

interface AuthPageProps {
  mode: 'login' | 'register' | 'forgot';
}

export const AuthPage: React.FC<AuthPageProps> = ({ mode }) => {
  const { t } = useSettings();
  const { signIn, setGuestMode } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogtoSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn();
    } catch (err: any) {
      setError(err?.message || t('err.generic'));
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

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleLogtoSignIn}
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-semibold text-sm flex items-center justify-center gap-2 transition shadow-sm hover:opacity-95 disabled:opacity-50"
          >
            <LogIn className="w-4 h-4" />
            {loading ? '…' : mode === 'register' ? t('signUp') : t('signIn')}
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
