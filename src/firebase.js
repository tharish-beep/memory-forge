import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDidIhTx0rHiCoTDYd5x1zQkBk0ieDY_oU",
  authDomain: "steel-br.firebaseapp.com",
  projectId: "steel-br",
  storageBucket: "steel-br.firebasestorage.app",
  messagingSenderId: "1026910405417",
  appId: "1:1026910405417:web:d524fa5e14b1fff9b12d38"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
