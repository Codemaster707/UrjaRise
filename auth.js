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

provider.setCustomParameters({
    prompt: "select_account"
});

// ======================
// APPILIX ENVIRONMENT DETECTION
// ======================
// Appilix injects a global `appilix` object into every page it loads
// (documented at https://appilix.com/docs/javascript-bridge-overview).
// This is a first-party signal, not user-agent sniffing, so it won't
// misfire for normal Chrome/Edge/Safari visitors on the real website.
function isInsideAppilixApp() {
    return typeof window.appilix !== "undefined";
}

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
    // POST-LOGIN REDIRECT HANDLER (with loop protection)
    // ======================
    let isRedirecting = false;

    const handleRedirect = async (user) => {
        if (!user || isRedirecting) return;

        isRedirecting = true; // Prevent multiple redirects

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
    // EMAIL LOGIN / SIGNUP (unchanged)
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
    // GOOGLE LOGIN
    // Uses signInWithPopup on normal browsers, signInWithRedirect
    // when running inside the Appilix app (see explanation above code)
    // ======================
    const setGoogleBtnLoading = (loading) => {
        googleBtn.disabled = loading;
        googleBtn.innerHTML = loading
            ? `<span>Connecting...</span>`
            : `
                <img src="https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg">
                <span>Continue with Google</span>
            `;
    };

    googleBtn.addEventListener("click", async () => {
        setGoogleBtnLoading(true);

        try {
            if (isInsideAppilixApp()) {
                // Inside the Appilix WebView: signInWithPopup() opens the
                // consent screen as ANOTHER embedded WebView, which Google
                // blocks outright (disallowed_useragent). signInWithRedirect()
                // performs a full top-level navigation instead, which is what
                // lets Appilix's WebView hand the page off to the real system
                // browser IF the domains below are excluded in the Appilix
                // dashboard (see Section D). The result is picked back up by
                // getRedirectResult() below once the user returns to this page.
                await signInWithRedirect(auth, provider);
                // Page is navigating away — nothing more runs here.
                return;
            }

            // Normal desktop/mobile browser: popup works fine.
            const result = await signInWithPopup(auth, provider);
            console.log("Google Sign-In successful:", result.user);
        } catch (error) {
            console.error("Google Sign-In Error:", error);
            alert(error.message || "Google sign in failed");
            setGoogleBtnLoading(false);
        }
    });

    // Picks up the result after a signInWithRedirect() round trip.
    // Runs harmlessly (resolves with null) on every normal page load too.
    getRedirectResult(auth)
        .then((result) => {
            if (result && result.user) {
                console.log("Google Sign-In (redirect) successful:", result.user);
                // onAuthStateChanged below will fire and handle routing.
            }
        })
        .catch((error) => {
            console.error("Google Sign-In (redirect) Error:", error);
            alert(error.message || "Google sign in failed");
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
