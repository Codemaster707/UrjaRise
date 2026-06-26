import { RARITY_WEIGHT } from "./cards-catalog.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    addDoc,
    getDocs,
    collection,
    query,
    orderBy,
    onSnapshot,
    serverTimestamp,
    runTransaction,
    where,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ==========================================
// 1. FIREBASE CONFIGURATION
// ==========================================
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

// ==========================================
// 2. RUNTIME STATE
// ==========================================
const params = new URLSearchParams(window.location.search);
const targetUid = params.get("uid");

if (!targetUid) window.location.href = "feed.html";

let currentUser = null;
let roomId = null;
let unsubscribeMessages = null;
let unsubscribeFutureMessages = null;
let targetUserDataGlobal = null;
let isGrowthFriendGlobal = false;

// ==========================================
// 3. DOM ELEMENTS
// ==========================================
const backBtn = document.getElementById("backBtn");
const chatUserInfo = document.getElementById("chatUserInfo");
const chatAvatar = document.getElementById("chatAvatar");
const chatDisplayName = document.getElementById("chatDisplayName");
const chatStatus = document.getElementById("chatStatus");
const messagesContainer = document.getElementById("messagesContainer");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const chatLoading = document.getElementById("chatLoading");
const growthCardBtn = document.getElementById("growthCardBtn");
const notFriendPopup = document.getElementById("notFriendPopup");
const closePopupBtn = document.getElementById("closePopupBtn");
const cardSelectorModal = document.getElementById("cardSelectorModal");
const closeCardModalBtn = document.getElementById("closeCardModalBtn");
const cardGrid = document.getElementById("cardGrid");
const cardViewerModal = document.getElementById("cardViewerModal");
const closeViewerBtn = document.getElementById("closeViewerBtn");
const enlargedCardContainer = document.getElementById("enlargedCardContainer");
const inventorySubtitle = document.getElementById("inventorySubtitle");

// ==========================================
// 4. NAVIGATION
// ==========================================
if (backBtn) backBtn.onclick = () => window.location.href = `user-profile.html?uid=${targetUid}`;
if (chatUserInfo) chatUserInfo.onclick = () => window.location.href = `user-profile.html?uid=${targetUid}`;

// ==========================================
// 5. FUTURE MESSAGE CONTROLS (UNCHANGED)
// ==========================================
function setupFutureMessageControls() {
    if (document.getElementById("futureMessageControls")) return;
    const futureControls = document.createElement("div");
    futureControls.id = "futureMessageControls";
    futureControls.className = "future-controls-container";
    futureControls.innerHTML = `
        <label class="future-toggle-label">
            <input type="checkbox" id="isFutureMsg"> 📨 Send as Future Message
        </label>
        <select id="futureDelaySelect" class="future-dropdown-select" style="display: none;">
            <option value="30">30 Days</option>
            <option value="90">90 Days</option>
            <option value="180">180 Days</option>
            <option value="365">1 Year</option>
            <option value="custom">Custom Date</option>
        </select>
        <input type="date" id="futureCustomDate" class="future-date-picker" style="display: none;">
    `;
    chatForm.parentNode.insertBefore(futureControls, chatForm);

    const isFutureCheckbox = document.getElementById("isFutureMsg");
    const delaySelect = document.getElementById("futureDelaySelect");
    const customDateInput = document.getElementById("futureCustomDate");

    isFutureCheckbox.addEventListener("change", () => {
        const active = isFutureCheckbox.checked;
        delaySelect.style.display = active ? "inline-block" : "none";
        if (!active) customDateInput.style.display = "none";
        else if (delaySelect.value === "custom") customDateInput.style.display = "inline-block";
    });
    delaySelect.addEventListener("change", () => {
        customDateInput.style.display = delaySelect.value === "custom" ? "inline-block" : "none";
    });
}

// ==========================================
// 6. ENERGY METRICS (UNCHANGED)
// ==========================================
function calculateEnergyMetrics(userData) {
    if (!userData) return 50;
    let score = 25;
    score += Math.min(25, (userData.totalLogs || 0) * 2);
    score += Math.min(30, (userData.currentStreak || 0) * 3);
    if (userData.lastActiveDate) {
        const diff = Math.ceil(Math.abs(new Date() - new Date(userData.lastActiveDate)) / 86400000);
        if (diff > 2) score -= Math.min(20, (diff - 2) * 4);
    }
    return Math.max(0, Math.min(100, score));
}

