import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    collection,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { FULL_CARD_CATALOG } from "./cards-catalog.js";

// ==========================================
// 1. FIREBASE INTERFACE SYSTEM
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
onAuthStateChanged(auth, async (user) => {
    console.log("Auth state running...");

    if (user) {
        currentUser = user; 
        const token = await user.getIdToken();
        console.log("TOKEN:", token);

        await syncWalletBalances();
        loadUserProfile(user);

    } else {
        currentUser = null;
        console.log("No user logged in");
    }
});
window.urjaAuth = auth;
const db = getFirestore(app);

// ==========================================
// 2. RUNTIME INTERNAL STORAGE STATE
// ==========================================
let currentUser = null;
let userPoints = 0;
let userDust = 0;
let ownedCardsMap = new Map();

const WORKING_CATALOG = FULL_CARD_CATALOG;

// Universal helper to guarantee correct numerical digits extraction
function cleanNumericId(rawId) {
    const cleaned = String(rawId).replace(/\D/g, "");
    return cleaned ? parseInt(cleaned, 10) : rawId;
}

// Universal image path builder with fallback protection
function getCardImageUrl(rawId) {
    const num = String(rawId).replace(/\D/g, "");
    return `card/card${num}A.jpg`;
}

// ==========================================
// 3. STORE SPECIFICATION CONFIGURATION DATA
// ==========================================
const PACK_SPECIFICATIONS = {
    basic: {
        id: "basic", name: "Basic Pack", emoji: "🎁", price: 40, size: 1, text: "Contains 1 randomized collection item card.",
        chances: { Common: 0.70, Uncommon: 0.25, Rare: 0.05 }
    },
    growth: {
        id: "growth", name: "Growth Pack", emoji: "⭐", price: 100, size: 2, text: "Contains 2 random cards with enhanced mid-tier chances.",
        chances: { Common: 0.40, Uncommon: 0.35, Rare: 0.20, Epic: 0.05 }
    },
    discipline: {
        id: "discipline", name: "Discipline Pack", emoji: "🔥", price: 200, size: 3, text: "Contains 3 cards. Common tier is fully excluded.",
        chances: { Uncommon: 0.40, Rare: 0.40, Epic: 0.18, Legendary: 0.02 }
    },
    legendary: {
        id: "legendary", name: "Legendary Pack", emoji: "👑", price: 500, size: 5, text: "Contains 5 cards. Minimum 1 Epic or higher guaranteed.",
        chances: { Rare: 0.45, Epic: 0.35, Legendary: 0.18, Mythical: 0.02 },
        guaranteedFilter: ["Epic", "Legendary", "Mythical"]
    },
    mythical: {
        id: "mythical", name: "Mythical Pack", emoji: "🐉", price: 1500, size: 10, text: "Apex box containing 10 cards. Minimum 1 Legendary or higher guaranteed.",
        chances: { Epic: 0.50, Legendary: 0.40, Mythical: 0.09, Divine: 0.01 },
        guaranteedFilter: ["Legendary", "Mythical", "Divine"]
    }
};

const RARITY_GUIDE_DATA = [
    { name: "Common", color: "#51586b", examples: "Cards #1 to #30" },
    { name: "Rare", color: "#1d4ed8", examples: "Cards #31 to #50" },
    { name: "Uncommon", color: "#0f766e", examples: "Cards #51 to #70" },
    { name: "Epic", color: "#701a75", examples: "Cards #71 to #80" },
    { name: "Mythical", color: "#be123c", examples: "Cards #81 to #90" }
];

// ==========================================
// 4. CORE INTERFACE INJECTIONS & RENDER ENGINE
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    setupNavigationClickHandlers();
    renderStaticComponents();
    startDailyDealsEngine();
});

function setupNavigationClickHandlers() {
    const backBtn = document.getElementById("backBtn");
    if (backBtn) backBtn.onclick = () => window.location.href = "feed.html";
}

function renderStaticComponents() {
    const packsGrid = document.getElementById("packsGrid");
    if (packsGrid) {
        packsGrid.innerHTML = Object.values(PACK_SPECIFICATIONS).map(pack => {
            const chartHtml = Object.entries(pack.chances)
                .map(([rarity, chance]) => `<div class="odds-line"><span>${rarity}</span><span>${(chance * 100).toFixed(0)}%</span></div>`)
                .join('');
            
            return `
                <div class="pack-card" id="packCard_${pack.id}">
                    <div class="pack-size-badge">${pack.size} ${pack.size === 1 ? 'Card' : 'Cards'}</div>
                    <div class="pack-art-wrap">${pack.emoji}</div>
                    <h3>${pack.name}</h3>
                    <p>${pack.text}</p>
                    <div class="pack-odds-summary">
                        <div class="odds-line bold"><span>Drop Chances</span></div>
                        ${chartHtml}
                    </div>
                    <button id="btnBuyPack_${pack.id}" class="purchase-btn" disabled>
                        <span>${pack.price} UP</span> ⚡
                    </button>
                </div>
            `;
        }).join('');
        
        Object.values(PACK_SPECIFICATIONS).forEach(p => {
            document.getElementById(`btnBuyPack_${p.id}`).onclick = () => handlePackPurchaseSequence(p);
        });
    }

    const guideContainer = document.getElementById("rarityGuideContainer");
    if (guideContainer) {
        guideContainer.innerHTML = RARITY_GUIDE_DATA.map(item => `
            <div class="guide-box">
                <div class="guide-header">
                    <div class="color-dot" style="background:${item.color}"></div>
                    <span>${item.name}</span>
                </div>
                <div class="guide-examples">${item.examples}</div>
            </div>
        `).join('');
    }
}

