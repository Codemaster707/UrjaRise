import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup,        // Changed from Redirect
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    getFirestore,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ======================
// FIREBASE CONFIG
// ======================
const firebaseConfig = {
    apiKey: "AIzaSyDKuxeqnc0hrqcb8ISBfWiuqIUmAgSFxFQ",
    authDomain: "urjarise-auth.firebaseapp.com",
    projectId: "urjarise-auth",
    storageBucket: "urjarise-auth.firebasestorage.app",
    messagingSenderId: "293342690348",
    appId: "1:293342690348:web:a830c623dfa57b130c6589"
};

// Init Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Optional: Add these for better UX
provider.setCustomParameters({
    prompt: 'select_account'
});

document.addEventListener("DOMContentLoaded", () => {

    const tabs = document.querySelectorAll(".tab");
    const togglePassword = document.querySelector(".toggle-password");
    const passwordInput = document.querySelector("#password");
    const emailInput = document.querySelector("#email");
    const submitText = document.querySelector("#submit-text");
    const form = document.querySelector("#auth-form");
    const googleBtn = document.querySelector(".google-btn");

    let isSignup = false;

    // ======================
    // TAB SWITCHING
    // ======================
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");

            isSignup = tab.id === "tab-signup";
            submitText.innerText = isSignup ? "Sign Up" : "Sign In";
        });
    });

    // ======================
    // TOGGLE PASSWORD
    // ======================
    togglePassword.addEventListener("click", () => {
        const type = passwordInput.type === "password" ? "text" : "password";
        passwordInput.type = type;
        togglePassword.classList.toggle("fa-eye");
        togglePassword.classList.toggle("fa-eye-slash");
    });

    // ======================
    // REDIRECT HANDLER (with loop protection)
    // ======================
    let isRedirecting = false;

    const handleRedirect = async (user) => {
        if (!user || isRedirecting) return;
        
        isRedirecting = true;   // Prevent multiple redirects

        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));

            if (userDoc.exists()) {
                window.location.href = "feed.html";
            } else {
                window.location.href = "profile.html";
            }
        } catch (error) {
            console.error("Redirect error:", error);
            window.location.href = "profile.html";
        }
    };

    // ======================
    // EMAIL LOGIN / SIGNUP
    // ======================
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (!email || !password) {
            alert("Please fill all fields");
            return;
        }

        try {
            if (isSignup) {
                await createUserWithEmailAndPassword(auth, email, password);
                alert("Account Created Successfully!");
            } else {
                await signInWithEmailAndPassword(auth, email, password);
                alert("Login Successful!");
            }
        } catch (error) {
            console.error(error);
            alert(error.message);
        }
    });

    // ======================
    // GOOGLE LOGIN - Using Popup (Fixed)
    // ======================
    googleBtn.addEventListener("click", async () => {
        try {
            googleBtn.disabled = true;
            googleBtn.innerHTML = `<span>Connecting...</span>`;

            const result = await signInWithPopup(auth, provider);
            console.log("Google Sign-In successful:", result.user);

            // No need to manually redirect here — onAuthStateChanged will handle it
        } catch (error) {
            console.error("Google Sign-In Error:", error);
            alert(error.message || "Google sign in failed");
        } finally {
            googleBtn.disabled = false;
            googleBtn.innerHTML = `
                <img src="https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg">
                <span>Continue with Google</span>
            `;
        }
    });

    // ======================
    // AUTH STATE LISTENER
    // ======================
    onAuthStateChanged(auth, (user) => {
        if (user) {
            handleRedirect(user);
        }
    });

});
