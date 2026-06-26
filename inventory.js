import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    query,
    onSnapshot,
    serverTimestamp,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// FIXED: Consolidated all imports from cards-catalog.js cleanly at the top!
import { STARTER_PACK_CARDS, RARITY_WEIGHT, FULL_CARD_CATALOG } from "./cards-catalog.js";

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
// 2. STATE
// ==========================================
let currentUser = null;
let allCards = [];
const TOTAL_CATALOG_SIZE = FULL_CARD_CATALOG.length;

// ==========================================
// 3. DOM ELEMENTS
// ==========================================
const backBtn = document.getElementById("backBtn");
const userAvatar = document.getElementById("userAvatar");
const cardGrid = document.getElementById("cardGrid");
const emptyState = document.getElementById("emptyState");
const loadingIndicator = document.getElementById("loadingIndicator");
const totalCardsEl = document.getElementById("totalCardsOwned");
const uniqueCardsEl = document.getElementById("uniqueCardsOwned");
const collectionProgressEl = document.getElementById("collectionProgress");
const searchInput = document.getElementById("searchInput");
const filterSelect = document.getElementById("filterSelect");
const sortSelect = document.getElementById("sortSelect");
const goToStoreBtn = document.getElementById("goToStoreBtn");

if (backBtn) backBtn.onclick = () => window.location.href = "feed.html";
if (goToStoreBtn) goToStoreBtn.onclick = () => window.location.href = "store.html";

// ==========================================
// 4. STARTER PACK — CHECK & TRIGGER
// ==========================================
async function checkAndOfferStarterPack() {
    try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists() ? userSnap.data() : {};

        if (userData.starterPackOpened === true) return false;

        const cardsSnap = await getDocs(collection(db, "users", currentUser.uid, "cards"));
        if (!cardsSnap.empty) {
            await setDoc(userRef, { starterPackOpened: true }, { merge: true });
            return false;
        }

        showStarterPackScreen();
        return true;
    } catch (err) {
        console.error("Starter pack check error:", err);
        return false;
    }
}

// ==========================================
// 5. STARTER PACK UI
// ==========================================
function showStarterPackScreen() {
    document.querySelector(".stats-container").style.display = "none";
    document.querySelector(".controls-container").style.display = "none";
    const gridContainer = document.querySelector(".grid-container");
    if (gridContainer) gridContainer.style.display = "none";
    loadingIndicator.style.display = "none";

    const packScreen = document.createElement("div");
    packScreen.id = "starterPackScreen";
    packScreen.className = "starter-pack-screen";
    packScreen.innerHTML = `
        <div class="pack-orb-ring"></div>
        <div class="pack-orb-ring ring-2"></div>
        <div class="pack-center">
            <div class="pack-emoji-wrap" id="packEmojiWrap">
                <span class="pack-emoji-icon">🎁</span>
                <div class="pack-pulse-ring"></div>
            </div>
            <h2 class="pack-title">Starter Pack</h2>
            <p class="pack-subtitle">Your collection begins here.<br>12 cards are waiting to be revealed.</p>
            <button id="openPackBtn" class="open-pack-btn">
                <span>Open Starter Pack</span>
                <i class="fas fa-gift"></i>
            </button>
        </div>
    `;
    document.querySelector(".inventory-layout").appendChild(packScreen);
    document.getElementById("openPackBtn").addEventListener("click", startPackOpening);
}

async function startPackOpening() {
    const packScreen = document.getElementById("starterPackScreen");
    if (!packScreen) return;

    const btn = document.getElementById("openPackBtn");
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

    const emojiWrap = document.getElementById("packEmojiWrap");
    if (emojiWrap) emojiWrap.classList.add("pack-burst");

    await sleep(700);

    packScreen.innerHTML = `
        <div class="reveal-header">
            <h2 class="reveal-title">✨ Your Starter Pack</h2>
            <p class="reveal-subtitle" id="revealCountLabel">Revealing card 1 of ${STARTER_PACK_CARDS.length}...</p>
        </div>
        <div class="reveal-grid" id="revealGrid"></div>
        <button id="collectAllBtn" class="collect-btn" style="display:none;">
            <i class="fas fa-layer-group"></i>&nbsp; Add to My Collection
        </button>
    `;

    const revealGrid = document.getElementById("revealGrid");
    const revealLabel = document.getElementById("revealCountLabel");

    for (let i = 0; i < STARTER_PACK_CARDS.length; i++) {
        const card = STARTER_PACK_CARDS[i];
        revealLabel.textContent = `Revealing card ${i + 1} of ${STARTER_PACK_CARDS.length}...`;
        await revealSingleCard(revealGrid, card);
        await sleep(i < 7 ? 680 : 480);
    }

    revealLabel.textContent = `All ${STARTER_PACK_CARDS.length} cards revealed!`;
    const collectBtn = document.getElementById("collectAllBtn");
    collectBtn.style.display = "flex";
    collectBtn.addEventListener("click", () => saveStarterPackToFirestore(collectBtn));
}

function revealSingleCard(container, card) {
    return new Promise(resolve => {
        const rc = card.rarity.toLowerCase();
        const el = document.createElement("div");
        el.className = `reveal-card ${rc} reveal-hidden`;
        el.innerHTML = `
            <div class="reveal-card-inner">
                <div class="reveal-card-shine"></div>
                <div class="reveal-card-emoji">${card.emoji}</div>
                <div class="reveal-card-name">${card.name}</div>
                <div class="reveal-card-rarity rarity-${rc}">${card.rarity}</div>
                <div class="reveal-card-desc">${card.description}</div>
            </div>
        `;
        container.appendChild(el);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                el.classList.remove("reveal-hidden");
                el.classList.add("reveal-animate");
                resolve();
            });
        });
    });
}

