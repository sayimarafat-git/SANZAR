'use client';

import { getApp, getApps, initializeApp } from '@firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from '@firebase/auth';

export interface Session {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  token: () => Promise<string>;
}

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function authInstance() {
  if (Object.values(config).some((value) => !value)) {
    throw new Error('Firebase Auth is not configured for this deployment.');
  }
  const app = getApps().length ? getApp() : initializeApp(config);
  return getAuth(app);
}

function session(user: User): Session {
  return {
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    token: () => user.getIdToken(),
  };
}

export function watchSession(cb: (session: Session | null) => void): () => void {
  return onAuthStateChanged(authInstance(), (user) => cb(user ? session(user) : null), (error) => {
    console.error('Firebase Auth session listener failed', error);
    cb(null);
  });
}

export async function signIn(email: string, password: string) {
  await signInWithEmailAndPassword(authInstance(), email.trim(), password);
}

export async function createAccount(email: string, password: string) {
  const credential = await createUserWithEmailAndPassword(authInstance(), email.trim(), password);
  await sendEmailVerification(credential.user);
}

export async function sendPasswordReset(email: string) {
  await sendPasswordResetEmail(authInstance(), email.trim());
}

export async function resendVerification() {
  const user = authInstance().currentUser;
  if (!user) throw new Error('Sign in before requesting email verification.');
  await sendEmailVerification(user);
}

export async function refreshVerification() {
  const user = authInstance().currentUser;
  if (!user) throw new Error('No signed-in account.');
  await reload(user);
  return user.emailVerified;
}

export async function logOut() {
  await signOut(authInstance());
}
