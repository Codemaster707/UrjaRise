import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    getDocs,
    collection,
    query,
    where,
    orderBy,
    limit,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ============ Firebase Config ============
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

// ============ Read UID from URL ============
const params = new URLSearchParams(window.location.search);
const targetUid = params.get("uid");

if (!targetUid) {
    window.location.href = "feed.html";
}

// ============ DOM Refs ============
const headerHandleText   = document.getElementById("headerHandleText");
const profileAvatar      = document.getElementById("profileAvatar");
const onlineBadge        = document.getElementById("onlineBadge");
const displayNameEl      = document.getElementById("displayNameEl");
const usernameEl         = document.getElementById("usernameEl");
const bioEl              = document.getElementById("bioEl");
const goalEl             = document.getElementById("goalEl");
const goalText           = document.getElementById("goalText");
const heroBgBlur         = document.getElementById("heroBgBlur");

const statPoints         = document.getElementById("statPoints");
const statRank           = document.getElementById("statRank");
const statStreak         = document.getElementById("statStreak");
const statFriends        = document.getElementById("statFriends");

const heroCta            = document.getElementById("heroCta");
const addFriendBtn       = document.getElementById("addFriendBtn");
const addFriendHeaderBtn = document.getElementById("addFriendHeaderBtn");
const directChatBtn      = document.getElementById("directChatBtn");

const friendsSection     = document.getElementById("friendsSection");
const friendsScrollRow   = document.getElementById("friendsScrollRow");
const friendsBadge       = document.getElementById("friendsBadge");

const postsContainer     = document.getElementById("postsContainer");
const postsCountBadge    = document.getElementById("postsCountBadge");
const emptyPostsMsg      = document.getElementById("emptyPostsMsg");

// ============ State ============
let currentUser = null;
let targetUserData = null;
let isFriend = false;
let requestSent = false;

// ============ Helpers ============
function categoryEmoji(cat) {
    const map = {
        study: "📚", fitness: "💪", coding: "💻",
        goals: "🎯", reading: "📖", creative: "🎨"
    };
    return map[cat] || "✨";
}