async function saveStarterPackToFirestore(btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>&nbsp; Saving...';

    try {
        await runTransaction(db, async (tx) => {
            const userRef = doc(db, "users", currentUser.uid);
            const userSnap = await tx.get(userRef);
            const userData = userSnap.exists() ? userSnap.data() : {};

            if (userData.starterPackOpened === true) {
                throw new Error("ALREADY_OPENED");
            }

            for (const card of STARTER_PACK_CARDS) {
                const cardRef = doc(db, "users", currentUser.uid, "cards", card.id);
                tx.set(cardRef, {
                    id: card.id,
                    name: card.name,
                    emoji: card.emoji,
                    rarity: card.rarity,
                    description: card.description,
                    quantity: 1,
                    acquiredAt: serverTimestamp(),
                    source: "starter_pack",
                    originalOwner: currentUser.uid
                });
            }
            tx.set(userRef, { starterPackOpened: true }, { merge: true });
        });

        const packScreen = document.getElementById("starterPackScreen");
        if (packScreen) {
            packScreen.classList.add("pack-fade-out");
            await sleep(400);
            packScreen.remove();
        }

        document.querySelector(".stats-container").style.display = "";
        document.querySelector(".controls-container").style.display = "";
        const gridContainer = document.querySelector(".grid-container");
        if (gridContainer) gridContainer.style.display = "";

        loadInventory();

    } catch (err) {
        console.error("Starter pack save error:", err);
        if (err.message === "ALREADY_OPENED") {
            window.location.reload();
        } else {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-layer-group"></i>&nbsp; Try Again';
        }
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ==========================================
// 6. INVENTORY LISTENER
// ==========================================
function loadInventory() {
    loadingIndicator.style.display = "block";
    loadingIndicator.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Loading your vault...';

    onSnapshot(query(collection(db, "users", currentUser.uid, "cards")), (snapshot) => {
        allCards = [];
        snapshot.forEach(d => allCards.push({ id: d.id, ...d.data() }));
        loadingIndicator.style.display = "none";
        updateStatistics();
        renderCards();
    }, (err) => {
        console.error("Inventory error:", err);
        loadingIndicator.innerHTML = "Failed to load inventory.";
    });
}

// ==========================================
// 7. FILTERING, SORTING, RENDERING
// ==========================================
function getProcessedCards() {
    let cards = [...allCards];
    const search = searchInput.value.toLowerCase().trim();
    if (search) cards = cards.filter(c => c.name.toLowerCase().includes(search));
    const filter = filterSelect.value;
    if (filter !== "All") cards = cards.filter(c => c.rarity.toLowerCase() === filter.toLowerCase());
    const sort = sortSelect.value;
    cards.sort((a, b) => {
        switch (sort) {
            case "alphabetical": return a.name.localeCompare(b.name);
            case "quantity": return (b.quantity || 1) - (a.quantity || 1);
            case "rarity": return ((RARITY_WEIGHT[(b.rarity || "common").toLowerCase()] || 0) - (RARITY_WEIGHT[(a.rarity || "common").toLowerCase()] || 0) || 0) - (RARITY_WEIGHT[a.rarity.toLowerCase()] || 0);
            default: {
                const tA = a.acquiredAt?.toDate ? a.acquiredAt.toDate().getTime() : 0;
                const tB = b.acquiredAt?.toDate ? b.acquiredAt.toDate().getTime() : 0;
                return tB - tA;
            }
        }
    });
    return cards;
}

function renderCards() {
    const cards = getProcessedCards();
    cardGrid.innerHTML = "";
    if (allCards.length === 0) { emptyState.style.display = "block"; return; }
    emptyState.style.display = "none";
    if (cards.length === 0) {
        cardGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>No cards match your filter.</h3></div>`;
        return;
    }
    cards.sort((a,b)=> (RARITY_WEIGHT[(b.rarity || "common").toLowerCase()]||0) - (RARITY_WEIGHT[(a.rarity || "common").toLowerCase()]||0));
    cards.forEach(card => {
        const qty = card.quantity || 1;
        const rc = (card.rarity || "common").toLowerCase();
        const el = document.createElement("div");
        el.className = `urja-card ${rc}`;
        el.innerHTML = `
            <div class="card-inner">
                <div class="card-qty-badge">Owned ×${qty}</div>
                <div class="card-emoji">${card.emoji || "🎴"}</div>
                <h3 class="card-name">${card.name || "Unknown"}</h3>
                <p class="card-desc">${card.description || "A mysterious Urja collectible."}</p>
                <div class="card-rarity rarity-${rc}">${card.rarity || "Common"}</div>
            </div>
        `;
        cardGrid.appendChild(el);
    });
}

function updateStatistics() {
    const unique = allCards.length;
    const total = allCards.reduce((s, c) => s + (c.quantity || 1), 0);
    uniqueCardsEl.innerText = unique;
    totalCardsEl.innerText = total;
    collectionProgressEl.innerText = `${unique} / ${TOTAL_CATALOG_SIZE}`;
}

searchInput.addEventListener("input", renderCards);
filterSelect.addEventListener("change", renderCards);
sortSelect.addEventListener("change", renderCards);

// ==========================================
// 8. AUTH
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    currentUser = user;
    if (user.photoURL) userAvatar.src = user.photoURL;

    const packShown = await checkAndOfferStarterPack();
    if (!packShown) loadInventory();
});