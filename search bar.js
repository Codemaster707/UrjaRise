import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, getDocs, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

const searchInput = document.getElementById("searchInput");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const searchResultsList = document.getElementById("searchResultsList");
const initialStateDoc = document.getElementById("initialState");
const noResultsStateDoc = document.getElementById("noResultsState");

let currentSessionUser = null;
let masterGlobalProfilesCache = [];
let searchDebounceTimeout = null;

onAuthStateChanged(auth, async (user) => {
    if (user) { 
        currentSessionUser = user; 
        await prefetchGlobalRegistryStore(); 
    } else { 
        window.location.href = "index.html"; 
    }
});

async function prefetchGlobalRegistryStore() {
    try {
        const snap = await getDocs(query(collection(db, "users")));
        masterGlobalProfilesCache = [];
        snap.forEach((doc) => {
            if (doc.id !== currentSessionUser.uid) {
                masterGlobalProfilesCache.push({ uid: doc.id, ...doc.data() });
            }
        });
        
        // Profiles are securely cached in the background, but NOT rendered automatically.
        // This keeps the initial screen clean until a query is input.
    } catch (err) { console.error(err); }
}

function executeLocalQuery(filterToken) {
    const rawToken = filterToken.toLowerCase().trim();
    searchResultsList.innerHTML = "";
    
    // If the search bar is cleared/empty, return directly to the default welcoming placeholder view
    if (!rawToken) { 
        if (initialStateDoc) initialStateDoc.style.display = "flex"; 
        if (noResultsStateDoc) noResultsStateDoc.style.display = "none"; 
        return; 
    }
    
    if (initialStateDoc) initialStateDoc.style.display = "none";

    // Run search filtering over cached dataset matching display names or handles
    const matches = masterGlobalProfilesCache.filter(p => 
        (p.displayName && p.displayName.toLowerCase().includes(rawToken)) || 
        (p.username && p.username.toLowerCase().includes(rawToken))
    );

    if (matches.length === 0) { 
        if (noResultsStateDoc) noResultsStateDoc.style.display = "flex"; 
        return; 
    }
    if (noResultsStateDoc) noResultsStateDoc.style.display = "none";

    matches.forEach(item => {
        const itemRow = document.createElement("div");
        itemRow.className = "profile-item-row";
        itemRow.style.cursor = "pointer";
        itemRow.innerHTML = `
            <img src="${item.photoURL || 'https://via.placeholder.com/45'}" alt="User">
            <div class="profile-item-meta">
                <h4>${item.displayName || 'Urja Member'}</h4>
                <p>@${item.username || 'user'}</p>
            </div>
            <div class="profile-item-action-badge"><span>⚡ ${item.urjaPoints || 0}</span></div>`;
        
        // Native window redirection matching your feed setup logic
        itemRow.onclick = () => {
            window.location.href = `user-profile.html?uid=${item.uid}`;
        };
        
        searchResultsList.appendChild(itemRow);
    });
}

searchInput.addEventListener("input", (e) => {
    const value = e.target.value;
    clearSearchBtn.style.display = value.length > 0 ? "block" : "none";

    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(() => {
        executeLocalQuery(value);
    }, 300);
});

clearSearchBtn.onclick = () => {
    searchInput.value = "";
    clearSearchBtn.style.display = "none";
    executeLocalQuery("");
};