import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, onAuthStateChanged, User, fbSignOut } from '../lib/firebase';
import { apiRequest } from '../lib/api-client';

interface UserProfile {
  uid: string;
  email: string | null;
  display_name: string | null;
  role: 'student' | 'moderator' | 'content_admin' | 'admin' | 'super_admin';
  email_verified: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (currentUser: User) => {
    try {
      const data = await apiRequest<{ user: UserProfile }>('/v1/me');
      setProfile(data.user);
    } catch (e) {
      console.error('Failed to load profile', e);
      // Fallback local stub if backend offline
      setProfile({
        uid: currentUser.uid,
        email: currentUser.email,
        display_name: currentUser.displayName,
        role: currentUser.email === 'sayimarafat676@gmail.com' ? 'super_admin' : 'student',
        email_verified: currentUser.emailVerified
      });
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await fetchProfile(currentUser);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const refreshProfile = async () => {
    if (user) await fetchProfile(user);
  };

  const signOut = async () => {
    await fbSignOut(auth);
    setProfile(null);
  };

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
