import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'gen-lang-client-0281662355.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0281662355',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'gen-lang-client-0281662355.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '283324708762',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:283324708762:web:fb8139aaedd0d39027ec23',
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || 'ai-studio-56c63423-f4bf-40b7-8873-6b4921b79df2'
};

if (!firebaseConfig.apiKey) {
  console.warn("⚠️ [Firebase] API Key is missing. Please set VITE_FIREBASE_API_KEY in Settings.");
}

const app = initializeApp(firebaseConfig);
const dbId = firebaseConfig.firestoreDatabaseId;
export const db = dbId ? getFirestore(app, dbId) : getFirestore(app);
export const auth = getAuth(app);
