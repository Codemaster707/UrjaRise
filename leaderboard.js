import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, query, orderBy, limit, onSnapshot, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Exact Verified Firebase Connection Configurations
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

const podiumContainer = document.getElementById("podiumContainer");
const rankingsList = document.getElementById("rankingsList");
const shimmerLoader = document.getElementById("shimmerLoader");

// Session Access Security Verification Routing
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userRef = doc(db, "users", user.uid);
            
            // Mark user as active/online upon arriving at the leaderboard
            await updateDoc(userRef, { isOnline: true });
            
            // Initiate the real-time leaderboard dashboard update loop
            initializeLeaderboardSync();
        } catch (error) {
            console.error("Failed to update leaderboard presence state:", error);
            // Fallback: run dashboard sync anyway if update fails
            initializeLeaderboardSync();
        }
    } else {
        // Force unauthenticated/logged-out sessions back to the portal page
        window.location.href = "index.html";
        return;
    }
});

// Setup Real-time Active Snapshot stream query mapping
function initializeLeaderboardSync() {
    const leaderboardQuery = query(
        collection(db, "users"),
        orderBy("urjaPoints", "desc"),
        limit(10)
    );

    onSnapshot(leaderboardQuery, (snapshot) => {
        // Drop Shimmer Layout elements instantly
        if (shimmerLoader) shimmerLoader.style.display = "none";
        podiumContainer.innerHTML = "";
        
        // Wipe old trailing node rows securely
        const activeRows = rankingsList.querySelectorAll(".ranking-row");
        activeRows.forEach(row => row.remove());

        if (snapshot.empty) {
            rankingsList.innerHTML = `<div style="text-align:center; padding:50px; color:#999;">No leaderboard rankings available yet 🚀</div>`;
            return;
        }

        let rankIndex = 1;
        let showPodiumHeader = false;

        snapshot.forEach((userDoc) => {
            const userData = userDoc.data();
            const fullName = userData.displayName || userData.username || "Urja Member";
            const microHandle = userData.username ? `@${userData.username}` : "@username";
            const profilePhoto = userData.photoURL || "https://via.placeholder.com/65";
            const totalPoints = userData.urjaPoints || 0;

            if (rankIndex <= 3) {
                // Populate structural elements for Podium UI Card Slots
                showPodiumHeader = true;
                const visualCrown = rankIndex === 1 ? `<div class="crown"><i class="fas fa-crown"></i></div>` : "";
                
                const podiumCard = document.createElement("div");
                podiumCard.className = `podium-spot rank-${rankIndex}`;
                podiumCard.innerHTML = `
                    <div class="avatar-wrapper">
                        ${visualCrown}
                        <img src="${profilePhoto}" alt="${fullName}">
                        <div class="badge">${rankIndex}</div>
                    </div>
                    <div class="podium-name">${fullName}</div>
                    <div class="podium-points">⚡ ${totalPoints}</div>
                `;
                podiumContainer.appendChild(podiumCard);
            } else {
                // Append rows for index rankings 4 through 10
                const rankRowElement = document.createElement("div");
                rankRowElement.className = "ranking-row";
                rankRowElement.innerHTML = `
                    <div class="row-rank">${rankIndex}</div>
                    <img src="${profilePhoto}" alt="${fullName}">
                    <div class="row-details">
                        <h4 class="row-name">${fullName}</h4>
                        <p class="row-username">${microHandle}</p>
                    </div>
                    <div class="row-points">⚡ <span>${totalPoints}</span></div>
                `;
                rankingsList.appendChild(rankRowElement);
            }
            rankIndex++;
        });

        if (showPodiumHeader) {
            podiumContainer.style.display = "grid";
        }
    }, (error) => {
        console.error("Leaderboard Real-time Synchronization Failure:", error);
        rankingsList.innerHTML = `<div style="text-align:center; padding:30px; color:red;">Failed to sync ranking dashboard data.</div>`;
    });
}