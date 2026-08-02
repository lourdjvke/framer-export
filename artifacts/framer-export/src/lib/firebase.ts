import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCeQYmMOlLedP43EFVUAXDGi38spf_7erU",
  authDomain: "visage-a1d96.firebaseapp.com",
  databaseURL: "https://visage-a1d96-default-rtdb.firebaseio.com",
  projectId: "visage-a1d96",
  storageBucket: "visage-a1d96.firebasestorage.app",
  messagingSenderId: "627891269494",
  appId: "1:627891269494:web:92796a7b38f13e42211457",
  measurementId: "G-W7TLBNM0CV",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
