import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {

  apiKey: "AIzaSyC5LJKWflyRF0yVRCn4kFFHjnmBbg32DGc",

  authDomain: "sniper-holdem.firebaseapp.com",

  projectId: "sniper-holdem",

  storageBucket: "sniper-holdem.firebasestorage.app",

  messagingSenderId: "296779889202",

  appId: "1:296779889202:web:325811f09037fbea7c9a2b"

};


const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
