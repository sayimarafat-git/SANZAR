import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  GoogleAuthProvider, 
  signInWithPopup, 
  sendPasswordResetEmail,
  signOut as fbSignOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAGKHQNuIveWkOEvy2idE91N0d8RNvmWo4",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "sanzar-1e625.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "sanzar-1e625",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "sanzar-1e625.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1032083662056",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1032083662056:web:1cc8d6f35f2683294cd55d"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  fbSignOut,
  onAuthStateChanged
};
export type { User };