function formatDate(ts) {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function getRankLabel(rank) {
    if (rank === 1) return `<span class="rank-gold">#1 👑</span>`;
    if (rank === 2) return `<span class="rank-silver">#2</span>`;
    if (rank === 3) return `<span class="rank-bronze">#3</span>`;
    return `#${rank}`;
}

function getCardImageUrl(rawId) {
    const num = String(rawId).replace(/\D/g, "");
    return `card/card${num}A.jpg`;
}

// ============ Load target user rank ============
async function fetchUserRank() {
    const points = targetUserData?.urjaPoints || 0;
    if (points === 0) {
        statRank.textContent = "Unranked";
        return;
    }

    try {
        const topQuery = query(
            collection(db, "users"),
            orderBy("urjaPoints", "desc"),
            limit(50)
        );
        const snap = await getDocs(topQuery);
        let rank = null;
        let idx = 1;
        snap.forEach(d => {
            if (d.id === targetUid) rank = idx;
            idx++;
        });
        if (rank) {
            statRank.innerHTML = getRankLabel(rank);
        } else {
            statRank.textContent = "50+";
        }
    } catch (e) {
        statRank.textContent = "—";
    }
}

// ============ Load user cards ============
async function loadUserCards() {
    const cardsContainer = document.getElementById("cardsContainer");
    const cardsCountBadge = document.getElementById("cardsCountBadge");
    const emptyCardsMsg = document.getElementById("emptyCardsMsg");

    try {
        const cardsSnap = await getDocs(
            collection(db, "users", targetUid, "cards")
        );

        cardsContainer.innerHTML = "";

        if (cardsSnap.empty) {
            cardsCountBadge.textContent = "0";
            if (emptyCardsMsg) emptyCardsMsg.style.display = "block";
            return;
        }

        let totalCardsOwned = 0;
        cardsSnap.forEach(docSnap => {
            const cardData = docSnap.data();
            totalCardsOwned += (cardData.quantity || 1);

            const numericId = String(cardData.id || docSnap.id).replace(/\D/g, "");
            const imgUrl = getCardImageUrl(cardData.id || docSnap.id);
            const rarity = cardData.rarity || "Common";

            const cardEl = document.createElement("div");
            cardEl.className = `user-card-item border-${rarity.toLowerCase()}`;
            cardEl.innerHTML = `
                <div class="card-img-wrapper">
                    <img src="${imgUrl}" 
                         onerror="this.onerror=null; this.src='/${imgUrl}';" 
                         alt="Card #${numericId}">
                    ${cardData.quantity > 1 ? `<span class="card-qty-badge">x${cardData.quantity}</span>` : ''}
                </div>
                <div class="card-item-info">
                    <span class="card-item-id">#${numericId}</span>
                    <span class="card-item-rarity rarity-${rarity.toLowerCase()}">${rarity}</span>
                </div>
            `;
            cardsContainer.appendChild(cardEl);
        });

        cardsCountBadge.textContent = totalCardsOwned;

    } catch (err) {
        console.error("Failed to load cards:", err);
        cardsContainer.innerHTML = `<div style="text-align:center; padding:15px; color:#999; font-size:0.8rem;">Could not load card collection.</div>`;
    }
}

// ============ Load user profile ============
async function loadTargetProfile() {
    try {
        const userSnap = await getDoc(doc(db, "users", targetUid));
        if (!userSnap.exists()) {
            displayNameEl.textContent = "User not found";
            return;
        }

        targetUserData = userSnap.data();
        const {
            displayName, username, bio, goal,
            photoURL, urjaPoints, currentStreak, isOnline
        } = targetUserData;

        const name = displayName || username || "Urja Member";
        const handle = username ? `@${username}` : "@user";

        document.title = `${name} — UrjaRise`;
        headerHandleText.textContent = handle;

        if (photoURL) profileAvatar.src = photoURL;
        if (isOnline) onlineBadge.style.display = "block";

        displayNameEl.textContent = name;
        usernameEl.textContent = handle;

        if (bio) {
            bioEl.textContent = bio;
        } else {
            bioEl.style.display = "none";
        }

        if (goal) {
            goalText.textContent = goal;
            goalEl.style.display = "inline-flex";
        }

        if (photoURL) {
            heroBgBlur.style.backgroundImage = `radial-gradient(circle, rgba(255,92,0,0.15), transparent 70%)`;
        }

        statPoints.textContent = (urjaPoints || 0).toLocaleString();
        
        const lastActive = targetUserData.lastActiveDate || "";
        const istNow = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
        const yesterday = new Date(istNow);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = [
            yesterday.getUTCFullYear(),
            String(yesterday.getUTCMonth() + 1).padStart(2, '0'),
            String(yesterday.getUTCDate()).padStart(2, '0')
        ].join('-');
        const effectiveStreak = (lastActive >= yesterdayStr) ? (currentStreak || 0) : 0;
        statStreak.textContent = effectiveStreak;

        fetchUserRank();
        loadUserCards();
        loadFriends();
        loadUserPosts();

    } catch (err) {
        console.error("Failed to load profile:", err);
        displayNameEl.textContent = "Error loading profile";
    }
}

// ============ Load friends ============
async function loadFriends() {
    try {
        const friendsSnap = await getDocs(
            collection(db, "users", targetUid, "growthFriends")
        );

        const count = friendsSnap.size;
        statFriends.textContent = count;
        friendsBadge.textContent = count;

        if (count === 0) {
            friendsSection.style.display = "none";
            return;
        }

        friendsSection.style.display = "block";
        friendsScrollRow.innerHTML = "";

        for (const fDoc of friendsSnap.docs) {
            const fId = fDoc.id;
            try {
                const fProfile = await getDoc(doc(db, "users", fId));
                if (!fProfile.exists()) continue;
                const fd = fProfile.data();

                const bubble = document.createElement("div");
                bubble.className = "friend-bubble";
                bubble.innerHTML = `
                    <img src="${fd.photoURL || 'https://via.placeholder.com/52'}" alt="${fd.displayName || 'User'}">
                    <span>${fd.displayName || fd.username || 'User'}</span>
                `;
                bubble.onclick = () => {
                    window.location.href = `user-profile.html?uid=${fId}`;
                };
                friendsScrollRow.appendChild(bubble);
            } catch (_) {}
        }
    } catch (err) {
        console.error("Failed to load friends:", err);
        statFriends.textContent = "—";
    }
}

// ============ Load posts ============
async function loadUserPosts() {
    try {
        const postsQuery = query(
            collection(db, "posts"),
            where("uid", "==", targetUid)
        );

        const snap = await getDocs(postsQuery);

        postsContainer.innerHTML = "";

        if (snap.empty) {
            emptyPostsMsg.style.display = "block";
            postsCountBadge.textContent = "0";
            return;
        }

        const sortedDocs = snap.docs.sort((a, b) => {
            const aTime = a.data().createdAt?.toMillis?.() || 0;
            const bTime = b.data().createdAt?.toMillis?.() || 0;
            return bTime - aTime;
        });

        postsCountBadge.textContent = sortedDocs.length;

        sortedDocs.forEach((postDoc, idx) => {
            const p = postDoc.data();
            const cat = p.category || "others";
            const card = document.createElement("div");
            card.className = "user-post-card";
            card.style.animationDelay = `${idx * 0.05}s`;

            card.innerHTML = `
                <div class="post-category-badge tag-${cat}">
                    ${categoryEmoji(cat)} ${cat.charAt(0).toUpperCase() + cat.slice(1)}
                </div>
                <h4 class="post-title">${p.goalTitle || p.description?.split(/[.\n]/)[0]?.trim() || "Progress Update"}</h4>
                <p class="post-desc">${p.description || ""}</p>
                <div class="post-footer">
                    <span class="post-date">${formatDate(p.createdAt)}</span>
                    <span class="post-points-chip">⚡ +8 pts</span>
                </div>
            `;
            postsContainer.appendChild(card);
        });

    } catch (err) {
        console.error("Failed to load posts:", err);
        postsContainer.innerHTML = `<div style="text-align:center; padding:30px; color:#999; font-size:0.9rem;">Could not load posts.</div>`;
    }
}

// ============ Friend button state ============
async function checkFriendStatus(viewerUid) {
    if (!viewerUid || viewerUid === targetUid) return;

    heroCta.style.display = "flex";
    addFriendHeaderBtn.style.display = "flex";
    directChatBtn.style.display = "flex";

    try {
        const friendSnap = await getDoc(
            doc(db, "users", viewerUid, "growthFriends", targetUid)
        );
        if (friendSnap.exists()) {
            isFriend = true;
            setFriendBtnState("friends");
            return;
        }

        const reqSnap = await getDoc(
            doc(db, "users", targetUid, "friendRequests", viewerUid)
        );
        if (reqSnap.exists()) {
            requestSent = true;
            setFriendBtnState("sent");
            return;
        }

        setFriendBtnState("default");

    } catch (err) {
        console.error("Friend status check failed:", err);
        setFriendBtnState("default");
    }
}

function setFriendBtnState(state) {
    if (state === "friends") {
        addFriendBtn.innerHTML = `<i class="fas fa-user-check"></i> Growth Friends`;
        addFriendBtn.classList.add("friends");
        addFriendBtn.classList.remove("sent");
        addFriendHeaderBtn.innerHTML = `<i class="fas fa-user-check"></i>`;
        addFriendHeaderBtn.style.background = "var(--green)";
    } else if (state === "sent") {
        addFriendBtn.innerHTML = `<i class="fas fa-clock"></i> Request Sent`;
        addFriendBtn.classList.add("sent");
        addFriendBtn.classList.remove("friends");
        addFriendHeaderBtn.innerHTML = `<i class="fas fa-clock"></i>`;
        addFriendHeaderBtn.style.background = "#aaa";
    } else {
        addFriendBtn.innerHTML = `<i class="fas fa-user-plus"></i> Add Growth Friend`;
        addFriendBtn.classList.remove("sent", "friends");
        addFriendHeaderBtn.innerHTML = `<i class="fas fa-user-plus"></i>`;
        addFriendHeaderBtn.style.background = "var(--primary)";
    }
}

async function sendFriendRequest() {
    if (isFriend || requestSent || !currentUser) return;

    try {
        addFriendBtn.disabled = true;
        addFriendHeaderBtn.disabled = true;

        await setDoc(
            doc(db, "users", targetUid, "friendRequests", currentUser.uid),
            { sentAt: new Date(), from: currentUser.uid }
        );

        requestSent = true;
        setFriendBtnState("sent");
    } catch (err) {
        console.error("Send friend request failed:", err);
        addFriendBtn.disabled = false;
        addFriendHeaderBtn.disabled = false;
        alert("Could not send friend request. Please try again.");
    }
}

// ============ Auth Gate ============
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }
    currentUser = user;

    if (user.uid === targetUid) {
        window.location.href = "profile.html";
        return;
    }

    await loadTargetProfile();
    await checkFriendStatus(user.uid);

    addFriendBtn.addEventListener("click", sendFriendRequest);
    addFriendHeaderBtn.addEventListener("click", sendFriendRequest);

    directChatBtn.addEventListener("click", () => {
        window.location.href = `chat.html?uid=${targetUid}`;
    });
});
