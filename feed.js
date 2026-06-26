import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signOut 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    getDocs,
    collection,
    addDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
    deleteDoc,
    updateDoc,
    setDoc,
    collectionGroup,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

let currentUser = null;
let currentUserData = null;
let editingPostId = null;
let activeListeners = {};
let currentActiveCategory = "all";
let currentUnreadMessages = [];

// ============ Realtime Notification State DOM Elements ============
const notificationBtn = document.getElementById("notificationBtn");
const notificationBadge = document.getElementById("notificationBadge");
const notificationPopup = document.getElementById("notificationPopup");
const popupContainer = document.getElementById("popupContainer");

if (notificationBtn) {
    notificationBtn.onclick = async (e) => {
        e.stopPropagation();
        notificationPopup.classList.toggle("hidden");
        if (!notificationPopup.classList.contains("hidden")) {
            renderPopupList();
            const unseenNotifications = [...currentUnreadMessages];
            for (const notif of unseenNotifications) {
                try {
                    await updateDoc(doc(db, "users", currentUser.uid, "notifications", notif.id), { seen: true });
                } catch (err) {
                    console.error("Notification seen update failed:", err);
                }
            }
        }
    };
}

document.addEventListener("click", (e) => {
    if (notificationPopup && !notificationPopup.classList.contains("hidden")) {
        if (!notificationPopup.contains(e.target) && !notificationBtn.contains(e.target)) {
            notificationPopup.classList.add("hidden");
        }
    }
});

function getLocalDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function updateGreeting() {
    const hour = new Date().getHours();
    const greet = document.getElementById("greetingText");
    if (!greet) return;
    if (hour < 12) greet.textContent = "Good Morning 👋";
    else if (hour < 17) greet.textContent = "Good Afternoon 👋";
    else greet.textContent = "Good Evening 👋";
}

function isSpam(text) {
    const blackList = ["hi", "hello", "lol", "test", "nothing", "timepass", "hey", "post"];
    const cleaned = text.toLowerCase().trim();
    return blackList.includes(cleaned) || cleaned.length < 5;
}

// Helper: Calculate Energy Meter value dynamically based on profile metrics
function calculateEnergy(userData) {
    if (!userData) return 50; 
    let base = 25; 
    const logsCount = userData.totalLogs || 0;
    const streak = userData.currentStreak || 0;
    
    base += Math.min(25, logsCount * 2);
    base += Math.min(30, streak * 3);

    if (userData.lastActiveDate) {
        const today = new Date();
        const lastActive = new Date(userData.lastActiveDate);
        const diffTime = Math.abs(today - lastActive);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 2) base -= Math.min(20, (diffDays - 2) * 4);
    }
    return Math.max(0, Math.min(100, base));
}

function initRealtimeMessagesWatcher(userUid){
    const unreadQuery = query(
        collection(db, "users", userUid, "notifications"),
        where("seen", "==", false),
        orderBy("createdAt", "desc")
    );

    activeListeners["messages_notification_sync"] = onSnapshot(unreadQuery, (snapshot) => {
        currentUnreadMessages = [];
        snapshot.forEach((docSnap) => {
            currentUnreadMessages.push({ id: docSnap.id, ...docSnap.data() });
        });

        const totalMessagesCount = currentUnreadMessages.length;
        if (totalMessagesCount > 0) {
            notificationBadge.textContent = totalMessagesCount > 99 ? "99+" : totalMessagesCount;
            notificationBadge.classList.remove("hidden");
        } else {
            notificationBadge.classList.add("hidden");
        }

        if (notificationPopup && !notificationPopup.classList.contains("hidden")) {
            renderPopupList();
        }
    }, (error) => {
        console.error("Messages notification realtime issue:", error);
    });
}

