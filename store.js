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

// Import structural catalog constants from common source
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
    if (user) {
        const token = await user.getIdToken();
        console.log("TOKEN:", token);
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
let ownedCardsMap = new Map(); // Fast lookup table for duplicate systems

// Fallback catalog in case full collection modules contain minor indexing mismatches
const LOCAL_FALLBACK_CATALOG = [
    { id: "c1", name: "Morning Spark", emoji: "🌅", rarity: "Common", description: "Waking up on time builds immediate momentum." },
    { id: "c2", name: "Tiny Wins", emoji: "🌱", rarity: "Common", description: "Small consistent gains lead to massive results." },
    { id: "c3", name: "Focus Seed", emoji: "🌰", rarity: "Common", description: "Plant a thought, reap a consistent lifestyle habit." },
    { id: "u1", name: "Healthy Habit", emoji: "🥗", rarity: "Uncommon", description: "Fueling the machine correctly creates high output." },
    { id: "u2", name: "Early Bird", emoji: "🦅", rarity: "Uncommon", description: "Capturing control over the morning schedule." },
    { id: "r1", name: "Focus Warrior", emoji: "⚔️", rarity: "Rare", description: "Shielding deep work against casual external distraction items." },
    { id: "r2", name: "Consistency Engine", emoji: "🚂", rarity: "Rare", description: "Moving forward regardless of unstable motivation trends." },
    { id: "e1", name: "Iron Discipline", emoji: "🛡️", rarity: "Epic", description: "Uncompromising loyalty to your primary execution targets." },
    { id: "e2", name: "Zen Master", emoji: "🧘", rarity: "Epic", description: "Absolute structural clarity amid chaos." },
    { id: "l1", name: "Time Master", emoji: "⏳", rarity: "Legendary", description: "Bending schedules to fit peak optimal productivity outputs." },
    { id: "l2", name: "Limit Breaker", emoji: "💥", rarity: "Legendary", description: "Surpassing old boundaries to form a new standard definition." },
    { id: "m1", name: "Dragon Discipline", emoji: "🐉", rarity: "Mythical", description: "Ferocious, unstoppable execution power that dominates tasks." },
    { id: "m2", name: "Infinite Focus", emoji: "🌌", rarity: "Mythical", description: "Entering a pure deep work flow state where hours feel like minutes." },
    { id: "d1", name: "Cosmic Growth", emoji: "🪐", rarity: "Divine", description: "Exponential evolution across all sectors of human discipline." }
];

const WORKING_CATALOG = (typeof FULL_CARD_CATALOG !== 'undefined' && FULL_CARD_CATALOG.length > 0) 
    ? FULL_CARD_CATALOG 
    : LOCAL_FALLBACK_CATALOG;

// ==========================================
// 3. STORE SPECIFICATION CONFIGURATION DATA
// ==========================================
const PACK_SPECIFICATIONS = {
    basic: {
        id: "basic", name: "Basic Pack", emoji: "🎁", price: 40, size: 1, text: "Affordable basic collection card standard starters.",
        chances: { Common: 0.70, Uncommon: 0.25, Rare: 0.05 }
    },
    growth: {
        id: "growth", name: "Growth Pack", emoji: "⭐", price: 100, size: 2, text: "Excellent mid-tier choice with expanded drop capabilities.",
        chances: { Common: 0.40, Uncommon: 0.35, Rare: 0.20, Epic: 0.05 }
    },
    discipline: {
        id: "discipline", name: "Discipline Pack", emoji: "🔥", price: 200, size: 3, text: "Guarantees premium cards. Common sets are fully omitted.",
        chances: { Uncommon: 0.40, Rare: 0.40, Epic: 0.18, Legendary: 0.02 }
    },
    legendary: {
        id: "legendary", name: "Legendary Pack", emoji: "👑", price: 500, size: 5, text: "High premium bundle. Guaranteed minimum 1 Epic or higher card.",
        chances: { Rare: 0.45, Epic: 0.35, Legendary: 0.18, Mythical: 0.02 },
        guaranteedFilter: ["Epic", "Legendary", "Mythical"]
    },
    mythical: {
        id: "mythical", name: "Mythical Pack", emoji: "🐉", price: 1500, size: 10, text: "The apex vault experience. Guaranteed minimum 1 Legendary or higher item.",
        chances: { Epic: 0.50, Legendary: 0.40, Mythical: 0.09, Divine: 0.01 },
        guaranteedFilter: ["Legendary", "Mythical", "Divine"]
    }
};

const DUST_VALUES = {
    Common: 5, Uncommon: 10, Rare: 25, Epic: 50, Legendary: 150, Mythical: 500, Divine: 2000
};

const RARITY_GUIDE_DATA = [
    { name: "Common", color: "#51586b", examples: "Morning Spark, Tiny Wins, Focus Seed" },
    { name: "Uncommon", color: "#0f766e", examples: "Healthy Habit, Early Bird, Momentum" },
    { name: "Rare", color: "#1d4ed8", examples: "Focus Warrior, Deep Work, Consistency Engine" },
    { name: "Epic", color: "#701a75", examples: "Iron Discipline, Zen Master, Phoenix Rise" },
    { name: "Legendary", color: "#b45309", examples: "Time Master, Limit Breaker, Focus Emperor" },
    { name: "Mythical", color: "#be123c", examples: "Dragon Discipline, Infinite Focus, Titan Mind" },
    { name: "Divine", color: "#ff007f", examples: "Cosmic Growth, Infinity Soul, Universal Wisdom" }
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
    // Generate Pack configurations UI
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
        
        // Bind dynamic listener items
        Object.values(PACK_SPECIFICATIONS).forEach(p => {
            document.getElementById(`btnBuyPack_${p.id}`).onclick = () => handlePackPurchaseSequence(p);
        });
    }

    // Generate droprate informational panels
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
    // Deterministic selection utilizing calendar calculation metrics
    const dayTimestamp = Math.floor(Date.now() / 86400000);
    const legendaries = WORKING_CATALOG.filter(c => c.rarity === "Legendary" || c.rarity === "Epic");
    const targetDealCard = legendaries.length > 0 ? legendaries[dayTimestamp % legendaries.length] : WORKING_CATALOG[0];
    
    const dealContainer = document.getElementById("dailyDealContainer");
    if (dealContainer && targetDealCard) {
        const discountedPrice = 350; // Special direct collection pricing profile setup
        const isDuplicate = ownedCardsMap.has(targetDealCard.id);
        const lowerRarityClass = targetDealCard.rarity.toLowerCase();

        dealContainer.innerHTML = `
            <div class="deal-card-preview border-${lowerRarityClass}">
                <div class="card-front-content">
                    <div class="card-front-emoji">${targetDealCard.emoji}</div>
                    <div class="card-front-title">${targetDealCard.name}</div>
                    <div class="card-front-rarity-lbl">${targetDealCard.rarity}</div>
                </div>
            </div>
            <div class="deal-info-pane">
                <div class="deal-badge">TODAY'S SPECIAL CONTRACT</div>
                <h3>Direct Vault Acquisition: ${targetDealCard.name}</h3>
                <p>${targetDealCard.description} ${isDuplicate ? '<span style="color:#ff0055; font-weight:bold;">(Owned Duplicate)</span>' : ''}</p>
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

    // Tick clock element mechanics
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
// 6. INTERNAL PACK GENERATION ROULETTE LOGIC
// ==========================================
function generatePackContents(packSpec) {
    const outputs = [];
    let hasGuaranteedCondition = !packSpec.guaranteedFilter;

    for (let i = 0; i < packSpec.size; i++) {
        // Enforce guaranteed parameters on final pull slot if earlier generation steps missed constraints
        if (i === packSpec.size - 1 && !hasGuaranteedCondition) {
            outputs.push(rollCardFromRarities(packSpec.guaranteedFilter));
            continue;
        }

        const pickedRarity = executeProbabilityRoll(packSpec.chances);
        if (packSpec.guaranteedFilter && packSpec.guaranteedFilter.includes(pickedRarity)) {
            hasGuaranteedCondition = true;
        }
        outputs.push(rollCardFromRarities([pickedRarity]));
    }
    return outputs;
}

function executeProbabilityRoll(chancesObject) {
    const randomPointer = Math.random();
    let accumulatedWeight = 0;
    for (const [rarity, probability] of Object.entries(chancesObject)) {
        accumulatedWeight += probability;
        if (randomPointer <= accumulatedWeight) return rarity;
    }
    return Object.keys(chancesObject)[0];
}

function rollCardFromRarities(raritiesArray) {
    const pooledSubgroup = WORKING_CATALOG.filter(c => raritiesArray.includes(c.rarity));
    const finalSelection = pooledSubgroup.length > 0 
        ? pooledSubgroup[Math.floor(Math.random() * pooledSubgroup.length)]
        : WORKING_CATALOG[0];
    
    // Explicit return clone to shield properties
    return { ...finalSelection };
}

// ==========================================
// 7. ACCOUNT SYNC & ATOMIC FIRESTORE TRANSACTIONS
// ==========================================
async function syncWalletBalances() {
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
    // Dynamic evaluations profiles
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
        // Fetch fresh short-lived authorization token directly from current auth state
        const idToken = await auth.currentUser.getIdToken(true);

        // API execution call to your deployed Railway backend service
        const response = await fetch("https://urjarise-backend-production.up.railway.app/buyPack", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken}`
            },
            body: JSON.stringify({ packId: packSpec.id })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || "Server rejected transaction mapping validation rules");
        }

        // Apply synchronized server metrics straight back into client application storage state
        userPoints = data.remainingUP;
        userDust = data.remainingDust;
        
        document.getElementById("userPointsBalance").textContent = userPoints;
        document.getElementById("userDustBalance").textContent = userDust;

        // Pass server-generated random card output arrays straight to visual reveal stages
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
    const overlay = document.getElementById("packOpeningOverlay");
    const stage = document.getElementById("animationStage");

    overlay.style.display = "flex";

    stage.innerHTML = `
        <div class="opening-title">Signing direct distribution registry...</div>
        <p style="color:var(--text-secondary)">
            Processing direct vault acquisition secure transaction...
        </p>
    `;

    try {
        if (userPoints < price) {
            throw new Error("INSUFFICIENT_FUNDS_UP");
        }

        // ⚠️ Backend not ready for this route yet
        return showToast("Direct purchase system coming soon 🚀");

        // close overlay safely
        overlay.style.display = "none";

        await syncWalletBalances();

        // ✅ ONLY CALL REVEAL HERE (correct place)
        launchCardRevealStepSequence([cardObject]);

    } catch (err) {
        overlay.style.display = "none";
        alert(`Transaction refused: ${err.message}`);
        await syncWalletBalances();
    }
}