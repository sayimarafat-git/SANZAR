import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LogtoProvider } from '@logto/react';
import { logtoConfig } from '../lib/logto';
import { AuthProvider } from '../lib/auth-context';
import { FocusTimerProvider } from '../lib/focus-timer-context';
import { SettingsProvider } from '../lib/settings-context';
import { ToastProvider } from '../components/SanzarUI';
import { AppRouter } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const Providers: React.FC = () => {
  return (
    <LogtoProvider config={logtoConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <SettingsProvider>
            <AuthProvider>
              <ToastProvider>
                <FocusTimerProvider>
                  <AppRouter />
                </FocusTimerProvider>
              </ToastProvider>
            </AuthProvider>
          </SettingsProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </LogtoProvider>
  );
};