async function renderPopupList() {
    if (!popupContainer) return;
    if (currentUnreadMessages.length === 0) {
        popupContainer.innerHTML = `<div class="popup-empty-msg">No unread notifications 📦</div>`;
        return;
    }

    popupContainer.innerHTML = `<div class="popup-loading">Resolving senders...</div>`;
    const distinctSenders = new Map();
    currentUnreadMessages.forEach((msg) => {
        if (!distinctSenders.has(msg.senderId)) distinctSenders.set(msg.senderId, msg);
    });

    const renderedRows = [];
    for (let [senderId, lastMsgTextPayload] of distinctSenders.entries()) {
        let userDisplayNameStr = "Urja Member";
        let userPhotoUrlStr = "https://via.placeholder.com/40";

        try {
            const profileSnap = await getDoc(doc(db, "users", senderId));
            if (profileSnap.exists()) {
                const pData = profileSnap.data();
                userDisplayNameStr = pData.displayName || pData.username || "Urja Member";
                if (pData.photoURL) userPhotoUrlStr = pData.photoURL;
            }
        } catch (fetchErr) {
            console.error("Sender identity processing issue:", fetchErr);
        }

        const safeHtmlText = "💬 " + escapeHTML(lastMsgTextPayload.text || "");
        renderedRows.push(`
            <div class="popup-item-row" onclick="window.location.href='chat.html?uid=${senderId}'">
                <img src="${userPhotoUrlStr}" alt="User Avatar">
                <div class="popup-item-body">
                    <div class="popup-item-title">${escapeHTML(userDisplayNameStr)} sent you a message</div>
                    <div class="popup-item-snippet">${safeHtmlText}</div>
                </div>
            </div>
        `);
    }
    popupContainer.innerHTML = renderedRows.join("");
}

function initRealtimeFriendsEngine() {
    if (!currentUser) return;

    const friendsCountEl = document.getElementById("headerFriendsCount");
    const activeFriendsList = document.getElementById("activeFriendsContainerList");
    const incomingSection = document.getElementById("incomingRequestsSection");
    const incomingList = document.getElementById("incomingRequestsContainerList");

    const friendsQuery = collection(db, "users", currentUser.uid, "growthFriends");
    activeListeners["my_friends_sync"] = onSnapshot(friendsQuery, async (snapshot) => {
        if (friendsCountEl) friendsCountEl.textContent = snapshot.size;
        activeFriendsList.innerHTML = "";

        if (snapshot.empty) {
            activeFriendsList.innerHTML = `<div style="text-align:center; padding:20px; color:#aaa; font-size:0.85rem;">No friends connected yet.</div>`;
            return;
        }

        for (const friendDoc of snapshot.docs) {
            const friendId = friendDoc.id;
            const friendProfileSnap = await getDoc(doc(db, "users", friendId));
            if (!friendProfileSnap.exists()) continue;
            const fData = friendProfileSnap.data();

            // Dynamic Energy generation tracking for rendering lists
            const energyValue = calculateEnergy(fData);

            const row = document.createElement("div");
            row.className = "drawer-friend-item-row";
            row.innerHTML = `
                <img src="${fData.photoURL || 'https://via.placeholder.com/40'}" alt="User Profile Image">
                <div style="flex:1; display:flex; flex-direction:column; justify-content:center; text-align:left;">
                    <h6 style="margin:0; display:flex; align-items:center; gap:6px;">
                        ${fData.displayName || 'Urja Member'} 
                        <span style="font-size:0.7rem; background:#eee; padding:2px 5px; border-radius:4px; color:#333;">⚡ ${energyValue}%</span>
                    </h6>
                    <p style="margin:2px 0 0 0;">@${fData.username || 'user'}</p>
                </div>
                <button class="remove-friend-small-btn" data-id="${friendId}" style="background:none; border:none; color:#ff3b30; cursor:pointer; font-size:0.9rem; padding:8px;"><i class="fas fa-user-minus"></i></button>
            `;
            
            row.querySelector(".remove-friend-small-btn").onclick = async () => {
                if (!confirm(`Remove ${fData.displayName || 'user'} (@${fData.username || 'user'}) from Growth Friends?`)) return;
                await deleteDoc(doc(db, "users", currentUser.uid, "growthFriends", friendId));
                await deleteDoc(doc(db, "users", friendId, "growthFriends", currentUser.uid));
            };

            activeFriendsList.appendChild(row);
        }
    });

    const inboundReqQuery = collection(db, "users", currentUser.uid, "friendRequests");
    activeListeners["my_requests_sync"] = onSnapshot(inboundReqQuery, async (snapshot) => {
        if (snapshot.empty) {
            incomingSection.style.display = "none";
            incomingList.innerHTML = "";
            return;
        }

        incomingSection.style.display = "block";
        incomingList.innerHTML = "";

        for (const reqDoc of snapshot.docs) {
            const senderId = reqDoc.id;
            const senderProfileSnap = await getDoc(doc(db, "users", senderId));
            if (!senderProfileSnap.exists()) continue;
            const sData = senderProfileSnap.data();

            const row = document.createElement("div");
            row.className = "drawer-friend-item-row";
            row.innerHTML = `
                <img src="${sData.photoURL || 'https://via.placeholder.com/40'}" alt="User Profile Image">
                <div style="flex:1; display:flex; flex-direction:column; justify-content:center; text-align:left;">
                    <h6>${sData.displayName || 'Urja Member'}</h6>
                    <p>@${sData.username || 'user'}</p>
                </div>
                <div style="display:flex; gap:6px;">
                    <button class="req-action-btn accept" data-id="${senderId}" style="background:#00b074; border:none; color:white; padding:6px 10px; border-radius:6px; cursor:pointer;"><i class="fas fa-check"></i></button>
                    <button class="req-action-btn decline" data-id="${senderId}" style="background:#ff3b30; border:none; color:white; padding:6px 10px; border-radius:6px; cursor:pointer;"><i class="fas fa-times"></i></button>
                </div>
            `;

            row.querySelector(".accept").onclick = async () => {
                await setDoc(doc(db, "users", currentUser.uid, "growthFriends", senderId), { connectedAt: serverTimestamp() });
                await setDoc(doc(db, "users", senderId, "growthFriends", currentUser.uid), { connectedAt: serverTimestamp() });
                await deleteDoc(doc(db, "users", currentUser.uid, "friendRequests", senderId));
            };

            row.querySelector(".decline").onclick = async () => {
                await deleteDoc(doc(db, "users", currentUser.uid, "friendRequests", senderId));
            };

            incomingList.appendChild(row);
        }
    });
}

