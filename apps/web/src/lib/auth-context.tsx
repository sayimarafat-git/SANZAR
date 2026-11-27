import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLogto } from '@logto/react';
import { apiRequest, setAuthTokenProvider } from './api-client';
import { getCallbackUrl, getPostSignOutUrl } from './logto';
import { atLeast, type Role, type UserProfile } from './models';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  photoURL: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  profile: UserProfile | null;
  profileLoaded: boolean;
  loading: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  guestMode: boolean;
  setGuestMode: (v: boolean) => void;
  atLeastRole: (min: Role) => boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: Record<string, unknown>) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  profileLoaded: false,
  loading: true,
  isAdmin: false,
  isStaff: false,
  guestMode: false,
  setGuestMode: () => {},
  atLeastRole: () => false,
  signIn: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
  updateProfile: async () => {},
  deleteAccount: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    isAuthenticated,
    isLoading: logtoLoading,
    getIdToken,
    getIdTokenClaims,
    signIn: logtoSignIn,
    signOut: logtoSignOut,
  } = useLogto();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [guestMode, setGuestModeState] = useState(() => localStorage.getItem('sanzar.guest') === '1');

  const setGuestMode = (v: boolean) => {
    setGuestModeState(v);
    if (v) localStorage.setItem('sanzar.guest', '1');
    else localStorage.removeItem('sanzar.guest');
  };

  const fallbackProfile = (currentUser: AuthUser): UserProfile => ({
    uid: currentUser.uid,
    email: currentUser.email,
    display_name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Student',
    role: currentUser.email === 'sayimarafat676@gmail.com' ? 'super_admin' : 'student',
    email_verified: currentUser.emailVerified,
    level_id: null,
    profile_visibility: 'private',
    onboarding_completed: true,
  });

  const fetchProfile = async (currentUser: AuthUser) => {
    try {
      const data = await apiRequest<{ user: UserProfile }>('/v1/me');
      setProfile(data.user);
    } catch {
      setProfile((prev) => prev ?? fallbackProfile(currentUser));
    } finally {
      setProfileLoaded(true);
    }
  };

  useEffect(() => {
    if (logtoLoading) {
      setLoading(true);
      return;
    }

    if (!isAuthenticated) {
      setAuthTokenProvider(null);
      setUser(null);
      setProfile(null);
      setProfileLoaded(false);
      setLoading(false);
      return;
    }

    setAuthTokenProvider(async () => {
      const token = await getIdToken();
      return token ?? null;
    });

    let cancelled = false;
    (async () => {
      try {
        const claims = await getIdTokenClaims();
        if (cancelled) return;
        const currentUser: AuthUser = {
          uid: claims?.sub || '',
          email: claims?.email ?? null,
          displayName: claims?.name ?? claims?.username ?? null,
          emailVerified: claims?.email_verified === true,
          photoURL: claims?.picture ?? null,
        };
        setUser(currentUser);
        setGuestMode(false);
        setProfileLoaded(false);
        setProfile((prev) => (prev?.uid === currentUser.uid ? prev : fallbackProfile(currentUser)));
        setLoading(false);
        await fetchProfile(currentUser);
      } catch {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, logtoLoading, getIdToken, getIdTokenClaims]);

  const refreshProfile = async () => {
    if (user) await fetchProfile(user);
  };

  const updateProfile = async (patch: Record<string, unknown>) => {
    const data = await apiRequest<{ user: UserProfile }>('/v1/me', {
      method: 'PATCH',
      bodyJson: patch,
    });
    setProfile(data.user);
    setProfileLoaded(true);
  };

  const signIn = async () => {
    await logtoSignIn(getCallbackUrl());
  };

  const signOut = async () => {
    setAuthTokenProvider(null);
    setProfile(null);
    setProfileLoaded(false);
    setGuestMode(false);
    await logtoSignOut(getPostSignOutUrl());
  };

  const deleteAccount = async () => {
    await apiRequest('/v1/me', { method: 'DELETE' });
    await signOut();
  };

  const isStaff = atLeast(profile?.role, 'moderator');
  const isAdmin = atLeast(profile?.role, 'admin');
  const atLeastRole = (min: Role) => atLeast(profile?.role, min);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        profileLoaded,
        loading,
        isAdmin,
        isStaff,
        guestMode,
        setGuestMode,
        atLeastRole,
        signIn,
        signOut,
        refreshProfile,
        updateProfile,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
