// ============================================================
// URJA CARD CATALOG — Single source of truth
// All systems (inventory, chat, store, packs) import from here.
// Database path: users/{uid}/cards/{cardId}
// ============================================================

export const RARITY_WEIGHT = {
    mythical: 6,
    legendary: 5,
    epic: 4,
    rare: 3,
    uncommon: 2,
    common: 1
};

// ============================================================
// STARTER PACK — 12 cards, Common + Uncommon only
// Growth, habits, positivity themes. No animals/fantasy.
// ============================================================
export const STARTER_PACK_CARDS = [
    {
        id: "first_step",
        name: "First Step",
        emoji: "👟",
        rarity: "Common",
        description: "Every great journey begins with a single step forward."
    },
    {
        id: "morning_light",
        name: "Morning Light",
        emoji: "🌅",
        rarity: "Common",
        description: "A fresh start is waiting for you every single morning."
    },
    {
        id: "hydration",
        name: "Hydration Hero",
        emoji: "💧",
        rarity: "Common",
        description: "Small habits build big transformations. Drink up."
    },
    {
        id: "focus_mode",
        name: "Focus Mode",
        emoji: "🎯",
        rarity: "Common",
        description: "One task at a time. Clarity beats chaos every time."
    },
    {
        id: "rest_well",
        name: "Rest Well",
        emoji: "🌙",
        rarity: "Common",
        description: "Recovery is part of the process. Rest without guilt."
    },
    {
        id: "kindness_spark",
        name: "Kindness Spark",
        emoji: "🤝",
        rarity: "Common",
        description: "A small act of kindness can change someone's entire day."
    },
    {
        id: "small_win",
        name: "Small Win",
        emoji: "✅",
        rarity: "Common",
        description: "Celebrate every win, no matter how small it seems."
    },
    {
        id: "page_turner",
        name: "Page Turner",
        emoji: "📖",
        rarity: "Uncommon",
        description: "Ten minutes of reading feeds a mind for a lifetime."
    },
    {
        id: "consistency",
        name: "Consistency",
        emoji: "🔗",
        rarity: "Uncommon",
        description: "Show up again today. The chain is stronger than you know."
    },
    {
        id: "movement",
        name: "Movement",
        emoji: "🏃",
        rarity: "Uncommon",
        description: "Your body is built to move. Give it what it needs."
    },
    {
        id: "reflection",
        name: "Reflection",
        emoji: "🪞",
        rarity: "Uncommon",
        description: "Pause. Breathe. Check in with yourself honestly."
    },
    {
        id: "gratitude",
        name: "Gratitude",
        emoji: "🌻",
        rarity: "Uncommon",
        description: "Finding one good thing daily rewires your whole perspective."
    }
];

// ============================================================
// FULL CATALOG — Future store / pack expansions
// Starter pack draws from STARTER_PACK_CARDS only.
// ============================================================
export const FULL_CARD_CATALOG = [
    ...STARTER_PACK_CARDS,

    // === RARE ===
    {
        id: "deep_work",
        name: "Deep Work",
        emoji: "⚡",
        rarity: "Rare",
        description: "Two hours of deep focus outperforms eight hours of distraction."
    },
    {
        id: "cold_start",
        name: "Cold Start",
        emoji: "🧊",
        rarity: "Rare",
        description: "Starting is the hardest part. You've already won by beginning."
    },
    {
        id: "compounding",
        name: "Compounding",
        emoji: "📈",
        rarity: "Rare",
        description: "1% better every day. The results surprise you in a year."
    },
    {
        id: "resilience",
        name: "Resilience",
        emoji: "🪨",
        rarity: "Rare",
        description: "You've survived every hard day so far. That record holds."
    },

    // === EPIC ===
    {
        id: "breakthrough",
        name: "Breakthrough",
        emoji: "🔓",
        rarity: "Epic",
        description: "The wall you've been hitting is about to become a door."
    },
    {
        id: "mentor_mind",
        name: "Mentor Mind",
        emoji: "🧠",
        rarity: "Epic",
        description: "Wisdom shared multiplies. Teach what you know freely."
    },
    {
        id: "flow_state",
        name: "Flow State",
        emoji: "🌊",
        rarity: "Epic",
        description: "When challenge meets skill, time disappears. Chase that feeling."
    },

    // === LEGENDARY ===
    {
        id: "north_star",
        name: "North Star",
        emoji: "⭐",
        rarity: "Legendary",
        description: "You have a purpose that pulls you forward. Trust it completely."
    },
    {
        id: "legacy_builder",
        name: "Legacy Builder",
        emoji: "🏛️",
        rarity: "Legendary",
        description: "What you build today will outlast you. Build with intention."
    },

    // === MYTHICAL ===
    {
        id: "urja_prime",
        name: "Urja Prime",
        emoji: "🔥",
        rarity: "Mythical",
        description: "Pure energy. Pure intention. The rarest force in the universe: a mind fully alive."
    }
];

// ============================================================
// STARTER PACK METADATA
// ============================================================
export const STARTER_PACK_META = {
    id: "starter_pack",
    name: "Starter Pack",
    emoji: "🎁",
    description: "Your journey begins here. 12 cards to start your collection.",
    cardCount: 12
};