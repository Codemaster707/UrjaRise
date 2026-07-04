// ============================================================
// URJARISE CARD CATALOG
// Single source of truth for frontend numerical references.
// Images are loaded as: card/card<ID>A.jpg
// ============================================================

// =====================================
// RARITY WEIGHTS
// =====================================
export const RARITY_WEIGHT = {
    mythical: 5,
    epic: 4,
    rare: 3,
    uncommon: 2,
    common: 1
};

// =====================================
// STARTER PACK
// Cards 1-12
// =====================================
export const STARTER_PACK_CARDS = [];

for (let i = 1; i <= 12; i++) {
    STARTER_PACK_CARDS.push({
        id: i,
        rarity: i <= 7 ? "Common" : "Uncommon"
    });
}

// =====================================
// FULL CARD CATALOG (90 Cards)
// =====================================
export const FULL_CARD_CATALOG = [];

// 1–30 Common
for (let i = 1; i <= 30; i++) {
    FULL_CARD_CATALOG.push({
        id: i,
        rarity: "Common"
    });
}

// 31–50 Rare (Intentional sequence)
for (let i = 31; i <= 50; i++) {
    FULL_CARD_CATALOG.push({
        id: i,
        rarity: "Rare"
    });
}

// 51–70 Uncommon
for (let i = 51; i <= 70; i++) {
    FULL_CARD_CATALOG.push({
        id: i,
        rarity: "Uncommon"
    });
}

// 71–80 Epic
for (let i = 71; i <= 80; i++) {
    FULL_CARD_CATALOG.push({
        id: i,
        rarity: "Epic"
    });
}

// 81–90 Mythical
for (let i = 81; i <= 90; i++) {
    FULL_CARD_CATALOG.push({
        id: i,
        rarity: "Mythical"
    });
}

// =====================================
// STARTER PACK META
// =====================================
export const STARTER_PACK_META = {
    id: "starter_pack",
    cardCount: 12
};