function processEnergyHtmlBadge(score) {
    let color = "#ff3b30", label = "🔴 Low Energy";
    if (score > 25 && score <= 50)  { color = "#ffcc00"; label = "🟡 Building Momentum"; }
    if (score > 50 && score <= 75)  { color = "#007aff"; label = "🔵 Strong Progress"; }
    if (score > 75)                  { color = "#4caf50"; label = "🟢 Peak Energy"; }
    return `<span class="user-header-energy-badge" style="color:${color};">⚡ ${score}% (${label})</span>`;
}

// ==========================================
// 7. LOAD TARGET USER HEADER (UNCHANGED)
// ==========================================
async function loadTargetUserHeader() {
    try {
        const userSnap = await getDoc(doc(db, "users", targetUid));
        let growthFriendStr = "";

        if (currentUser) {
            const friendSnap = await getDoc(doc(db, "users", currentUser.uid, "growthFriends", targetUid));
            if (friendSnap.exists()) {
                isGrowthFriendGlobal = true;
                const linkData = friendSnap.data();
                let connectedDate = "Recent";
                if (linkData.connectedAt) {
                    const d = linkData.connectedAt.toDate ? linkData.connectedAt.toDate() : new Date(linkData.connectedAt);
                    connectedDate = d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
                }
                growthFriendStr = `<div class="friendship-status-subline">🌱 Growth Friends • Since: ${connectedDate}</div>`;
            } else {
                isGrowthFriendGlobal = false;
            }
        }

        if (userSnap.exists()) {
            const profile = userSnap.data();
            targetUserDataGlobal = profile;
            const energyScore = calculateEnergyMetrics(profile);
            chatDisplayName.innerHTML = `${profile.displayName || profile.username || "Urja Member"} ${processEnergyHtmlBadge(energyScore)}`;
            if (profile.photoURL) chatAvatar.src = profile.photoURL;
            chatStatus.innerHTML = `<span>${profile.isOnline ? "Online" : "Offline"}</span>${growthFriendStr}`;
            chatStatus.style.color = profile.isOnline ? "#4caf50" : "var(--text-muted)";
        } else {
            chatDisplayName.textContent = "Unknown User";
        }
    } catch (err) {
        console.error("Header load error:", err);
    }
}