// ==========================================
// 5. ROTATING DAILY DEALS SIMULATION
// ==========================================
function startDailyDealsEngine() {
    const dayTimestamp = Math.floor(Date.now() / 86400000);
    const legendaries = WORKING_CATALOG.filter(c => c.rarity === "Mythical" || c.rarity === "Epic" || c.rarity === "Rare");
    const targetDealCard = legendaries.length > 0 ? legendaries[dayTimestamp % legendaries.length] : WORKING_CATALOG[0];
    
    const dealContainer = document.getElementById("dailyDealContainer");
    if (dealContainer && targetDealCard) {
        const discountedPrice = 350; 
        const numericId = cleanNumericId(targetDealCard.id);
        const imgUrl = getCardImageUrl(targetDealCard.id);
        const isDuplicate = ownedCardsMap.has(numericId);
        const lowerRarityClass = targetDealCard.rarity.toLowerCase();

        dealContainer.innerHTML = `
            <div class="deal-card-preview border-${lowerRarityClass}">
                <div class="card-front-content">
                    <img
                        src="${imgUrl}"
                        onerror="this.onerror=null; this.setAttribute('data-tried-fallback', 'true'); this.src='/${imgUrl}';"
                        class="opened-card-image"
                        alt="Card ${numericId}">
                    <div class="card-front-title">Card #${numericId}</div>
                    <div class="card-front-rarity-lbl">${targetDealCard.rarity}</div>
                </div>
            </div>
            <div class="deal-info-pane">
                <div class="deal-badge">TODAY'S SPECIAL CONTRACT</div>
                <h3>Direct Vault Acquisition: Card #${numericId}</h3>
                <p>Acquire this card directly into your vault collection profile. ${isDuplicate ? '<span style="color:#ff0055; font-weight:bold;">(Owned Duplicate)</span>' : ''}</p>
                <div class="price-tag">
                    <span class="original-price">500 UP</span>
                    <span>${discountedPrice} UP</span> ⚡
                </div>
                <button id="buyDailyDealBtn" class="purchase-btn" disabled>
                    <i class="fas fa-gavel"></i> Purchase Direct Card
                </button>
            </div>
        `;

        document.getElementById("buyDailyDealBtn").onclick = () => handleDirectCardPurchase(targetDealCard, discountedPrice);
    }

    function updateDealClock() {
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const diffMs = tomorrow - now;
        const hours = Math.floor(diffMs / 3600000);
        const mins = Math.floor((diffMs % 3600000) / 60000);
        const clockEl = document.getElementById("dealCountdown");
        if (clockEl) clockEl.innerHTML = `<i class="far fa-clock"></i> Resets in: ${hours}h ${mins}m`;
    }
    updateDealClock();
    setInterval(updateDealClock, 60000);
}

// ==========================================
// 7. ACCOUNT SYNC & ATOMIC BACKEND PACK HANDLING
// ==========================================
async function syncWalletBalances() {
    if (!currentUser) return; 
    const btnElements = document.querySelectorAll(".purchase-btn");
    btnElements.forEach(btn => btn.disabled = true);

    try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const data = userSnap.data();
            userPoints = data.urjaPoints || 0;
            userDust = data.cardDust || 0;
            
            document.getElementById("userPointsBalance").textContent = userPoints;
            document.getElementById("userDustBalance").textContent = userDust;
            
            evaluateButtonStates();
        }
    } catch (err) {
        console.error("Wallet indexing synchronization failed:", err);
    }
}

function evaluateButtonStates() {
    Object.values(PACK_SPECIFICATIONS).forEach(p => {
        const button = document.getElementById(`btnBuyPack_${p.id}`);
        if (button) button.disabled = userPoints < p.price;
    });
    
    const dailyBtn = document.getElementById("buyDailyDealBtn");
    if (dailyBtn) dailyBtn.disabled = userPoints < 350;
}

