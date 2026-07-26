/**
 * UrjaRise — Chat Module
 * ---------------------------------------------------------------------------
 * Vanilla JS (ES Modules) + Firebase Auth + Cloud Firestore. No backend.
 *
 * Firestore layout:
 * users/{uid}                          { displayName, photoURL, isOnline }
 * users/{uid}/growthFriends/{friendUid}  (existence = friendship, per user-profile.js)
 * users/{uid}/cards/{cardId}            { id, rarity, quantity, ownerHistory[], acquiredAt, lastTransferredAt }
 * users/{uid}/notifications/{notifId}   { senderId, text, seen, createdAt }
 * chats/{chatId}                       { participants[], lastMessage, lastSenderId, timestamp }
 * chats/{chatId}/messages/{autoId}
 *
 * chatId is always [uidA, uidB].sort().join("_") — never created twice.
 */

import { app } from "./firebase-config.js";

import {
    getFirestore,
    doc,
    collection,
    addDoc,
    setDoc,
    getDoc,
    onSnapshot,
    query,
    orderBy,
    runTransaction,
    serverTimestamp,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// =============================================================================
// FIREBASE
// =============================================================================

const db = getFirestore(app);
const auth = getAuth(app);

/** Firestore reference helpers — single source of truth for database paths. */
const FirestoreRefs = {
    getUserRef: (uid) => doc(db, "users", uid),
    getChatRef: (chatId) => doc(db, "chats", chatId),
    getMessagesRef: (chatId) => collection(db, "chats", chatId, "messages"),
    getInventoryRef: (uid) => collection(db, "users", uid, "cards"),
    getCardRef: (uid, cardId) => doc(db, "users", uid, "cards", String(cardId)),
    getGrowthFriendRef: (uid, friendUid) => doc(db, "users", uid, "growthFriends", friendUid),
    getNotificationsRef: (uid) => collection(db, "users", uid, "notifications")
};

/** Deterministic, duplicate-proof chat id for two participants. */
function buildChatId(uidA, uidB) {
    return [uidA, uidB].sort().join("_");
}

// =============================================================================
// CONSTANTS
// =============================================================================

const RARITY_WEIGHT = {
    Mythical: 1,
    Legendary: 2,
    Epic: 3,
    Rare: 4,
    Uncommon: 5,
    Common: 6
};

const CARD_IMAGE_BASE_PATH = "card";
const CARD_IMAGE_FALLBACK = "https://via.placeholder.com/150";

function getCardImage(cardId) {
    return `${CARD_IMAGE_BASE_PATH}/${cardId}.jpg`;
}

// =============================================================================
// UTILITIES
// =============================================================================

function escapeHTML(str) {
    return String(str ?? "").replace(/[&<>'"]/g, (tag) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
    }[tag]));
}

function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key.startsWith("on") && typeof value === "function") {
            node.addEventListener(key.slice(2).toLowerCase(), value);
        } else {
            node.setAttribute(key, value);
        }
    }
    for (const child of [].concat(children)) {
        if (child) node.appendChild(child);
    }
    return node;
}

function setImageWithFallback(imgEl, src, fallback = CARD_IMAGE_FALLBACK) {
    imgEl.addEventListener("error", () => { imgEl.src = fallback; }, { once: true });
    imgEl.src = src;
}

const Toast = (() => {
    let container = null;

    function ensureContainer() {
        if (container) return container;
        container = el("div", { class: "urja-toast-container" });
        Object.assign(container.style, {
            position: "fixed",
            bottom: "16px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            zIndex: "9999",
            width: "min(92vw, 360px)"
        });
        document.body.appendChild(container);
        return container;
    }

    function show(message, { type = "info", actionLabel = null, onAction = null, duration = 4000 } = {}) {
        const c = ensureContainer();
        const colors = { info: "#2d3748", success: "#1f8a4c", error: "#b3261e" };

        const toast = el("div", { class: `urja-toast urja-toast-${type}` });
        Object.assign(toast.style, {
            background: colors[type] || colors.info,
            color: "#fff",
            padding: "10px 14px",
            borderRadius: "10px",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            boxShadow: "0 4px 14px rgba(0,0,0,0.25)"
        });

        toast.appendChild(el("span", { text: message }));

        let timer = null;
        if (actionLabel && typeof onAction === "function") {
            const btn = el("button", { text: actionLabel });
            Object.assign(btn.style, {
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.6)",
                color: "#fff",
                borderRadius: "6px",
                padding: "4px 8px",
                cursor: "pointer",
                flexShrink: "0"
            });
            btn.addEventListener("click", () => {
                clearTimeout(timer);
                toast.remove();
                onAction();
            });
            toast.appendChild(btn);
        }

        c.appendChild(toast);
        timer = setTimeout(() => toast.remove(), duration);
    }

    return {
        info: (msg, opts) => show(msg, { ...opts, type: "info" }),
        success: (msg, opts) => show(msg, { ...opts, type: "success" }),
        error: (msg, opts) => show(msg, { ...opts, type: "error" })
    };
})();

