import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHandleSignInCallback } from '@logto/react';
import { LoadingState } from '../../components/SanzarUI';

export const CallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const { isLoading, error } = useHandleSignInCallback(() => {
    navigate('/', { replace: true });
  });

  useEffect(() => {
    if (!isLoading && !error) {
      navigate('/', { replace: true });
    }
  }, [isLoading, error, navigate]);

  if (error) {
    return (
      <div className="max-w-md mx-auto py-16 px-4">
        <div className="sanzar-card p-6 text-center space-y-4">
          <h1 className="text-lg font-bold text-sanzar-danger">Sign-in could not be completed</h1>
          <p className="text-sm text-sanzar-muted break-words">{error.message}</p>
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="px-5 py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-semibold text-sm"
          >
            Try signing in again
          </button>
        </div>
      </div>
    );
  }

  return <LoadingState />;
};