function setupFeedRealtimeSync(container, categoryFilter = "all") {
    if (!container) return;

    Object.keys(activeListeners).forEach(key => {
        if (key !== "my_friends_sync" && key !== "my_requests_sync" && key !== "messages_notification_sync" && typeof activeListeners[key] === "function") {
            activeListeners[key]();
        }
    });
    
    const friendsSyncRef = activeListeners["my_friends_sync"];
    const requestsSyncRef = activeListeners["my_requests_sync"];
    const messagesSyncRef = activeListeners["messages_notification_sync"];
    activeListeners = { 
        "my_friends_sync": friendsSyncRef, 
        "my_requests_sync": requestsSyncRef,
        "messages_notification_sync": messagesSyncRef
    };

    container.innerHTML = `<div class="shimmer-loader"></div>`;
    let feedQuery = query(collection(db, "posts"), orderBy("createdAt", "desc"));

    activeListeners["feed_stream"] = onSnapshot(feedQuery, (snap) => {
        container.innerHTML = "";
        const filteredDocs = [];
        snap.forEach((docSnap) => {
            const data = docSnap.data();
            const postCategory = data.category || "others";
            if (categoryFilter === "all" || postCategory.toLowerCase() === categoryFilter.toLowerCase()) {
                filteredDocs.push(docSnap);
            }
        });

        if (filteredDocs.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:50px; color:#999;">No updates logged in ${categoryFilter === 'all' ? 'any category' : categoryFilter} yet 🚀</div>`;
            return;
        }

        filteredDocs.forEach((docSnap) => {
            const p = docSnap.data();
            const postId = docSnap.id;
            const isOwner = currentUser && currentUser.uid === p.uid;
            const postCategory = p.category || "others";

            const card = document.createElement("div");
            card.className = "post-card";

            let formattedDate = "Just now";
            if (p.createdAt) {
                const dateObj = new Date(p.createdAt.toDate());
                const datePart = dateObj.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
                const timePart = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                formattedDate = `${datePart} • ${timePart}`;
            }

            card.innerHTML = `
                <div class="post-header" id="header-profile-link-${postId}" style="cursor: pointer;">
                    <img src="${p.authorPhoto || "https://via.placeholder.com/40"}" alt="User">
                    <div style="flex: 1;">
                        <h5>${escapeHTML(p.authorName || "Urja Member")}</h5>
                        <span>${formattedDate}</span>
                    </div>
                </div>
                <div class="post-body">
                    <div class="post-category-tag tag-${postCategory}">${postCategory}</div>
                    <h4>${escapeHTML(p.goalTitle || "")}</h4>
                    <p>${escapeHTML(p.description || "")}</p>
                    ${p.imageUrl ? `<div style="margin-top:15px;"><a href="${p.imageUrl}" target="_blank" style="text-decoration: none; font-weight: 700; color: #FF5C00; font-size: 0.95rem;">📎 View Progress Proof</a></div>` : ""}
                </div>
                <div class="post-meta" style="${(!p.win && !p.difficulty) ? 'display:none;' : ''}">
                    ${p.win ? `<div><b>🏆 Today's Win:</b> ${escapeHTML(p.win)}</div>` : ""}
                    ${p.difficulty ? `<div style="margin-top:8px;"><b>🔥 Challenge:</b> ${escapeHTML(p.difficulty)}</div>` : ""}
                </div>
                <div class="engagement-bar">
                    <div class="respect-btn-container">
                        <button class="respect-hold-btn" id="respect-btn-${postId}"><svg><circle class="bg-track" cx="22" cy="22" r="20"></circle><circle class="progress-track" cx="22" cy="22" r="20"></circle></svg>🔥</button>
                        <span class="respect-count-text" id="respect-count-${postId}">0 Respect</span>
                    </div>
                    <button class="comment-trigger-btn" id="comment-trigger-${postId}"><i class="far fa-comment"></i> Comment <span id="comment-count-${postId}" style="font-weight:700; margin-left:2px;">(0)</span></button>
                </div>
                <div class="comments-section-wrapper" id="comments-box-${postId}" style="display: none;">
                    <div class="comments-feed-list" id="comments-list-${postId}"></div>
                    <div class="comment-compose-box"><input type="text" id="comment-input-${postId}" placeholder="Write an encouraging comment..."><button class="comment-dispatch-btn" id="comment-send-${postId}"><i class="fas fa-paper-plane"></i></button></div>
                </div>
                ${isOwner ? `<div class="post-actions"><button class="action-btn edit-btn">Edit</button><button class="action-btn delete-btn">Delete</button></div>` : ""}
            `;

            card.querySelector(`#header-profile-link-${postId}`).onclick = () => {
                if (currentUser && p.uid === currentUser.uid) window.location.href = "profile.html";
                else if (p.uid) window.location.href = `user-profile.html?uid=${p.uid}`;
            };

            if (isOwner) {
                card.querySelector(".edit-btn").onclick = () => {
                    document.getElementById("postCategory").value = postCategory;
                    document.getElementById("postDescription").value = p.description || "";
                    editingPostId = postId;
                    document.getElementById("postModal").style.display = "flex";
                };

                card.querySelector(".delete-btn").onclick = async () => {
                    if (!confirm("Are you sure you want to delete this post? This will remove your earned Urja Points.")) return;
                    try {
                        const pointsToDeduct = p.imageUrl ? 5 : 8;
                        await deleteDoc(doc(db, "posts", postId));
                        const userRef = doc(db, "users", currentUser.uid);
                        const currentPoints = currentUserData.urjaPoints !== undefined ? currentUserData.urjaPoints : 0;
                        const newPointsTotal = Math.max(0, currentPoints - pointsToDeduct);
                        
                        await updateDoc(userRef, { urjaPoints: newPointsTotal });
                        currentUserData.urjaPoints = newPointsTotal;
                        
                        const pointsDisplayEl = document.getElementById("headerUrjaPoints");
                        if (pointsDisplayEl) pointsDisplayEl.textContent = newPointsTotal;
                    } catch (err) { console.error("Deletion task error:", err); }
                };
            }

            const respectBtn = card.querySelector(`#respect-btn-${postId}`);
            const respectCountText = card.querySelector(`#respect-count-${postId}`);
            let holdTimeout = null;
            const respectsCollectionRef = collection(db, "posts", postId, "respects");

            onSnapshot(respectsCollectionRef, (respectSnap) => {
                const respectCount = respectSnap.size;
                respectCountText.textContent = `${respectCount} Respect`;
                let alreadyRespected = false;
                respectSnap.forEach((respectDoc) => {
                    if (currentUser && respectDoc.data().uid === currentUser.uid) alreadyRespected = true;
                });
                if (alreadyRespected) respectBtn.classList.add("has-respected");
                else respectBtn.classList.remove("has-respected");
            });

            respectBtn.onmousedown = respectBtn.ontouchstart = (e) => {
                e.preventDefault();
                if (respectBtn.classList.contains("has-respected")) return;
                respectBtn.classList.add("holding");
                holdTimeout = setTimeout(async () => {
                    respectBtn.classList.remove("holding");
                    respectBtn.classList.add("has-respected");
                    await setDoc(doc(db, "posts", postId, "respects", currentUser.uid), { uid: currentUser.uid, respectedAt: serverTimestamp() });
                }, 2000);
            };

            respectBtn.onmouseup = respectBtn.onmouseleave = respectBtn.ontouchend = () => {
                if (holdTimeout) { clearTimeout(holdTimeout); respectBtn.classList.remove("holding"); }
            };

            const commentToggleBtn = card.querySelector(`#comment-trigger-${postId}`);
            const commentsBoxSection = card.querySelector(`#comments-box-${postId}`);
            const commentsListFeed = card.querySelector(`#comments-list-${postId}`);
            const commentInputText = card.querySelector(`#comment-input-${postId}`);
            const commentSendBtn = card.querySelector(`#comment-send-${postId}`);
            const commentCounterBadge = card.querySelector(`#comment-count-${postId}`);

            const commentsCollectionRef = collection(db, "posts", postId, "comments");
            const commentsQuerySorted = query(commentsCollectionRef, orderBy("createdAt", "asc"));
            const legacyCommentsArray = Array.isArray(p.comments) ? p.comments : null;

            if (legacyCommentsArray && legacyCommentsArray.length > 0) commentCounterBadge.textContent = `(${legacyCommentsArray.length})`;

            onSnapshot(commentsQuerySorted, (cSnap) => {
                const subcollectionCount = cSnap.size;
                const legacyCount = legacyCommentsArray ? legacyCommentsArray.length : 0;
                commentCounterBadge.textContent = `(${Math.max(subcollectionCount, legacyCount)})`;
                if (commentsBoxSection.style.display === "block") {
                    if (subcollectionCount > 0) renderCommentsTree(cSnap, commentsListFeed, postId);
                    else if (legacyCommentsArray && legacyCommentsArray.length > 0) renderLegacyComments(legacyCommentsArray, commentsListFeed);
                    else commentsListFeed.innerHTML = `<div style="font-size:0.8rem; color:#aaa; text-align:center; padding:10px;">Be the first to leave an encouraging remark! ✨</div>`;
                }
            });

            commentToggleBtn.onclick = () => {
                if (commentsBoxSection.style.display === "none") {
                    commentsBoxSection.style.display = "block";
                    getDocs(commentsQuerySorted).then((cSnap) => {
                        if (cSnap.size > 0) renderCommentsTree(cSnap, commentsListFeed, postId);
                        else if (legacyCommentsArray && legacyCommentsArray.length > 0) renderLegacyComments(legacyCommentsArray, commentsListFeed);
                        else renderCommentsTree(cSnap, commentsListFeed, postId);
                    });
                } else { commentsBoxSection.style.display = "none"; }
            };

            const dispatchCommentAction = async () => {
                const commentVal = commentInputText.value.trim();
                if (!commentVal || isSpam(commentVal)) return;
                commentInputText.value = "";
                await addDoc(commentsCollectionRef, {
                    authorName: currentUserData.displayName || "Urja Member",
                    authorPhoto: currentUserData.photoURL || "https://via.placeholder.com/40",
                    uid: currentUser.uid,
                    text: commentVal,
                    createdAt: serverTimestamp()
                });
            };
            commentSendBtn.onclick = dispatchCommentAction;
            commentInputText.onkeydown = (ev) => { if (ev.key === "Enter") dispatchCommentAction(); };
            container.appendChild(card);
        });
    });
}

