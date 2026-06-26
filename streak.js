import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

let activeListeners = {};

// Helper function to get local YYYY-MM-DD string
function getLocalDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Strictly monitors if a user skipped posting yesterday, forcing streak back to 0
async function verifyAndEnforceStreakMaturity(userRef, userData) {
    const todayStr = getLocalDateString();
    const lastActiveStr = userData.lastActiveDate || "";

    let currentStreak = userData.currentStreak !== undefined ? userData.currentStreak : 0;
    let bestStreak = userData.bestStreak !== undefined ? userData.bestStreak : 0;
    let totalLogs = userData.totalLogs !== undefined ? userData.totalLogs : 0;

    if (lastActiveStr) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = [
            yesterday.getFullYear(),
            String(yesterday.getMonth() + 1).padStart(2, '0'),
            String(yesterday.getDate()).padStart(2, '0')
        ].join('-');

        // Only reset if they missed: last post was neither today nor yesterday
        if (lastActiveStr !== todayStr && lastActiveStr !== yesterdayStr) {
            currentStreak = 0;
        }
    } else {
        currentStreak = 0;
    }

    // CRITICAL FIX: do NOT write lastActiveDate back — it belongs to the post flow only.
    // Only write currentStreak so we don't race against feed.js updates.
    await setDoc(userRef, {
        isOnline: true,
        currentStreak: currentStreak,
        bestStreak: bestStreak,
        totalLogs: totalLogs
        // lastActiveDate intentionally omitted here
    }, { merge: true });

    return { currentStreak, bestStreak, totalLogs };
}
function listenToGlobalStreaks(container) {
    if (!container) return;

    const globalStreaksQuery = query(
        collection(db, "users"),
        orderBy("currentStreak", "desc"),
        limit(25)
    );

    activeListeners["global_streaks"] = onSnapshot(globalStreaksQuery, (snapshot) => {
        container.innerHTML = "";

        if (snapshot.empty) {
            container.innerHTML = `<div style="text-align:center; padding:30px; color:#aaa; font-size:0.85rem;">No active community streaks found.</div>`;
            return;
        }

        snapshot.forEach((userDoc) => {
    const userData = userDoc.data();
    const rawStreak = userData.currentStreak || 0;

    // Filter out inactive users from leaderboard
    const lastActive = userData.lastActiveDate || "";
    const istNow = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
    const yesterday = new Date(istNow);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = [
        yesterday.getUTCFullYear(),
        String(yesterday.getUTCMonth() + 1).padStart(2, '0'),
        String(yesterday.getUTCDate()).padStart(2, '0')
    ].join('-');
    const effectiveStreak = (lastActive >= yesterdayStr) ? rawStreak : 0;
    if (effectiveStreak === 0) return;

    const card = document.createElement("div");
            card.className = "streak-row-card";

            card.innerHTML = `
                <img src="${userData.photoURL || 'https://via.placeholder.com/40'}" alt="User">
                <div class="streak-row-info">
                    <h5>${userData.displayName || userData.username || 'Urja Member'}</h5>
                    <p>@${userData.username || 'username'}</p>
                </div>
                <div class="streak-row-badge">
                    <span>${effectiveStreak}</span>
                    <i class="fas fa-fire"></i>
                </div>
            `;
            container.appendChild(card);
        });
    }, (error) => {
        console.error("Global streak connection broken: ", error);
    });
}

onAuthStateChanged(auth, async (user) => {
    if (user) { 
        try {
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            
            if (!userSnap.exists()) { 
                window.location.href = "profile.html"; 
                return; 
            }

            const initialUserData = userSnap.data();
            const updatedData = await verifyAndEnforceStreakMaturity(userRef, initialUserData);

            const profilePhotoEl = document.getElementById("headerProfilePhoto");
            const usernameEl = document.getElementById("headerUsername");
            const currentStreakEl = document.getElementById("userCurrentStreak");
            const bestStreakEl = document.getElementById("userBestStreak");
            const totalLogsEl = document.getElementById("userTotalLogs");

            if (profilePhotoEl) profilePhotoEl.src = user.photoURL || initialUserData.photoURL || "https://via.placeholder.com/40";
            if (usernameEl) usernameEl.textContent = "@" + (initialUserData.username || "user");
            
            if (currentStreakEl) currentStreakEl.textContent = updatedData.currentStreak;
            if (bestStreakEl) bestStreakEl.textContent = updatedData.bestStreak;
            if (totalLogsEl) totalLogsEl.textContent = updatedData.totalLogs;

            const globalContainer = document.getElementById("global-streaks-container");
            listenToGlobalStreaks(globalContainer);

        } catch (error) {
            console.error("Initialization error:", error);
        }
    } else {
        window.location.href = "index.html"; 
        return; 
    }
});