// =============================================================================
// CHAT APPLICATION
// =============================================================================

class ChatApp {
    constructor() {
        // ---- State -----------------------------------------------------------
        this.currentUser = null;
        this.otherUserUid = null;
        this.chatId = null;

        this.inventory = [];
        this.selectedCard = null;
        this.selectedQuantity = 1;
        this.isTransferring = false;

        this.messageNodesById = new Map();

        this.unsubscribeMessages = null;
        this.unsubscribeInventory = null;
        this.unsubscribeProfile = null;

        // ---- DOM Cache -------------------------------------------------------
        this.dom = {
            backBtn: document.getElementById("backBtn"),
            chatDisplayName: document.getElementById("chatDisplayName"),
            chatStatus: document.getElementById("chatStatus"),
            chatAvatar: document.getElementById("chatAvatar"),
            messagesContainer: document.getElementById("messagesContainer"),
            chatForm: document.getElementById("chatForm"),
            messageInput: document.getElementById("messageInput"),
            sendBtn: document.getElementById("sendBtn"),
            growthCardBtn: document.getElementById("growthCardBtn"),

            notFriendPopup: document.getElementById("notFriendPopup"),
            closePopupBtn: document.getElementById("closePopupBtn"),

            cardSelectorModal: document.querySelector(".card-modal-overlay"),
            closeCardModalBtn: document.getElementById("closeCardModalBtn"),
            cardGrid: document.getElementById("cardGrid"),

            quantityModal: document.getElementById("quantityModal"),
            quantityCardImage: document.getElementById("quantityCardImage"),
            quantityCardTitle: document.getElementById("quantityCardTitle"),
            quantityValue: document.getElementById("quantityValue"),
            minusQty: document.getElementById("minusQty"),
            plusQty: document.getElementById("plusQty"),
            cancelTransfer: document.getElementById("cancelTransfer"),
            confirmTransfer: document.getElementById("confirmTransfer"),

            cardViewerModal: document.getElementById("cardViewerModal") || document.querySelector(".card-viewer-overlay"),
            closeViewerBtn: document.getElementById("closeViewerBtn"),
            enlargedCardContainer: document.getElementById("enlargedCardContainer")
        };
    }

    init() {
        const params = new URLSearchParams(window.location.search);
        this.otherUserUid = params.get("uid");

        if (!this.otherUserUid) {
            Toast.error("No user specified for this chat.");
            window.location.href = "/";
            return;
        }

        this.bindEvents();

        onAuthStateChanged(auth, (user) => {
            if (!user) {
                window.location.href = "/auth.html";
                return;
            }
            
            this.destroy();

            this.currentUser = user;

            if (this.otherUserUid === this.currentUser.uid) {
                Toast.error("You cannot chat with yourself.");
                window.location.href = "/";
                return;
            }

            this.chatId = buildChatId(this.currentUser.uid, this.otherUserUid);
            this.loadOtherUserProfile();
            this.loadMessages();
        });

        window.addEventListener("online", () => Toast.success("Back online."));
        window.addEventListener("offline", () => Toast.error("You are offline. Messages will send once reconnected."));
        window.addEventListener("beforeunload", () => this.destroy());
    }

