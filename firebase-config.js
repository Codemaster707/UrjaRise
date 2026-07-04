import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

const firebaseConfig = {
  apiKey: "AIzaSyDKuxeqnc0hrqcb8ISBfWiuqIUmAgSFxFQ",
  authDomain: "urjarise-auth.firebaseapp.com",
  projectId: "urjarise-auth",
  storageBucket: "urjarise-auth.firebasestorage.app",
  messagingSenderId: "293342690348",
  appId: "1:293342690348:web:a830c623dfa57b130c6589"
};

export const app = initializeApp(firebaseConfig);