function renderLegacyComments(commentsArray, targetContainerList) {
    targetContainerList.innerHTML = "";
    if (!commentsArray || commentsArray.length === 0) {
        targetContainerList.innerHTML = `<div style="font-size:0.8rem; color:#aaa; text-align:center; padding:10px;">Be the first to leave an encouraging remark! ✨</div>`;
        return;
    }
    commentsArray.forEach((c) => {
        const item = document.createElement("div");
        item.className = "comment-item";
        item.innerHTML = `
            <img src="${c.authorPhoto || 'https://via.placeholder.com/40'}" alt="User">
            <div class="comment-item-content"><h6>${escapeHTML(c.authorName || 'Urja Member')}</h6><p>${escapeHTML(c.text || '')}</p><div class="comment-actions-row"><span class="comment-meta-time">Earlier</span></div></div>
        `;
        targetContainerList.appendChild(item);
    });
}

function renderCommentsTree(snapshot, targetContainerList, parentPostId) {
    targetContainerList.innerHTML = "";
    if (snapshot.empty) {
        targetContainerList.innerHTML = `<div style="font-size:0.8rem; color:#aaa; text-align:center; padding:10px;">Be the first to leave an encouraging remark! ✨</div>`;
        return;
    }

   snapshot.forEach((commentDoc) => {
        const c = commentDoc.data();
        const cid = commentDoc.id;
        let timeLabel = "Just now";
        if (c.createdAt) timeLabel = new Date(c.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const item = document.createElement("div");
        item.className = "comment-item";
        item.style = "margin-bottom: 12px; display: flex; gap: 10px; align-items: flex-start;";
        item.innerHTML = `
            <img src="${c.authorPhoto || 'https://via.placeholder.com/40'}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
            <div class="comment-item-content" style="flex: 1;">
                <h6 style="margin: 0; font-size: 0.85rem; font-weight: 700;">${escapeHTML(c.authorName || 'Urja Member')}</h6>
                <p style="margin: 2px 0; font-size: 0.9rem; color: #333;">${escapeHTML(c.text || '')}</p>
                <div class="comment-actions-row" style="display: flex; gap: 12px; font-size: 0.75rem; color: #777; margin-top: 4px; align-items: center;">
                    <span class="comment-meta-time">${timeLabel}</span>
                    <button class="comment-action-btn reply-trigger-btn" id="reply-trigger-${cid}" style="background: none; border: none; color: #FF5C00; cursor: pointer; font-weight: 600; padding: 0;">Reply</button>
                    <button class="comment-heart-btn" id="heart-btn-${cid}" style="background: none; border: none; color: #aaa; cursor: pointer; padding: 0; display: flex; align-items: center; gap: 3px;"><i class="far fa-heart" id="heart-icon-${cid}"></i> <span id="heart-count-${cid}">0</span></button>
                </div>
                <div class="comment-nested-replies-tree" id="replies-tree-${cid}" style="margin-top: 8px; padding-left: 12px; border-left: 2px solid #eaeaea;"></div>
            </div>
        `;

        const heartBtn = item.querySelector(`#heart-btn-${cid}`);
        const heartIcon = item.querySelector(`#heart-icon-${cid}`);
        const heartCountText = item.querySelector(`#heart-count-${cid}`);
        const commentLikesRef = collection(db, "posts", parentPostId, "comments", cid, "likes");

        onSnapshot(commentLikesRef, (likeSnap) => {
            heartCountText.textContent = likeSnap.size;
            let hasLiked = false;
            likeSnap.forEach((likeDoc) => { if (currentUser && likeDoc.id === currentUser.uid) hasLiked = true; });
            if (hasLiked) { heartIcon.className = "fas fa-heart"; heartBtn.style.color = "#ff3b30"; } 
            else { heartIcon.className = "far fa-heart"; heartBtn.style.color = "#aaa"; }
        });

        heartBtn.onclick = async (e) => {
            e.stopPropagation();
            if (!currentUser) return;
            const userLikeDocRef = doc(db, "posts", parentPostId, "comments", cid, "likes", currentUser.uid);
            if (heartIcon.classList.contains("fas")) await deleteDoc(userLikeDocRef);
            else await setDoc(userLikeDocRef, { likedAt: serverTimestamp() });
        };

        const replyTreeBox = item.querySelector(`#replies-tree-${cid}`);
        const replyTrigger = item.querySelector(`#reply-trigger-${cid}`);
        const repliesCollectionRef = collection(db, "posts", parentPostId, "comments", cid, "replies");
        const repliesQuerySorted = query(repliesCollectionRef, orderBy("createdAt", "asc"));

        onSnapshot(repliesQuerySorted, (rSnap) => {
            replyTreeBox.innerHTML = "";
            rSnap.forEach((rDoc) => {
                const r = rDoc.data();
                const node = document.createElement("div");
                node.style = "display:flex; gap:6px; align-items:flex-start; margin-top:4px;";
                node.innerHTML = `
                    <img src="${r.authorPhoto || 'https://via.placeholder.com/40'}" style="width:20px; height:20px; border-radius:50%; object-fit:cover;">
                    <div style="display:flex; flex-direction:column;"><span style="font-size:0.7rem; font-weight:700;">${escapeHTML(r.authorName || 'Urja Member')}</span><p style="margin:1px 0 0 0; font-size:0.75rem; color:#444;">${escapeHTML(r.text || '')}</p></div>
                `;
                replyTreeBox.appendChild(node);
            });
        });

        replyTrigger.onclick = () => {
            const existingInput = item.querySelector(`#nested-input-box-${cid}`);
            if (existingInput) { existingInput.remove(); replyTrigger.classList.remove("reply-active"); return; }
            replyTrigger.classList.add("reply-active");
            
            const composeBox = document.createElement("div");
            composeBox.id = `nested-input-box-${cid}`;
            composeBox.style = "display:flex; gap:6px; align-items:center; margin-top:8px; width:100%;";
            composeBox.innerHTML = `
                <input type="text" placeholder="Reply..." style="flex:1; font-size:0.78rem; padding:6px 10px; border:1px solid #eaeaea; border-radius:10px; outline:none;"><button style="background:var(--primary); color:white; border:none; padding:6px 10px; border-radius:8px; font-size:0.75rem; cursor:pointer;"><i class="fas fa-paper-plane"></i></button>
            `;
            const txtField = composeBox.querySelector("input");
            const sendNode = composeBox.querySelector("button");

            const dispatchReply = async () => {
                const val = txtField.value.trim();
                if (!val || isSpam(val)) return;
                composeBox.remove();
                replyTrigger.classList.remove("reply-active");
                await addDoc(repliesCollectionRef, {
                    authorName: currentUserData.displayName || "Urja Member",
                    authorPhoto: currentUserData.photoURL || "https://via.placeholder.com/40",
                    uid: currentUser.uid,
                    text: val,
                    createdAt: serverTimestamp()
                });
            };
            sendNode.onclick = dispatchReply;
            txtField.onkeydown = (evt) => { if (evt.key === "Enter") dispatchReply(); };
            replyTrigger.parentElement.after(composeBox);
        };
        targetContainerList.appendChild(item);
    });
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        updateGreeting();
        try {
            const userSnap = await getDoc(doc(db, "users", user.uid));
            if (userSnap.exists()) {
                currentUserData = userSnap.data();
                const profilePhotoEl = document.getElementById("headerProfilePhoto");
                const usernameEl = document.getElementById("headerUsername");
                const pointsDisplayEl = document.getElementById("headerUrjaPoints");

                if (profilePhotoEl && currentUserData.photoURL) profilePhotoEl.src = currentUserData.photoURL;
                if (usernameEl) usernameEl.textContent = `@${currentUserData.username || "username"}`;
                if (pointsDisplayEl) pointsDisplayEl.textContent = currentUserData.urjaPoints || 0;

                initRealtimeFriendsEngine();
                initRealtimeMessagesWatcher(user.uid);
                setupFeedRealtimeSync(document.getElementById("feedPostsContainer"), currentActiveCategory);
            }
        } catch (err) { console.error("Account telemetry hydration runtime issue:", err); }
    } else {
        if (activeListeners["my_friends_sync"]) activeListeners["my_friends_sync"]();
        if (activeListeners["my_requests_sync"]) activeListeners["my_requests_sync"]();
        if (activeListeners["messages_notification_sync"]) activeListeners["messages_notification_sync"]();
        window.location.href = "index.html";
    }
});

