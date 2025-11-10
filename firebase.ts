import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDW2WvR7ZjykVnTzNWPh0LJO2pCcrq6zHY",
  authDomain: "torneios-de-xadrez.firebaseapp.com",
  projectId: "torneios-de-xadrez",
  storageBucket: "torneios-de-xadrez.appspot.com",
  messagingSenderId: "688729514355",
  appId: "1:688729514355:web:96daef064e5ef7d771a506",
  measurementId: "G-Y97PB957XV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
