```javascript
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
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

// Ask Google to show account selection
provider.setCustomParameters({
    prompt: "select_account"
});

// ======================
// DETECT APPILIX / ANDROID WEBVIEW
// ======================
// Normal Chrome/Edge/Firefox:
// → Keep using the existing popup login.
//
// Android WebView / Appilix:
// → Use redirect login instead.
const userAgent = navigator.userAgent || navigator.vendor || window.opera;

const isAndroidWebView =
    /Android/i.test(userAgent) &&
    (
        /; wv\)/i.test(userAgent) ||
        /Version\/[\d.]+.*Chrome\/[\d.]+.*Mobile/i.test(userAgent)
    );

// ======================
// AUTH REDIRECT HANDLER
// ======================
let isRedirecting = false;

const handleRedirect = async (user) => {
    if (!user || isRedirecting) return;

    isRedirecting = true;

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

document.addEventListener("DOMContentLoaded", async () => {

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
        const type = passwordInput.type === "password"
            ? "text"
            : "password";

        passwordInput.type = type;

        togglePassword.classList.toggle("fa-eye");
        togglePassword.classList.toggle("fa-eye-slash");
    });

    // ======================
    // CHECK FOR REDIRECT LOGIN
    // ======================
    // This runs after Google sends the user back
    // to UrjaRise after signInWithRedirect().
    try {
        const redirectResult = await getRedirectResult(auth);

        if (redirectResult && redirectResult.user) {
            console.log(
                "Google Redirect Sign-In successful:",
                redirectResult.user
            );

            console.log(
                "Google profile photo:",
                redirectResult.user.photoURL
            );

            // onAuthStateChanged() below will handle
            // the feed.html/profile.html redirect.
        }
    } catch (error) {
        console.error("Google Redirect Sign-In Error:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);

        alert(
            error.message ||
            "Google sign in failed"
        );
    }

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
                await createUserWithEmailAndPassword(
                    auth,
                    email,
                    password
                );

                alert("Account Created Successfully!");
            } else {
                await signInWithEmailAndPassword(
                    auth,
                    email,
                    password
                );

                alert("Login Successful!");
            }
        } catch (error) {
            console.error(error);
            alert(error.message);
        }
    });

    // ======================
    // GOOGLE LOGIN
    // ======================
    googleBtn.addEventListener("click", async () => {
        try {
            googleBtn.disabled = true;
            googleBtn.innerHTML = `<span>Connecting...</span>`;

            if (isAndroidWebView) {

                // ==========================================
                // APPILIX / ANDROID WEBVIEW
                // ==========================================
                // Popup authentication was giving:
                // auth/popup-closed-by-user
                //
                // Therefore use full-page redirect instead.
                console.log(
                    "Android WebView detected - using Google redirect sign-in"
                );

                await signInWithRedirect(auth, provider);

            } else {

                // ==========================================
                // NORMAL WEBSITE
                // ==========================================
                // Keep the existing working popup login.
                console.log(
                    "Normal browser detected - using Google popup sign-in"
                );

                const result = await signInWithPopup(
                    auth,
                    provider
                );

                console.log(
                    "Google Sign-In successful:",
                    result.user
                );

                console.log(
                    "Google profile photo:",
                    result.user.photoURL
                );

                // onAuthStateChanged() handles redirect.
            }

        } catch (error) {
            console.error("Google Sign-In Error:", error);
            console.error("Error code:", error.code);
            console.error("Error message:", error.message);

            alert(
                error.message ||
                "Google sign in failed"
            );

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

            console.log("Authenticated user:", user);
            console.log("Profile photo:", user.photoURL);

            handleRedirect(user);
        }
    });

});
```
