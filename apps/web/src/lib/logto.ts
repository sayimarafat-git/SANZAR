import { UserScope, type LogtoConfig } from '@logto/react';

export const LOGTO_ENDPOINT =
  import.meta.env.VITE_LOGTO_ENDPOINT || 'https://ugtpcv.logto.app/';

export const LOGTO_APP_ID =
  import.meta.env.VITE_LOGTO_APP_ID || '092jfg3gdj4y3q4cfixzd';

export const logtoConfig: LogtoConfig = {
  endpoint: LOGTO_ENDPOINT,
  appId: LOGTO_APP_ID,
  scopes: [UserScope.Email, UserScope.Profile],
};

export function getCallbackUrl(): string {
  return `${window.location.origin}/callback`;
}

export function getPostSignOutUrl(): string {
  return window.location.origin;
}
