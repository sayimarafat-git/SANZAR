import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  auth,
  onAuthStateChanged,
  User,
  fbSignOut,
} from './firebase';
import { apiRequest } from './api-client';
import { atLeast, type Role, type UserProfile } from './models';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  profileLoaded: boolean;
  loading: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  guestMode: boolean;
  setGuestMode: (v: boolean) => void;
  atLeastRole: (min: Role) => boolean;
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
  signOut: async () => {},
  refreshProfile: async () => {},
  updateProfile: async () => {},
  deleteAccount: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [guestMode, setGuestModeState] = useState(() => localStorage.getItem('sanzar.guest') === '1');

  const setGuestMode = (v: boolean) => {
    setGuestModeState(v);
    if (v) localStorage.setItem('sanzar.guest', '1');
    else localStorage.removeItem('sanzar.guest');
  };

  const fallbackProfile = (currentUser: User): UserProfile => ({
    uid: currentUser.uid,
    email: currentUser.email,
    display_name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Student',
    role: currentUser.email === 'sayimarafat676@gmail.com' ? 'super_admin' : 'student',
    email_verified: currentUser.emailVerified,
    level_id: null,
    profile_visibility: 'private',
    onboarding_completed: true,
  });

  const fetchProfile = async (currentUser: User) => {
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
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setGuestMode(false);
        setProfileLoaded(false);
        setProfile((prev) => (prev?.uid === currentUser.uid ? prev : fallbackProfile(currentUser)));
        setLoading(false);
        void fetchProfile(currentUser);
      } else {
        setProfile(null);
        setProfileLoaded(false);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

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

  const deleteAccount = async () => {
    await apiRequest('/v1/me', { method: 'DELETE' });
    if (auth.currentUser) {
      try {
        await auth.currentUser.delete();
      } catch {
        await fbSignOut(auth);
      }
    }
    setProfile(null);
    setProfileLoaded(false);
  };

  const signOut = async () => {
    await fbSignOut(auth);
    setProfile(null);
    setProfileLoaded(false);
    setGuestMode(false);
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
