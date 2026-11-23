import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  );
};