const openModalBtn = document.getElementById("openPostModalBtn");
const closeModalBtn = document.getElementById("closePostModal");
const modal = document.getElementById("postModal");
const submitPostBtn = document.getElementById("submitPost");

if (openModalBtn) openModalBtn.onclick = () => { editingPostId = null; modal.style.display = "flex"; };
if (closeModalBtn) closeModalBtn.onclick = () => { modal.style.display = "none"; };

if (submitPostBtn) {
    submitPostBtn.onclick = async () => {
        const descriptionText = document.getElementById("postDescription").value.trim();
        const categorySelection = document.getElementById("postCategory").value;
        if (!descriptionText || isSpam(descriptionText)) { alert("Please write a meaningful progress update."); return; }

        try {
            if (editingPostId) {
                await updateDoc(doc(db, "posts", editingPostId), { description: descriptionText, category: categorySelection });
                alert("Progress logged entry updated!");
            } else {
                const todayStr = getLocalDateString();
                const userRef = doc(db, "users", currentUser.uid);
                const freshUserSnap = await getDoc(userRef);
                const freshUserData = freshUserSnap.data();

                const lastActiveStr = freshUserData.lastActiveDate || "";
                const alreadyPostedToday = lastActiveStr === todayStr;

                await addDoc(collection(db, "posts"), {
                    uid: currentUser.uid,
                    authorName: freshUserData.displayName || "Urja Member",
                    authorPhoto: freshUserData.photoURL || "https://via.placeholder.com/40",
                    description: descriptionText,
                    category: categorySelection,
                    goalTitle: `${categorySelection.toUpperCase()} Update`,
                    createdAt: serverTimestamp(),
                    dateCreatedString: todayStr,
                    respectCount: 0,
                    respects: []
                });

                if (alreadyPostedToday) {
                    modal.style.display = "none";
                    document.getElementById("postDescription").value = "";
                    alert("Progress saved! (You already earned your points for today.)");
                    return;
                }

                const pointsToAward = 8;
                let currentStreak = freshUserData.currentStreak !== undefined ? freshUserData.currentStreak : 0;
                let bestStreak = freshUserData.bestStreak !== undefined ? freshUserData.bestStreak : 0;
                let totalLogs = freshUserData.totalLogs !== undefined ? freshUserData.totalLogs : 0;
                let currentPoints = freshUserData.urjaPoints !== undefined ? freshUserData.urjaPoints : 0;

                totalLogs += 1;
                const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = [yesterday.getFullYear(), String(yesterday.getMonth() + 1).padStart(2, '0'), String(yesterday.getDate()).padStart(2, '0')].join('-');

                if (lastActiveStr === yesterdayStr || lastActiveStr === "") currentStreak += 1;
                else currentStreak = 1;

                if (currentStreak > bestStreak) bestStreak = currentStreak;
                const updatedPoints = currentPoints + pointsToAward;

                await updateDoc(userRef, { urjaPoints: updatedPoints, currentStreak: currentStreak, bestStreak: bestStreak, totalLogs: totalLogs, lastActiveDate: todayStr });

                currentUserData.urjaPoints = updatedPoints;
                currentUserData.currentStreak = currentStreak;
                currentUserData.bestStreak = bestStreak;
                currentUserData.totalLogs = totalLogs;
                currentUserData.lastActiveDate = todayStr;

                const pointsDisplayEl = document.getElementById("headerUrjaPoints");
                if (pointsDisplayEl) pointsDisplayEl.textContent = updatedPoints;
                alert(`Progress Logged! You earned ⚡ ${pointsToAward} Urja Points!`);
            }
            modal.style.display = "none";
            document.getElementById("postDescription").value = "";
        } catch (error) { console.error(error); alert("Something went wrong while saving your post."); }
    };
}

document.querySelectorAll(".filter-pill").forEach((pill) => {
    pill.onclick = () => {
        document.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        currentActiveCategory = pill.getAttribute("data-category");
        setupFeedRealtimeSync(document.getElementById("feedPostsContainer"), currentActiveCategory);
    };
});

const viewFriendsTrigger = document.getElementById("viewFriendsTrigger");
const friendsDrawerOverlay = document.getElementById("friendsDrawerOverlay");
const closeFriendsDrawerBtn = document.getElementById("closeFriendsDrawerBtn");

if (viewFriendsTrigger) viewFriendsTrigger.onclick = () => { friendsDrawerOverlay.style.display = "flex"; };
if (closeFriendsDrawerBtn) closeFriendsDrawerBtn.onclick = () => { friendsDrawerOverlay.style.display = "none"; };
if (friendsDrawerOverlay) friendsDrawerOverlay.onclick = (e) => { if (e.target === friendsDrawerOverlay) friendsDrawerOverlay.style.display = "none"; };

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) logoutBtn.onclick = () => { if (confirm("Are you sure you want to exit UrjaRise?")) signOut(auth); };