    bindEvents() {
        const d = this.dom;

        d.chatForm?.addEventListener("submit", (e) => this.handleSendMessage(e));
        d.backBtn?.addEventListener("click", () => window.history.back());

        d.growthCardBtn?.addEventListener("click", () => this.openCardSelector());
        d.closePopupBtn?.addEventListener("click", () => {
            clearTimeout(this._notFriendPopupTimer);
            d.notFriendPopup?.classList.remove("show");
        });
        d.closeCardModalBtn?.addEventListener("click", () => {
            this.hide(d.cardSelectorModal);
            this.hide(d.quantityModal);
        });
        d.closeViewerBtn?.addEventListener("click", () => this.hide(d.cardViewerModal));

        d.minusQty?.addEventListener("click", () => this.stepQuantity(-1));
        d.plusQty?.addEventListener("click", () => this.stepQuantity(1));
        d.cancelTransfer?.addEventListener("click", () => this.closeQuantityModal());
        d.confirmTransfer?.addEventListener("click", () => this.handleConfirmTransfer());
    }

    destroy() {
        this.unsubscribeMessages?.();
        this.unsubscribeInventory?.();
        this.unsubscribeProfile?.();
        this.unsubscribeMessages = null;
        this.unsubscribeInventory = null;
        this.unsubscribeProfile = null;
    }

    // ---------------------------------------------------------------------
    // PROFILE
    // ---------------------------------------------------------------------

    loadOtherUserProfile() {
        const ref = FirestoreRefs.getUserRef(this.otherUserUid);

        this.unsubscribeProfile = onSnapshot(
            ref,
            (snap) => this.renderProfile(snap.exists() ? snap.data() : null),
            (error) => {
                console.error("Profile listener error:", error);
                Toast.error("Couldn't load user profile.", {
                    actionLabel: "Retry",
                    onAction: () => this.loadOtherUserProfile()
                });
            }
        );
    }

    renderProfile(data) {
        const d = this.dom;
        if (!data) {
            if (d.chatDisplayName) d.chatDisplayName.textContent = "Unknown User";
            if (d.chatStatus) d.chatStatus.textContent = "Account unavailable";
            return;
        }
        if (d.chatDisplayName) d.chatDisplayName.textContent = data.displayName || "User";
        if (d.chatStatus) d.chatStatus.textContent = data.isOnline ? "Online" : "Offline";
        if (d.chatAvatar && data.photoURL) setImageWithFallback(d.chatAvatar, data.photoURL);
    }

    // ---------------------------------------------------------------------
    // MESSAGING & REALTIME NOTIFICATIONS
    // ---------------------------------------------------------------------

    loadMessages() {
        const q = query(FirestoreRefs.getMessagesRef(this.chatId), orderBy("timestamp", "asc"));

        this.unsubscribeMessages = onSnapshot(
            q,
            { includeMetadataChanges: true },
            (snapshot) => this.applyMessageChanges(snapshot),
            (error) => {
                console.error("Message listener error:", error);
                this.dom.messagesContainer.replaceChildren(
                    el("div", { class: "chat-loading", text: "Failed to load messages." })
                );
                Toast.error("Connection issue while loading chat.", {
                    actionLabel: "Retry",
                    onAction: () => this.loadMessages()
                });
            }
        );
    }

    applyMessageChanges(snapshot) {
        const container = this.dom.messagesContainer;
        const emptyState = container.querySelector(".chat-loading");
        if (emptyState) emptyState.remove();

        const wasNearBottom =
            container.scrollHeight - container.scrollTop - container.clientHeight < 120;

        snapshot.docChanges().forEach((change) => {
            const data = change.doc.data();
            const id = change.doc.id;
            const isPending = change.doc.metadata.hasPendingWrites;

            if (change.type === "removed") {
                this.messageNodesById.get(id)?.remove();
                this.messageNodesById.delete(id);
                return;
            }

            const node = this.renderMessageNode(data, id, isPending);
            this.messageNodesById.set(id, node);

            const referenceNode = container.children[change.newIndex] || null;
            if (change.type === "added") {
                container.insertBefore(node, referenceNode);
            } else if (change.type === "modified") {
                const existing = container.children[change.oldIndex];
                existing?.remove();
                container.insertBefore(node, container.children[change.newIndex] || null);
            }
        });

        if (snapshot.empty) {
            container.replaceChildren(
                el("div", { class: "chat-loading", text: "Say hi to start the conversation!" })
            );
        }

        if (wasNearBottom) {
            container.scrollTop = container.scrollHeight;
        }
    }