// ==========================================
// 8. MESSAGE STREAM (UNCHANGED LOGIC)
// ==========================================
function listenToMessages() {
    roomId = currentUser.uid < targetUid
        ? `${currentUser.uid}_${targetUid}`
        : `${targetUid}_${currentUser.uid}`;

    let standardMsgs = [];
    let futureMsgs = [];

    const mergeAndRender = () => {
        if (chatLoading) chatLoading.style.display = "none";
        messagesContainer.innerHTML = "";

        const all = [...standardMsgs, ...futureMsgs].sort((a, b) => {
            const tA = a.timestamp ? (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) : 0;
            const tB = b.timestamp ? (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp)) : 0;
            return tA - tB;
        });

        if (all.length === 0) {
            messagesContainer.innerHTML = `<div class="chat-loading">No messages yet. Start your conversation! 👋</div>`;
            return;
        }

        all.forEach(msg => {
            const isMe = msg.senderId === currentUser.uid;
            const wrap = document.createElement("div");

            let timeStr = "", dateStr = "";
            if (msg.timestamp) {
                const d = msg.timestamp.toDate ? msg.timestamp.toDate() : new Date(msg.timestamp);
                timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                dateStr = d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
            }

            if (msg.isFutureCard) {
                wrap.className = "msg-wrapper execution-future-card";
                wrap.style.cssText = "width:100%;display:flex;justify-content:center;";
                let writtenDate = "Past Connection";
                if (msg.createdAt) {
                    const d = msg.createdAt.toDate ? msg.createdAt.toDate() : new Date(msg.createdAt);
                    writtenDate = d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
                }
                wrap.innerHTML = `
                    <div class="future-card-unlocked-bubble">
                        <div class="future-card-header-badge">📨 Future Message Unlocked</div>
                        <div class="future-card-timestamp-sub">Written: ${writtenDate}</div>
                        <div class="future-card-text-body">"${escapeHTML(msg.text)}"</div>
                        <div class="future-card-footer-time">Unlocked at ${timeStr}</div>
                    </div>
                `;
            } else if (msg.isGrowthCard) {
                wrap.className = `msg-wrapper ${isMe ? "me" : "them"}`;
                const cd = msg.cardData;
                const senderLabel = isMe ? "You" : (targetUserDataGlobal?.displayName || "Friend");
                const payload = { ...cd, sender: senderLabel, date: dateStr };
                const safeJson = JSON.stringify(payload).replace(/'/g, "&#39;").replace(/"/g, "&quot;");
                const rc = (cd.rarity || "common").toLowerCase();
                wrap.innerHTML = `
                    <div class="mini-growth-card rarity-${rc}" onclick="window.showEnlargedCard('${safeJson}')">
                        <div class="mini-card-glow"></div>
                        <div class="mini-mascot">${cd.emoji || cd.mascot || "🎴"}</div>
                        <div class="mini-name">${cd.name}</div>
                        <div class="card-badge">${cd.rarity}</div>
                        <span class="msg-time">${timeStr}</span>
                    </div>
                `;
            } else {
                wrap.className = `msg-wrapper ${isMe ? "me" : "them"}`;
                wrap.innerHTML = `
                    <div class="msg-bubble">
                        ${escapeHTML(msg.text)}
                        <span class="msg-time">${timeStr}</span>
                    </div>
                `;
            }
            messagesContainer.appendChild(wrap);
        });
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    };

    unsubscribeMessages = onSnapshot(
        query(collection(db, "chats", roomId, "messages"), orderBy("timestamp", "asc")),
        (snap) => {
            standardMsgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            mergeAndRender();
        },
        err => console.error("Message stream error:", err)
    );

    unsubscribeFutureMessages = onSnapshot(
        query(collection(db, "chats", roomId, "futureMessages")),
        (snap) => {
            const now = new Date();
            futureMsgs = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(m => {
                    const delivery = m.deliveryDate?.toDate ? m.deliveryDate.toDate() : new Date(m.deliveryDate);
                    return now >= delivery;
                })
                .map(m => ({
                    id: m.id,
                    text: m.message,
                    senderId: m.senderId,
                    timestamp: m.deliveryDate,
                    createdAt: m.createdAt,
                    isFutureCard: true
                }));
            mergeAndRender();
        },
        err => console.error("Future messages error:", err)
    );
}

// ==========================================
// 9. SEND MESSAGE (UNCHANGED)
// ==========================================
if (chatForm) {
    chatForm.onsubmit = async (e) => {
        e.preventDefault();
        const text = messageInput.value.trim();
        if (!text || !roomId) return;

        const isFutureCheckbox = document.getElementById("isFutureMsg");
        const delaySelect = document.getElementById("futureDelaySelect");
        const customDateInput = document.getElementById("futureCustomDate");
        const isFuture = isFutureCheckbox?.checked || false;

        messageInput.value = "";

        try {
            if (isFuture) {
                let deliveryDate = new Date();
                if (delaySelect.value === "custom" && customDateInput?.value) {
                    deliveryDate = new Date(customDateInput.value);
                } else {
                    deliveryDate.setDate(deliveryDate.getDate() + parseInt(delaySelect.value, 10));
                }
                await addDoc(collection(db, "chats", roomId, "futureMessages"), {
                    senderId: currentUser.uid,
                    receiverId: targetUid,
                    message: text,
                    createdAt: serverTimestamp(),
                    deliveryDate,
                    delivered: false
                });
                if (isFutureCheckbox) isFutureCheckbox.checked = false;
                if (delaySelect) delaySelect.style.display = "none";
                if (customDateInput) customDateInput.style.display = "none";
                alert("📨 Your message has been safely locked into the future pipeline!");
            } else {
                await addDoc(collection(db, "chats", roomId, "messages"), {
                    text,
                    senderId: currentUser.uid,
                    receiverId: targetUid,
                    timestamp: serverTimestamp()
                });
                const senderSnap = await getDoc(doc(db, "users", currentUser.uid));
                const senderData = senderSnap.exists() ? senderSnap.data() : {};
                await addDoc(collection(db, "users", targetUid, "notifications"), {
                    type: "message",
                    senderId: currentUser.uid,
                    senderName: senderData.displayName || senderData.username || "Urja Member",
                    senderPhoto: senderData.photoURL || "",
                    text,
                    createdAt: serverTimestamp(),
                    seen: false
                });
            }
        } catch (err) {
            console.error("Send message error:", err);
        }
    };
}

