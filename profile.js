import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    getFirestore,
    doc,
    setDoc,
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

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

// ======================
// PARTICLE BACKGROUND
// ======================

const canvas = document.getElementById("particle-canvas");
const ctx = canvas.getContext("2d");

let particles = [];

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

class Particle {

    constructor() {
        this.reset();
    }

    reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2.5 + 1;
        this.speedX = (Math.random() - 0.5) * 0.5;
        this.speedY = (Math.random() - 0.5) * 0.5;
        this.opacity = Math.random() * 0.5 + 0.3;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;

        if (this.x < 0 || this.x > canvas.width) {
            this.speedX *= -1;
        }

        if (this.y < 0 || this.y > canvas.height) {
            this.speedY *= -1;
        }
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${this.opacity})`;
        ctx.fill();
    }
}

function initParticles() {
    resizeCanvas();
    particles = [];
    for (let i = 0; i < 70; i++) {
        particles.push(new Particle());
    }
}

function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
        p.update();
        p.draw();
    });
    requestAnimationFrame(animateParticles);
}

initParticles();
animateParticles();

window.addEventListener("resize", initParticles);

// ======================
// UI ELEMENTS
// ======================

const usernameInput    = document.getElementById("username-input");
const displayNameInput = document.getElementById("display-name-input");
const bioInput         = document.getElementById("bio-input");
const goalInput        = document.getElementById("goal-input");
const saveBtn          = document.querySelector(".save-button");
const profileAvatar    = document.getElementById("profile-avatar");
const defaultAvatar    = document.getElementById("default-avatar");

// ======================
// CHARACTER COUNTERS
// ======================

function updateCounter(input, counterId, max) {
    const counter = document.getElementById(counterId);
    if (!input || !counter) return;
    const length = input.value.length;
    counter.textContent = `${length}/${max}`;
    counter.style.color = length >= max ? "#ff512f" : "#999";
}

bioInput.addEventListener("input", () => updateCounter(bioInput, "bio-counter", 300));
goalInput.addEventListener("input", () => updateCounter(goalInput, "goal-counter", 250));

// ======================
// AUTO RESIZE
// ======================

function autoResize(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
}

bioInput.addEventListener("input", () => autoResize(bioInput));
goalInput.addEventListener("input", () => autoResize(goalInput));

// ======================
// SHOW PROFILE PHOTO
// ======================

function showPhoto(url) {

    if (!url || url.trim() === "") {
        showDefaultAvatar();
        return;
    }

    profileAvatar.src = url;
    profileAvatar.style.display = "block";
    profileAvatar.style.opacity = "1";
    defaultAvatar.style.display = "none";

    profileAvatar.onerror = () => {
        console.warn("Failed to load photo:", url);
        showDefaultAvatar();
    };
}


function showDefaultAvatar() {
    profileAvatar.style.display = "none";
    defaultAvatar.style.display = "flex";
}

// ======================
// LOAD USER DATA
// ======================

onAuthStateChanged(auth, async (user) => {

    if (!user) {
        window.location.href = "auth.html";
        return;
    }

    // Reload to ensure photoURL is fully resolved
    // (fixes race condition on first sign-in)
    try {
        await user.reload();
    } catch (e) {
        console.warn("Could not reload user:", e);
    }

    const freshUser = auth.currentUser;

    // Check providerData first — this is the most reliable source
    // for Google profile photos
    let photoURL = freshUser.photoURL || null;

    if (!photoURL && freshUser.providerData && freshUser.providerData.length > 0) {
        const googleProvider = freshUser.providerData.find(
            p => p.providerId === "google.com"
        );
        if (googleProvider && googleProvider.photoURL) {
            photoURL = googleProvider.photoURL;
        }
    }

    // Load Firestore data
    let firestorePhotoURL = null;

    try {

        const userRef  = doc(db, "users", freshUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {

            const data = userSnap.data();

            usernameInput.value    = data.username || "";
            displayNameInput.value = data.displayName || freshUser.displayName || "";
            bioInput.value         = data.bio || "";
            goalInput.value        = data.goal || "";

            updateCounter(bioInput, "bio-counter", 300);
            updateCounter(goalInput, "goal-counter", 250);
            autoResize(bioInput);
            autoResize(goalInput);

            // Only use Firestore photo as fallback if it's a real URL
            if (data.photoURL && data.photoURL.trim() !== "") {
                firestorePhotoURL = data.photoURL;
            }
        }

    } catch (error) {
        console.error("Error loading profile:", error);
    }

    // Priority: Auth providerData > Auth photoURL > Firestore photoURL
    const resolvedPhotoURL = photoURL || firestorePhotoURL;

    console.log("Resolved photo URL:", resolvedPhotoURL); // Debug — remove after confirming fix
console.log("Auth photoURL:", freshUser.photoURL);
console.log("Provider data:", freshUser.providerData);
console.log("Firestore photoURL:", firestorePhotoURL);
console.log("Resolved photoURL:", resolvedPhotoURL);
    showPhoto(resolvedPhotoURL);
});

// ======================
// SAVE PROFILE
// ======================

saveBtn.addEventListener("click", async () => {

    const user = auth.currentUser;

    if (!user) {
        alert("Please login again");
        return;
    }

    const originalHTML = saveBtn.innerHTML;

    saveBtn.innerHTML  = `<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...`;
    saveBtn.disabled   = true;

    // Get the freshest photoURL at save time — check providerData first
    let latestPhotoURL = user.photoURL || null;

    if (!latestPhotoURL && user.providerData && user.providerData.length > 0) {
        const googleProvider = user.providerData.find(
            p => p.providerId === "google.com"
        );
        if (googleProvider && googleProvider.photoURL) {
            latestPhotoURL = googleProvider.photoURL;
        }
    }

    try {

        await setDoc(
            doc(db, "users", user.uid),
            {
                username:    usernameInput.value.trim(),
                displayName: displayNameInput.value.trim(),
                bio:         bioInput.value.trim(),
                goal:        goalInput.value.trim(),
                email:       user.email || "",
                lastUpdated: new Date().toISOString(),

                // Only write photoURL if we actually have one —
                // never overwrite a valid URL with an empty string
                ...(latestPhotoURL ? { photoURL: latestPhotoURL } : {})
            },
            { merge: true }
        );

        saveBtn.innerHTML        = `<i class="fa-solid fa-check"></i> Profile Saved!`;
        saveBtn.style.background = "linear-gradient(90deg, #2ecc71, #27ae60)";

        setTimeout(() => {
            window.location.href = "feed.html";
        }, 1500);

    } catch (error) {

        console.error(error);
        alert("Failed to save profile.");
        saveBtn.innerHTML = originalHTML;
        saveBtn.disabled  = false;
    }
});