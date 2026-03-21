import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

function readConfig() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY ?? "";
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "";
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "";
  const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "";
  const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "";
  const appId = import.meta.env.VITE_FIREBASE_APP_ID ?? "";
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };
}

const config = readConfig();

let app: FirebaseApp | null = null;
if (config) {
  app = initializeApp(config);
}

/** Firebase is configured and initialized (env vars present). */
export function isFirebaseConfigured(): boolean {
  return app !== null;
}

export const firebaseApp = app;
export const auth = app ? getAuth(app) : null;
export const db: Firestore | null = app ? getFirestore(app) : null;

export function requireDb(): Firestore {
  if (!db) throw new Error("Firestore not initialized — set VITE_FIREBASE_* env vars.");
  return db;
}