function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}

// ==========================================
// 10. CARD INVENTORY — reads from users/{uid}/cards
// ==========================================
async function renderCardGrid() {
    if (!cardGrid) return;
    cardGrid.innerHTML = '<div class="chat-loading">Opening your vault...</div>';
    if (inventorySubtitle) inventorySubtitle.textContent = "Loading your cards...";

    try {
        const snap = await getDocs(collection(db, "users", currentUser.uid, "cards"));
        cardGrid.innerHTML = "";

        if (snap.empty) {
            if (inventorySubtitle) inventorySubtitle.textContent = "No cards available.";
            cardGrid.innerHTML = `
                <div class="chat-loading" style="text-align:center;padding:40px 20px;color:var(--text-muted);">
                    <div style="font-size:2.5rem;margin-bottom:12px;">🎴</div>
                    <p>No cards available.</p>
                    <p style="font-size:0.85rem;margin-top:6px;opacity:0.7;">Open packs from the Urja Store to build your collection.</p>
                </div>
            `;
            return;
        }

        const cards = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
        if (inventorySubtitle) inventorySubtitle.textContent = `${cards.length} card${cards.length !== 1 ? "s" : ""} in your collection`;

        cards.forEach(card => {
            const rc = (card.rarity || "common").toLowerCase();
            const qty = card.quantity || 1;
            const el = document.createElement("div");
            el.className = `growth-card rarity-${rc}`;
            el.innerHTML = `
                <div class="card-shimmer-surface"></div>
                <div class="card-mascot">${card.emoji || "🎴"}</div>
                <div class="card-name">${card.name}</div>
                <div class="card-badge">${card.rarity}</div>
                <div class="card-qty-tag">×${qty} owned</div>
            `;
            el.onclick = () => initiateCardTransfer(card);
            cardGrid.appendChild(el);
        });

    } catch (err) {
        console.error("Card grid error:", err);
        cardGrid.innerHTML = '<div class="chat-loading" style="color:red;">Failed to load your inventory.</div>';
    }
}

