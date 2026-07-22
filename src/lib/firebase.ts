import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
const fbConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY || '').trim(),
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'gen-lang-client-0281662355.firebaseapp.com').trim(),
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0281662355').trim(),
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'gen-lang-client-0281662355.firebasestorage.app').trim(),
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '283324708762').trim(),
  appId: (import.meta.env.VITE_FIREBASE_APP_ID || '1:283324708762:web:fb8139aaedd0d39027ec23').trim(),
  firestoreDatabaseId: (import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || 'ai-studio-56c63423-f4bf-40b7-8873-6b4921b79df2').trim()
};

if (!fbConfig.apiKey) {
  console.warn("⚠️ [Firebase] API Key is missing. Dashboard sync requires VITE_FIREBASE_API_KEY.");
}

const app = initializeApp(fbConfig);
const dbId = fbConfig.firestoreDatabaseId;
// If the specific database ID is provided and is not (default), use it
export const db = dbId && dbId !== '(default)' ? getFirestore(app, dbId) : getFirestore(app);
export const auth = getAuth(app);