    renderMessageNode(msg, messageId, isPending) {
        const isMine = msg.senderId === this.currentUser.uid;
        if (msg.type === "card") {
            return this.renderCardMessage(msg, messageId, isMine, isPending);
        }
        return this.renderTextMessage(msg, messageId, isMine, isPending);
    }

    renderTextMessage(msg, messageId, isMine, isPending) {
        const wrapper = el("div", {
            class: `message ${isMine ? "message-sent" : "message-received"}`,
            "data-message-id": messageId
        });
        wrapper.style.opacity = isPending ? "0.6" : "1";

        const bubble = el("div", { class: "message-bubble" });
        bubble.textContent = msg.text || "";
        wrapper.appendChild(bubble);
        return wrapper;
    }

    renderCardMessage(msg, messageId, isMine, isPending) {
        const wrapper = el("div", {
            class: `message ${isMine ? "message-sent" : "message-received"}`,
            "data-message-id": messageId
        });
        wrapper.style.opacity = isPending ? "0.6" : "1";

        const bubble = el("div", { class: "message-bubble card-message" });
        bubble.style.cursor = "pointer";

        const img = el("img", { class: "chat-card-img", alt: `${msg.rarity} Card` });
        setImageWithFallback(img, getCardImage(msg.cardId));

        const info = el("div", { class: "card-msg-info" }, [
            el("strong", { text: `${msg.rarity} Card #${msg.cardId}` }),
            el("span", { text: `Quantity: ${msg.quantity || 1}` })
        ]);

        bubble.append(img, info);
        bubble.addEventListener("click", () => this.openCardViewer(msg.cardId));
        wrapper.appendChild(bubble);
        return wrapper;
    }

    async handleSendMessage(event) {
        event.preventDefault();
        const input = this.dom.messageInput;
        const text = input.value.trim();
        if (!text) return;

        input.value = "";

        try {
            await this.touchChatSummary(text);

            // 1. Add message to chat history
            await addDoc(FirestoreRefs.getMessagesRef(this.chatId), {
                senderId: this.currentUser.uid,
                receiverId: this.otherUserUid,
                text,
                type: "text",
                timestamp: serverTimestamp()
            });

            // 2. Add notification record for receiver matching feed.js schema
            await addDoc(FirestoreRefs.getNotificationsRef(this.otherUserUid), {
                senderId: this.currentUser.uid,
                text: text,
                seen: false,
                createdAt: serverTimestamp()
            });
        } catch (error) {
            console.error("Error sending message:", error);
            input.value = text;
            Toast.error("Message failed to send.", {
                actionLabel: "Retry",
                onAction: () => this.handleSendMessage(event)
            });
        }
    }

    async touchChatSummary(lastMessage) {
        await setDoc(FirestoreRefs.getChatRef(this.chatId), {
            lastMessage,
            lastSenderId: this.currentUser.uid,
            timestamp: serverTimestamp(),
            participants: [this.currentUser.uid, this.otherUserUid]
        }, { merge: true });
    }

    // ---------------------------------------------------------------------
    // INVENTORY
    // ---------------------------------------------------------------------

    async openCardSelector() {
        const isFriend = await this.verifyFriendship();
        if (!isFriend) {
            this.showNotFriendPopup();
            return;
        }

        this.show(this.dom.cardSelectorModal, "flex");

        if (!this.unsubscribeInventory) {
            this.startInventoryListener();
        }
    }

    showNotFriendPopup() {
        const popup = this.dom.notFriendPopup;
        if (!popup) return;
        popup.classList.add("show");
        clearTimeout(this._notFriendPopupTimer);
        this._notFriendPopupTimer = setTimeout(() => popup.classList.remove("show"), 3500);
    }

    async verifyFriendship() {
        try {
            const friendSnap = await getDoc(
                FirestoreRefs.getGrowthFriendRef(this.currentUser.uid, this.otherUserUid)
            );
            return friendSnap.exists();
        } catch (error) {
            console.error("Friend verification failed:", error);
            Toast.error("Couldn't verify friendship status.");
            return false;
        }
    }