// ==========================================
// ==========================================
// ==========================================
// 11. CARD TRANSFER — true ownership transfer
// ==========================================
async function initiateCardTransfer(card) {

    // Prevent sending cards to yourself
    if (targetUid === currentUser.uid) {
        alert("You can't send cards to yourself.");
        return;
    }

    // Close selector
    if (cardSelectorModal) {
        cardSelectorModal.style.display = "none";
    }

    // Ensure room exists
    if (!roomId) return;

    const senderCardRef = doc(
        db,
        "users",
        currentUser.uid,
        "cards",
        card.docId
    );

    const receiverCardRef = doc(
        db,
        "users",
        targetUid,
        "cards",
        card.docId
    );

    try {

        await runTransaction(db, async (tx) => {

            // Verify sender still owns the card
            const senderSnap = await tx.get(senderCardRef);

            if (!senderSnap.exists()) {
                throw new Error("Card no longer in your inventory.");
            }

            const senderData = senderSnap.data();
            const currentQty = senderData.quantity || 1;

            // Check receiver copy
            const receiverSnap = await tx.get(receiverCardRef);

            // Card payload
            const cardPayload = {
                id: card.id,
                docId: card.docId,
                name: card.name,
                emoji: card.emoji || card.mascot || "🎴",
                mascot: card.emoji || card.mascot || "🎴",
                rarity: card.rarity,
                description: card.description || "",
                originalOwner: senderData.originalOwner || currentUser.uid,
                transferCount: (senderData.transferCount || 0) + 1,
                sender: currentUser.displayName || currentUser.email,
                receiver: targetUid
            };

            // Remove from sender
            if (currentQty > 1) {
                tx.update(senderCardRef, {
                    quantity: currentQty - 1
                });
            } else {
                tx.delete(senderCardRef);
            }

            // Add to receiver
            if (receiverSnap.exists()) {

                const receiverQty = receiverSnap.data().quantity || 1;

                tx.update(receiverCardRef, {
                    quantity: receiverQty + 1,
                    lastReceivedAt: new Date()
                });

            } else {

                tx.set(receiverCardRef, {
                    ...cardPayload,
                    quantity: 1,
                    acquiredAt: new Date(),
                    source: "gift",
                    originalOwner: senderData.originalOwner || currentUser.uid,
                    previousOwner: currentUser.uid,
                    lastReceivedAt: new Date()
                });

            }

            // Add message to chat
            const msgRef = doc(collection(db, "chats", roomId, "messages"));

            tx.set(msgRef, {
                isGrowthCard: true,
                cardData: cardPayload,
                senderId: currentUser.uid,
                receiverId: targetUid,
                timestamp: new Date()
            });

        });

        // Notification
        const senderSnap = await getDoc(doc(db, "users", currentUser.uid));
        const senderData = senderSnap.exists() ? senderSnap.data() : {};

        await addDoc(
            collection(db, "users", targetUid, "notifications"),
            {
                type: "card_gift",
                senderId: currentUser.uid,
                senderName:
                    senderData.displayName ||
                    senderData.username ||
                    "Urja Member",
                senderPhoto: senderData.photoURL || "",
                text: `Sent you a ${card.rarity} "${card.name}" card! 🎴`,
                createdAt: serverTimestamp(),
                seen: false
            }
        );

    } catch (err) {

        console.error("Card transfer error:", err);

        if (err.message === "Card no longer in your inventory.") {
            alert("This card is no longer in your inventory.");
        } else {
            alert("Transfer failed. Please try again.");
        }

    }
}
// ==========================================
// 12. ENLARGED CARD VIEWER (UNCHANGED INTERFACE)
// ==========================================
window.showEnlargedCard = function(jsonStr) {
    if (!enlargedCardContainer || !cardViewerModal) return;
    const card = JSON.parse(jsonStr);
    const rc = (card.rarity || "common").toLowerCase();
    enlargedCardContainer.innerHTML = `
        <div class="enlarged-card rarity-${rc}">
            <div class="enlarged-shimmer-overlay"></div>
            <div class="mascot">${card.emoji || card.mascot || "🎴"}</div>
            <div class="title">${card.name}</div>
            <div class="card-badge">${card.rarity}</div>
            <div class="message">"${card.description || card.message || "A treasured Urja collectible."}"</div>
            <div class="meta">
🎁 Sent by <strong>${card.sender}</strong><br>
📅 ${card.date}
</div>
        </div>
    `;
    cardViewerModal.style.display = "flex";
};

// ==========================================
// 13. MODAL CONTROLS (UNCHANGED)
// ==========================================
if (growthCardBtn) {
    growthCardBtn.onclick = () => {
        if (!isGrowthFriendGlobal) {
            if (notFriendPopup) {
                notFriendPopup.classList.add("show");
                setTimeout(() => notFriendPopup.classList.remove("show"), 3500);
            }
        } else {
            renderCardGrid();
            if (cardSelectorModal) cardSelectorModal.style.display = "flex";
        }
    };
}

if (closePopupBtn) closePopupBtn.onclick = () => notFriendPopup.classList.remove("show");
if (closeCardModalBtn) closeCardModalBtn.onclick = () => { cardSelectorModal.style.display = "none"; };
if (closeViewerBtn) closeViewerBtn.onclick = () => { cardViewerModal.style.display = "none"; };

window.addEventListener("click", (e) => {
    if (e.target === cardSelectorModal) cardSelectorModal.style.display = "none";
    if (e.target === cardViewerModal) cardViewerModal.style.display = "none";
});

// ==========================================
// 14. AUTH
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    currentUser = user;
    setupFutureMessageControls();
    loadTargetUserHeader();
    listenToMessages();
});