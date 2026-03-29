import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDidIhTx0rHiCoTDYd5x1zQkBk0ieDY_oU",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "steel-br.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "steel-br",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "steel-br.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1026910405417",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1026910405417:web:d524fa5e14b1fff9b12d38"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