    startInventoryListener() {
        if (!this.dom.cardGrid) return;

        this.dom.cardGrid.replaceChildren(
            el("div", { class: "chat-loading", text: "Loading inventory..." })
        );

        this.unsubscribeInventory = onSnapshot(
            FirestoreRefs.getInventoryRef(this.currentUser.uid),
            (snapshot) => {
                this.inventory = snapshot.docs
                    .map((d) => d.data())
                    .filter((card) => (card.quantity ?? 0) > 0)
                    .sort((a, b) => {
                        const weightDiff = (RARITY_WEIGHT[a.rarity] ?? 99) - (RARITY_WEIGHT[b.rarity] ?? 99);
                        return weightDiff !== 0 ? weightDiff : a.id - b.id;
                    });

                this.renderInventory();
            },
            (error) => {
                console.error("Inventory listener error:", error);
                this.dom.cardGrid.replaceChildren(
                    el("div", { class: "chat-loading", text: "Failed to load inventory." })
                );
                Toast.error("Couldn't load your cards.", {
                    actionLabel: "Retry",
                    onAction: () => {
                        this.unsubscribeInventory?.();
                        this.unsubscribeInventory = null;
                        this.startInventoryListener();
                    }
                });
            }
        );
    }

    renderInventory() {
        const grid = this.dom.cardGrid;
        grid.replaceChildren();

        if (this.inventory.length === 0) {
            grid.appendChild(el("p", {
                class: "inventory-empty",
                text: "Your inventory is empty."
            }));
            return;
        }

        this.inventory.forEach((card) => grid.appendChild(this.renderInventoryCard(card)));
    }

    // ---------------------------------------------------------------------
    // QUANTITY SELECTOR
    // ---------------------------------------------------------------------

    renderInventoryCard(card) {
        const img = el("img", { alt: `Card ${card.id}` });
        setImageWithFallback(img, getCardImage(card.id));

        const details = el("div", { class: "card-details" }, [
            el("span", { class: `card-rarity ${String(card.rarity).toLowerCase()}`, text: card.rarity }),
            el("span", { class: "card-id", text: `#${card.id}` }),
            el("span", { class: "card-qty", text: `Owned ×${card.quantity}` })
        ]);

        const transferBtn = el("button", { class: "transfer-init-btn", text: "Transfer" });
        transferBtn.addEventListener("click", () => this.openQuantityModal(card));

        return el("div", { class: "inventory-card" }, [img, details, transferBtn]);
    }

    openQuantityModal(card) {
        this.selectedCard = card;
        this.selectedQuantity = 1;

        const d = this.dom;
        if (d.quantityCardTitle) d.quantityCardTitle.textContent = `${card.rarity} Card #${card.id}`;
        if (d.quantityCardImage) setImageWithFallback(d.quantityCardImage, getCardImage(card.id));
        if (d.quantityValue) d.quantityValue.textContent = String(this.selectedQuantity);

        this.show(d.quantityModal, "flex");
    }

    closeQuantityModal() {
        this.hide(this.dom.quantityModal);
        this.selectedCard = null;
    }

    stepQuantity(delta) {
        if (!this.selectedCard) return;
        const next = this.selectedQuantity + delta;
        if (next < 1 || next > this.selectedCard.quantity) return;
        this.selectedQuantity = next;
        if (this.dom.quantityValue) this.dom.quantityValue.textContent = String(next);
    }

    // ---------------------------------------------------------------------
    // CARD TRANSFER & NOTIFICATION TRANSACTION
    // ---------------------------------------------------------------------

    async handleConfirmTransfer() {
        if (this.isTransferring || !this.selectedCard) return;

        this.isTransferring = true;
        this.setTransferButtonLoading(true);

        try {
            await this.executeTransferTransaction(this.selectedCard, this.selectedQuantity);
            Toast.success("Card transferred successfully!");
            this.hide(this.dom.quantityModal);
            this.hide(this.dom.cardSelectorModal);
        } catch (error) {
            console.error("Transfer failed:", error);
            Toast.error(error.message || "Transfer failed. Please try again.");
        } finally {
            this.setTransferButtonLoading(false);
            this.isTransferring = false;
            this.selectedCard = null;
        }
    }

    setTransferButtonLoading(isLoading) {
        const btn = this.dom.confirmTransfer;
        if (!btn) return;
        btn.disabled = isLoading;
        btn.textContent = isLoading ? "Sending..." : "Send";
    }