async function handlePackPurchaseSequence(packSpec) {
    const primaryButton = document.getElementById(`btnBuyPack_${packSpec.id}`);
    if (primaryButton) primaryButton.disabled = true;

    const overlay = document.getElementById("packOpeningOverlay");
    const stage = document.getElementById("animationStage");

    overlay.style.display = "flex";
    stage.innerHTML = `
        <div class="vibrating-pack">${packSpec.emoji}</div>
        <div class="opening-title">Contacting UrjaRise Matrix...</div>
        <p style="color:var(--text-secondary)">Authorizing wallet settlement block verification...</p>
    `;

    try {
        const idToken = await auth.currentUser.getIdToken(true);

        // FIXED: Added the specific API endpoint. 
        // ⚠️ IMPORTANT: Change "/api/buy-pack" to your actual backend route! ⚠️
        const response = await fetch("https://urjarise-backend-production.up.railway.app/buyPack", { 
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken}`
            },
            body: JSON.stringify({ packId: packSpec.id })
        });

        // FIXED: Gracefully handle HTML/404 errors before JSON parsing crashes
        if (!response.ok) {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Server rejected transaction.");
            } else {
                throw new Error(`Server returned a ${response.status} error. Make sure your API route is correct.`);
            }
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || "Server rejected transaction mapping validation rules");
        }

        userPoints = data.remainingUP;
        userDust = data.remainingDust;
        
        document.getElementById("userPointsBalance").textContent = userPoints;
        document.getElementById("userDustBalance").textContent = userDust;

        launchCardRevealStepSequence(data.cardsPulled);

    } catch (err) {
        console.error("Purchase execution error:", err);

        stage.innerHTML = `
            <div style="font-size:4rem;color:#ff0055;margin-bottom:16px;">
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <h3>Transaction Refused</h3>
            <p style="margin:10px 0 20px;color:var(--text-secondary)">
                ${err.message}
            </p>
            <button id="closeErrorStageBtn" class="purchase-btn">
                Return to Base
            </button>
        `;

        document.getElementById("closeErrorStageBtn").onclick = () => {
            overlay.style.display = "none";
            syncWalletBalances();
        };
    }
}

async function handleDirectCardPurchase(cardObject, price) {
    alert("Direct purchase system coming soon 🚀");
}

function loadUserProfile(user) {
    const profileImg = document.getElementById("userAvatar");
    const profileName = document.getElementById("userName");

    const fallback = "https://ui-avatars.com/api/?name=Player&background=0f172a&color=fff";

    if (profileName) {
        profileName.textContent = user.displayName || user.email || "Player";
    }

    if (profileImg) {
        profileImg.src = user.photoURL || fallback;
        profileImg.onerror = () => {
            profileImg.src = fallback;
        };
    }
}

function launchCardRevealStepSequence(cards) {
    console.log("Cards received:", cards);

    const stage = document.getElementById("animationStage");

    let html = `
        <h2 style="color:white;text-align:center;margin-bottom:20px;">
            🎉 Pack Opened!
        </h2>
        <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:15px; max-height:60vh; overflow-y:auto; padding:10px;">
    `;

    cards.forEach(card => {
        const parsedId = cleanNumericId(card.id);
        const imgUrl = getCardImageUrl(card.id);

        html += `
            <div style="
                background:#1f1f2e;
                padding:20px;
                border-radius:15px;
                color:white;
                width:200px;
                text-align:center;
                box-shadow:0 0 20px rgba(0,0,0,.4);
            ">
                <img
                    src="${imgUrl}"
                    onerror="this.onerror=null; this.setAttribute('data-tried-fallback', 'true'); this.src='/${imgUrl}';"
                    style="
                        width:100%;
                        border-radius:10px;
                    "
                    alt="Card ${parsedId}"
                >
                <h3 style="margin-top:15px; font-size:1.1rem;">
                    Card #${parsedId}
                </h3>
                <p style="
                    color:#bbbbbb;
                    font-weight:bold;
                    margin: 5px 0;
                ">
                    ${card.rarity}
                </p>
                ${
                    card.isDuplicate
                    ? `<p style="color:#FFD700;font-weight:bold;font-size:0.9rem;margin:0;">
                        Duplicate → Dust Awarded
                       </p>`
                    : `<p style="color:#00ff88;font-weight:bold;font-size:0.9rem;margin:0;">
                        New Card!
                       </p>`
                }
            </div>
        `;
    });

    html += `
        </div>
        <div style="text-align:center;margin-top:25px;">
            <button id="closePackBtn"
                style="
                    padding:14px 30px;
                    font-size:16px;
                    border:none;
                    border-radius:10px;
                    background:#7c3aed;
                    color:white;
                    cursor:pointer;
                ">
                Collect
            </button>
        </div>
    `;

    stage.innerHTML = html;

    document.getElementById("closePackBtn").onclick = () => {
        document.getElementById("packOpeningOverlay").style.display = "none";
        syncWalletBalances();
    };
}