   async executeTransferTransaction(card, transferQty) {
        const senderUid = this.currentUser.uid;
        const receiverUid = this.otherUserUid;

        if (senderUid === receiverUid) {
            throw new Error("You cannot transfer a card to yourself.");
        }
        if (!Number.isInteger(transferQty) || transferQty < 1) {
            throw new Error("Transfer quantity must be a positive whole number.");
        }

        const senderCardRef = FirestoreRefs.getCardRef(senderUid, card.id);
        const receiverCardRef = FirestoreRefs.getCardRef(receiverUid, card.id);
        const receiverUserRef = FirestoreRefs.getUserRef(receiverUid);
        const messagesRef = FirestoreRefs.getMessagesRef(this.chatId);
        const chatRef = FirestoreRefs.getChatRef(this.chatId);
        
        // Prepare notification document reference
        const receiverNotifRef = doc(FirestoreRefs.getNotificationsRef(receiverUid));

        await runTransaction(db, async (transaction) => {
            // ---- Reads (must happen before any writes in a transaction) -----
            const [receiverUserSnap, senderCardSnap, receiverCardSnap] = await Promise.all([
                transaction.get(receiverUserRef),
                transaction.get(senderCardRef),
                transaction.get(receiverCardRef)
            ]);

            if (!receiverUserSnap.exists()) {
                throw new Error("Recipient account no longer exists.");
            }
            if (!senderCardSnap.exists()) {
                throw new Error("You no longer own this card.");
            }

            const senderData = senderCardSnap.data();
            if (!senderData.id || !senderData.rarity) {
                throw new Error("Card record is corrupted.");
            }
            if ((senderData.quantity ?? 0) < transferQty) {
                throw new Error("You don't have enough of this card.");
            }

            // ---- Writes -------------------------------------------------------
            const remaining = senderData.quantity - transferQty;
            if (remaining <= 0) {
                transaction.delete(senderCardRef);
            } else {
                transaction.update(senderCardRef, { quantity: remaining });
            }

            if (receiverCardSnap.exists()) {
                transaction.update(receiverCardRef, {
                    quantity: receiverCardSnap.data().quantity + transferQty,
                    lastTransferredAt: serverTimestamp(),
                    ownerHistory: arrayUnion(receiverUid)
                });
            } else {
                transaction.set(receiverCardRef, {
                    id: senderData.id,
                    rarity: senderData.rarity,
                    quantity: transferQty,
                    ownerHistory: [senderUid, receiverUid],
                    acquiredAt: serverTimestamp(),
                    lastTransferredAt: serverTimestamp()
                });
            }

            transaction.set(doc(messagesRef), {
                senderId: senderUid,
                receiverId: receiverUid,
                cardId: senderData.id,
                rarity: senderData.rarity,
                quantity: transferQty,
                type: "card",
                timestamp: serverTimestamp()
            });

            transaction.set(chatRef, {
                lastMessage: `Transferred ${transferQty}x Card #${senderData.id}`,
                lastSenderId: senderUid,
                timestamp: serverTimestamp(),
                participants: [senderUid, receiverUid]
            }, { merge: true });

            // Write notification for receiver
            transaction.set(receiverNotifRef, {
                senderId: senderUid,
                text: `Sent you ${transferQty}x ${senderData.rarity} Card #${senderData.id}`,
                seen: false,
                createdAt: serverTimestamp()
            });
        });
    }
    // ---------------------------------------------------------------------
    // CARD VIEWER
    // ---------------------------------------------------------------------

    openCardViewer(cardId) {
        const { enlargedCardContainer, cardViewerModal } = this.dom;
        if (!enlargedCardContainer || !cardViewerModal) return;

        enlargedCardContainer.replaceChildren();
        const img = el("img", { alt: "Enlarged card display" });
        setImageWithFallback(img, getCardImage(cardId), "https://via.placeholder.com/300");
        enlargedCardContainer.appendChild(img);

        this.show(cardViewerModal, "flex");
    }

    // ---------------------------------------------------------------------
    // HELPERS
    // ---------------------------------------------------------------------

    show(node, display = "flex") {
        if (node) node.style.display = display;
    }

    hide(node) {
        if (node) node.style.display = "none";
    }
}

// =============================================================================
// BOOTSTRAP
// =============================================================================

window.addEventListener("DOMContentLoaded", () => {
    const chatApp = new ChatApp();
    chatApp.init();
});
