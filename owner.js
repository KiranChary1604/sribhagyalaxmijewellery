/* ==========================================================================
   AURA FINE JEWELLERY - OWNER CONTROLLER SCRIPT
   ========================================================================== */

// 2. STATE DATABASE REFERENCES
let registeredUsers = [];
let activityLogs = [];
let consultations = [];
let dbProducts = [];
let dbCollections = [];
let liveRates = null;
let uploadedImagesBase64 = [];
let uploadedCollectionImageBase64 = null;
let editingProductId = null;
let editingCollectionId = null;
let inactivityTimeoutId = null;
let absoluteTimeoutId = null;
let pageOpenTimeoutId = null;
let lastMaxLogId = -1;
let logPollingIntervalId = null;
let currentIsLoggedIn = false;
let availableCategories = ['Rings', 'Necklaces', 'Earrings', 'Bracelets', 'Bangles'];

// 3. DOM ELEMENTS
const ownerTableBody = document.getElementById('ownerTableBody');
const ownerConsultationsBody = document.getElementById('ownerConsultationsBody');
const ownerAccountsBody = document.getElementById('ownerAccountsBody');
const ownerStatUsers = document.getElementById('ownerStatUsers');
const ownerStatCartVal = document.getElementById('ownerStatCartVal');
const ownerStatConsultations = document.getElementById('ownerStatConsultations');
const ownerStatWhatsAppTotal = document.getElementById('ownerStatWhatsAppTotal');
const ownerFeedTerminal = document.getElementById('ownerFeedTerminal');
const seedOwnerBtn = document.getElementById('seedOwnerBtn');
const refreshOwnerBtn = document.getElementById('refreshOwnerBtn');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

const adminLoginContainer = document.getElementById('adminLoginContainer');
const adminDashboardContainer = document.getElementById('adminDashboardContainer');
const adminLoginForm = document.getElementById('adminLoginForm');
const adminLogoutBtn = document.getElementById('adminLogoutBtn');
const adminLoginError = document.getElementById('adminLoginError');

const adminOtpForm = document.getElementById('adminOtpForm');
const adminOtpError = document.getElementById('adminOtpError');
const btnVerifyAdminOtp = document.getElementById('btnVerifyAdminOtp');
const btnResendAdminOtp = document.getElementById('btnResendAdminOtp');
const adminOtpTimerSpan = document.getElementById('adminOtpTimerSpan');
const adminOtpInputs = document.querySelectorAll('.admin-otp-input');

// 4. INITIALIZE DASHBOARD
window.switchTab = function (tabId) {
    // Hide all tab panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.style.display = 'none';
        panel.classList.remove('active');
    });

    // Show selected panel
    const selectedPanel = document.getElementById('tabPanel' + tabId.charAt(0).toUpperCase() + tabId.slice(1));
    if (selectedPanel) {
        selectedPanel.style.display = 'block';
        selectedPanel.classList.add('active');
    }

    // Update active class on tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.getAttribute('data-tab') === tabId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update URL hash without reload
    window.location.hash = tabId;
};

const initDashboard = async () => {
    startPageOpenTimer();
    await checkAdminAuth();
    setupEventListeners();

    // Startup hash routing
    const hash = window.location.hash.substring(1);
    if (hash && ['overview', 'inventory', 'upload', 'clients', 'collections'].includes(hash)) {
        window.switchTab(hash);
    } else {
        window.switchTab('overview');
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
}

// Admin Authorization Checker
async function checkAdminAuth() {
    let isLoggedIn = false;
    try {
        const res = await fetch('/api/check-auth');
        if (res.ok) {
            isLoggedIn = true;
        }
    } catch (err) {
        console.error("Auth check failed:", err);
    }

    if (isLoggedIn) {
        currentIsLoggedIn = true;
        adminLoginContainer.style.display = 'none';
        adminDashboardContainer.style.display = 'block';
        await loadDatabase();
        renderDashboard();

        // Start inactivity and absolute session timers
        startAbsoluteSessionTimer();
        resetInactivityTimer();

        // Setup real-time log polling
        if (logPollingIntervalId) {
            clearInterval(logPollingIntervalId);
        }
        lastMaxLogId = -1; // reset to fetch standard baseline on login
        logPollingIntervalId = setInterval(pollLogs, 1000);
    } else {
        currentIsLoggedIn = false;
        adminLoginContainer.style.display = 'block';
        adminDashboardContainer.style.display = 'none';

        // Clear active timers
        if (inactivityTimeoutId) {
            clearTimeout(inactivityTimeoutId);
            inactivityTimeoutId = null;
        }
        if (absoluteTimeoutId) {
            clearTimeout(absoluteTimeoutId);
            absoluteTimeoutId = null;
        }
        if (logPollingIntervalId) {
            clearInterval(logPollingIntervalId);
            logPollingIntervalId = null;
        }
    }
}

// Session Timer Helpers
async function logoutAdmin(reason = "Logged out from SBL admin portal.") {
    try {
        await fetch('/api/logout', { method: 'POST' });
    } catch (err) {
        console.error("Logout request failed:", err);
    }

    if (inactivityTimeoutId) {
        clearTimeout(inactivityTimeoutId);
        inactivityTimeoutId = null;
    }
    if (absoluteTimeoutId) {
        clearTimeout(absoluteTimeoutId);
        absoluteTimeoutId = null;
    }

    localStorage.removeItem('aura_owner_login_time');
    sessionStorage.removeItem('aura_owner_page_opened_time');
    window.location.href = '/owner.html';
}

function resetInactivityTimer() {
    if (inactivityTimeoutId) {
        clearTimeout(inactivityTimeoutId);
        inactivityTimeoutId = null;
    }

    if (currentIsLoggedIn) {
        inactivityTimeoutId = setTimeout(() => {
            logoutAdmin("Logged out due to 2 minutes of inactivity.");
        }, 2 * 60 * 1000); // 2 minutes
    }
}

function startAbsoluteSessionTimer() {
    if (absoluteTimeoutId) {
        clearTimeout(absoluteTimeoutId);
        absoluteTimeoutId = null;
    }

    if (currentIsLoggedIn) {
        let loginTime = localStorage.getItem('aura_owner_login_time');
        if (!loginTime) {
            loginTime = Date.now().toString();
            localStorage.setItem('aura_owner_login_time', loginTime);
        }

        const elapsed = Date.now() - parseInt(loginTime, 10);
        const limit = 5 * 60 * 1000; // 5 minutes

        if (elapsed >= limit) {
            logoutAdmin("Session expired (5 minutes limit reached).");
        } else {
            const remaining = limit - elapsed;
            absoluteTimeoutId = setTimeout(() => {
                logoutAdmin("Session expired (5 minutes limit reached).");
            }, remaining);
        }
    }
}

function startPageOpenTimer() {
    const PAGE_OPENED_TIME_KEY = 'aura_owner_page_opened_time';
    let openedTime = sessionStorage.getItem(PAGE_OPENED_TIME_KEY);
    if (!openedTime) {
        openedTime = Date.now().toString();
        sessionStorage.setItem(PAGE_OPENED_TIME_KEY, openedTime);
    }

    const elapsed = Date.now() - parseInt(openedTime, 10);
    const limit = 5 * 60 * 1000; // 5 minutes

    if (elapsed >= limit) {
        sessionStorage.removeItem(PAGE_OPENED_TIME_KEY);
        localStorage.removeItem('aura_owner_login_time');
        window.location.href = '/owner.html';
    } else {
        const remaining = limit - elapsed;
        if (pageOpenTimeoutId) clearTimeout(pageOpenTimeoutId);
        pageOpenTimeoutId = setTimeout(() => {
            sessionStorage.removeItem(PAGE_OPENED_TIME_KEY);
            localStorage.removeItem('aura_owner_login_time');
            window.location.href = '/owner.html';
        }, remaining);
    }
}

// Utility function to calculate product price dynamically based on live metal rates
function getProductPrice(product, rates) {
    if (!product) return 0;

    // Parse weight numeric value from string (e.g. "8.5g" -> 8.5, "2.0 Carat" -> 2.0)
    const weightStr = String(product.weight || '');
    const matches = weightStr.match(/[\d.]+/);
    const weight = matches ? parseFloat(matches[0]) : 0;

    const material = (product.material || '').toLowerCase();
    const purityStr = (product.purity || '').toLowerCase();

    // Check if diamond item: "For diamond items (where weight is in Carats/ct), a diamond carat valuation rate will be applied."
    if (weightStr.includes('carat') || weightStr.includes('ct') || weightStr.includes('ctw')) {
        return Math.round(weight * 350000);
    }

    // Live rates fallback or lookup
    const goldRate = (rates && rates.goldRate) ? parseFloat(rates.goldRate) : 6235.20;
    const silverRate = (rates && rates.silverRate) ? parseFloat(rates.silverRate) : 78450.00;

    if (material.includes('gold')) {
        // Purity adjustment: 18K = 18/24, 22K = 22/24. Default to 1.0 (24K) if no match.
        let purityFactor = 1.0;
        const purityMatch = purityStr.match(/(\d+)/);
        if (purityMatch) {
            const purityVal = parseInt(purityMatch[1]);
            if (purityVal <= 24) {
                purityFactor = purityVal / 24;
            }
        } else if (purityStr.includes('18')) {
            purityFactor = 18 / 24;
        } else if (purityStr.includes('22')) {
            purityFactor = 22 / 24;
        }
        // Gold price = weight * goldRate * purityFactor * makingChargePremium(1.15)
        return Math.round(weight * goldRate * purityFactor * 1.15);
    } else if (material.includes('silver')) {
        // Silver price = weight * (silverRate per kg / 1000) * premium(1.25)
        return Math.round(weight * (silverRate / 1000) * 1.25);
    } else if (material.includes('platinum')) {
        // Platinum price = weight * goldRate * premium(1.1)
        return Math.round(weight * goldRate * 1.1);
    }

    // Default fallback to base price
    return Math.round(product.price || 0);
}

// 5. LOAD DATABASE FROM LOCAL STORAGE & SERVER API
async function loadDatabase() {
    try {
        const [usersRes, logsRes, consultRes, productsRes, ratesRes, collectionsRes] = await Promise.all([
            fetch('/api/customers', { credentials: 'include' }),
            fetch('/api/logs', { credentials: 'include' }),
            fetch('/api/consultations', { credentials: 'include' }),
            fetch('/api/products'),
            fetch('/api/gold-rate'),
            fetch('/api/collections')
        ]);
        if (!usersRes.ok || !logsRes.ok || !consultRes.ok || !productsRes.ok || !ratesRes.ok || !collectionsRes.ok) {
            throw new Error('Failed to fetch data from server');
        }
        registeredUsers = await usersRes.json();
        activityLogs = await logsRes.json();
        consultations = await consultRes.json();
        dbProducts = await productsRes.json();
        dbCollections = await collectionsRes.json();
        liveRates = await ratesRes.json();
    } catch (err) {
        console.error('Error loading data from API:', err);
        // Fallback to localStorage if API unavailable
        registeredUsers = JSON.parse(localStorage.getItem('aura_registered_users')) || [];
        activityLogs = JSON.parse(localStorage.getItem('aura_activity_logs')) || [];
        consultations = JSON.parse(localStorage.getItem('aura_consultations')) || [];
        dbProducts = JSON.parse(localStorage.getItem('aura_products')) || [];
        dbCollections = JSON.parse(localStorage.getItem('aura_collections')) || [];
        liveRates = { goldRate: 6235.20, silverRate: 78450.00 };
        showToast('Could not load data from server, using local data');
    }

    // Compile dynamic categories list
    const baseCategories = ['Rings', 'Necklaces', 'Earrings', 'Bracelets', 'Bangles'];
    const uniqueCats = new Set(baseCategories);
    dbProducts.forEach(p => { if (p.category) uniqueCats.add(p.category); });
    dbCollections.forEach(c => { if (c.category) uniqueCats.add(c.category); });
    availableCategories = Array.from(uniqueCats);
    populateCategoryDropdowns();
}

// Dynamic Category Helper functions
function populateCategoryDropdowns() {
    const prodCategoryEl = document.getElementById('prodCategory');
    const collCategoryEl = document.getElementById('collCategory');
    const filterCategoryEl = document.getElementById('filterCategory');

    if (prodCategoryEl) {
        const currentVal = prodCategoryEl.value;
        prodCategoryEl.innerHTML = availableCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        if (availableCategories.includes(currentVal)) {
            prodCategoryEl.value = currentVal;
        }
    }

    if (collCategoryEl) {
        const currentVal = collCategoryEl.value;
        collCategoryEl.innerHTML = availableCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        if (availableCategories.includes(currentVal)) {
            collCategoryEl.value = currentVal;
        }
    }

    if (filterCategoryEl) {
        const currentVal = filterCategoryEl.value;
        let optionsHtml = '<option value="all">All Categories</option>';
        optionsHtml += availableCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        filterCategoryEl.innerHTML = optionsHtml;
        if (currentVal && (currentVal === 'all' || availableCategories.includes(currentVal))) {
            filterCategoryEl.value = currentVal;
        } else {
            filterCategoryEl.value = 'all';
        }
    }
}

window.promptAddNewCategory = function() {
    const newCat = prompt("Enter new category name (e.g. Anklets, Pendants):");
    if (newCat) {
        const trimmed = newCat.trim();
        if (trimmed) {
            const exists = availableCategories.some(c => c.toLowerCase() === trimmed.toLowerCase());
            if (!exists) {
                availableCategories.push(trimmed);
                populateCategoryDropdowns();
                showToast(`Category "${trimmed}" added successfully!`);
            } else {
                showToast(`Category "${trimmed}" already exists.`);
            }
            
            const prodSelect = document.getElementById('prodCategory');
            const collSelect = document.getElementById('collCategory');
            
            const matchedCat = availableCategories.find(c => c.toLowerCase() === trimmed.toLowerCase());
            if (prodSelect) prodSelect.value = matchedCat;
            if (collSelect) collSelect.value = matchedCat;
        }
    }
};

// 6. RENDER DASHBOARD
function renderDashboard() {
    // Clear Table
    ownerTableBody.innerHTML = '';

    let totalCartsValue = 0;

    // Add current session's guest cart so owner can see active anonymous shoppers
    let displayList = [...registeredUsers];
    const sessionUser = JSON.parse(localStorage.getItem('aura_user'));
    const guestCart = JSON.parse(localStorage.getItem('aura_cart')) || [];

    if (!sessionUser && guestCart.length > 0) {
        displayList.push({
            name: "Anonymous Guest (Active Browser)",
            email: "Guest Session (Not registered)",
            phone: "N/A",
            cart: guestCart,
            isGuest: true
        });
    }

    displayList.forEach((user, index) => {
        let cartHtml = '';
        let cartSubtotal = 0;

        // Render Cart items
        if (user.cart && user.cart.length > 0) {
            cartHtml = '<ul class="owner-table-cart-list">';
            user.cart.forEach(item => {
                cartHtml += `<li>• ${item.name} (${item.material}) <strong>x${item.quantity}</strong></li>`;
                const livePrice = getProductPrice(item, liveRates);
                cartSubtotal += livePrice * item.quantity;
            });
            cartHtml += `</ul>`;
            cartHtml += `<div class="owner-table-total">Subtotal: ₹${cartSubtotal.toLocaleString('en-IN')}</div>`;
            totalCartsValue += cartSubtotal;
        } else {
            cartHtml = '<span class="owner-table-badge">Empty Bag</span>';
        }



        const tr = document.createElement('tr');
        // Highlight active session user if logged in
        if (sessionUser && (user.email.toLowerCase() === sessionUser.email.toLowerCase() || user.phone === sessionUser.phone)) {
            tr.style.backgroundColor = 'rgba(197, 160, 89, 0.08)';
        }
        if (user.isGuest) {
            tr.style.backgroundColor = 'rgba(0, 0, 0, 0.02)';
        }

        tr.innerHTML = `
            <td style="font-weight: 600; color: var(--color-accent-gold-hover); text-align: center;">${index + 1}</td>
            <td>
                <div class="owner-table-user-name">${user.name}</div>
                ${user.isGuest ? '<span class="owner-table-badge guest">Active Guest Session</span>' : '<span class="owner-table-badge cart">Registered Account</span>'}
            </td>
            <td>
                <div>Email: ${user.email}</div>
                <div>Phone: ${user.phone}</div>
            </td>
            <td>${cartHtml}</td>
            <td>
                ${user.isGuest ? 'N/A' : `<button class="owner-table-action-btn" onclick="deleteUserFromDB('${user.email}', '${user.phone}')">Remove</button>`}
            </td>
        `;
        ownerTableBody.appendChild(tr);
    });

    const customerActivityCountEl = document.getElementById('customerActivityCount');
    if (customerActivityCountEl) customerActivityCountEl.textContent = displayList.length;

    ownerStatUsers.textContent = registeredUsers.length;
    ownerStatCartVal.textContent = `₹${totalCartsValue.toLocaleString('en-IN')}`;
    ownerStatConsultations.textContent = consultations.length;

    // Calculate WhatsApp Clicks Analytics
    let totalWhatsAppClicks = 0;

    activityLogs.forEach(log => {
        if (log.text && log.text.startsWith('WhatsApp click:')) {
            totalWhatsAppClicks++;
        }
    });

    if (ownerStatWhatsAppTotal) ownerStatWhatsAppTotal.textContent = totalWhatsAppClicks;

    // Render Registered Accounts Directory
    ownerAccountsBody.innerHTML = '';
    registeredUsers.forEach((user, index) => {
        const tr = document.createElement('tr');
        const trPassword = user.password || 'password123';
        const safeId = user.email.replace(/[^a-zA-Z0-9]/g, '');

        const dateObj = new Date(user.created_at || Date.now());
        const formattedDate = dateObj.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });

        tr.innerHTML = `
            <td style="font-weight: 600; color: var(--color-accent-gold-hover); text-align: center;">${index + 1}</td>
            <td><div class="owner-table-user-name">${user.name}</div></td>
            <td>${user.email}</td>
            <td>${user.phone || 'N/A'}</td>
            <td>
                <div style="font-family: inherit; font-size: 0.85rem; color: var(--color-text-muted); display: inline-flex; align-items: center; gap: 0.4rem; white-space: nowrap;">
                    <i class="fa-regular fa-calendar-days" style="color: var(--color-accent-gold-hover);"></i>
                    <span>${formattedDate}</span>
                </div>
            </td>
            <td>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span class="password-text" id="pwd-${safeId}" style="font-family: monospace; background: var(--color-bg-light); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid #e5dfd5; color: var(--color-text-muted); display: inline-block; width: 140px; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle;">- hidden -</span>
                    <button class="action-btn-small" onclick="togglePasswordVisibility('${safeId}', '${trPassword}')" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; border: var(--border-luxury); cursor: pointer; width: 70px; display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem;"><i class="fa-solid fa-eye"></i> Show</button>
                </div>
            </td>
            <td>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    ${user.isElite ?
                `<span class="admin-badge flag-feat"><i class="fa-solid fa-crown" style="color: var(--color-accent-gold-hover); margin-right: 0.2rem;"></i> Elite</span>` :
                `<span style="color: var(--color-text-muted); font-size: 0.85rem; font-style: italic;">Standard Member</span>`
            }
                </div>
            </td>
            <td>
                <div style="display: flex; align-items: center;">
                    ${user.isElite ?
                `<button class="action-btn-small" onclick="toggleEliteStatus('${user.email}', false)" style="border: var(--border-luxury); cursor: pointer; color: #e25c5c; padding: 0.25rem 0.5rem; width: 120px; display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem;"><i class="fa-solid fa-user-minus"></i> Revoke Elite</button>` :
                `<button class="action-btn-small" onclick="toggleEliteStatus('${user.email}', true)" style="border: var(--border-luxury); cursor: pointer; color: var(--color-accent-gold-hover); padding: 0.25rem 0.5rem; width: 120px; display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem;"><i class="fa-solid fa-crown"></i> Make Elite</button>`
            }
                </div>
            </td>
            <td>
                <button class="owner-table-action-btn" onclick="deleteUserFromDB('${user.email}', '${user.phone}')" style="margin: 0; padding: 0.25rem 0.5rem;">Remove Account</button>
            </td>
        `;
        ownerAccountsBody.appendChild(tr);
    });

    const registeredClientsCountEl = document.getElementById('registeredClientsCount');
    if (registeredClientsCountEl) registeredClientsCountEl.textContent = registeredUsers.length;

    // Render Consultations Table
    ownerConsultationsBody.innerHTML = '';
    consultations.forEach((booking, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 600; color: var(--color-accent-gold-hover); text-align: center;">${index + 1}</td>
            <td>
                <div class="owner-table-user-name">${booking.name}</div>
                <div style="font-size: 0.8rem; color: var(--color-text-muted);">${booking.email}</div>
                <div style="font-size: 0.8rem; color: var(--color-text-muted);">${booking.phone}</div>
            </td>
            <td>
                <span class="owner-table-badge cart">${booking.service}</span>
            </td>
            <td>
                <div>Date: <strong>${booking.date}</strong></div>
                <div>Time: ${booking.time}</div>
            </td>
            <td>
                <div style="font-size: 0.8rem; font-style: italic; max-width: 300px; word-wrap: break-word;">
                    ${booking.notes ? `"${booking.notes}"` : 'No special notes'}
                </div>
            </td>
            <td>
                <button class="owner-table-action-btn" onclick="deleteBooking('${booking.id}')">Cancel/Archive</button>
            </td>
        `;
        ownerConsultationsBody.appendChild(tr);
    });

    const bookedConsultationsCountEl = document.getElementById('bookedConsultationsCount');
    if (bookedConsultationsCountEl) bookedConsultationsCountEl.textContent = consultations.length;

    renderFeed();
    renderInventory();
    renderCollectionsTable();
}

// Render feed logs terminal
function renderFeed() {
    ownerFeedTerminal.innerHTML = '';
    activityLogs.forEach(log => {
        const div = document.createElement('div');
        div.className = 'feed-log-item';
        div.innerHTML = `<span class="feed-log-time">[${log.time}]</span> <span class="feed-log-${log.type}">${log.text}</span>`;
        ownerFeedTerminal.appendChild(div);
    });
}

// 7. EVENT LISTENERS
function setupEventListeners() {
    // Admin Login form submit
    adminLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = document.getElementById('adminUser').value.trim();
        const pass = document.getElementById('adminPassword').value;

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user, password: pass })
            });

            const data = await res.json().catch(() => ({}));

            if (res.ok) {
                if (data.status === 'otp_required') {
                    // Smooth transition to OTP form
                    adminLoginError.style.display = 'none';
                    adminLoginForm.style.display = 'none';
                    adminOtpForm.style.display = 'flex';
                    if (adminOtpInputs.length > 0) adminOtpInputs[0].focus();
                    showToast("Credentials correct. Please verify device via OTP code.");
                    startAdminOtpCooldown(60);
                } else {
                    localStorage.setItem('aura_owner_login_time', Date.now().toString());
                    adminLoginError.style.display = 'none';
                    adminLoginForm.reset();
                    await checkAdminAuth();
                    showToast("Authenticated. Welcome to SBL Admin.");
                }
            } else {
                adminLoginError.textContent = data.message || "Invalid administrative credentials. Access denied.";
                adminLoginError.style.display = 'block';
            }
        } catch (err) {
            console.error("Login request failed:", err);
            adminLoginError.textContent = "Error connecting to authentication server.";
            adminLoginError.style.display = 'block';
        }
    });

    // OTP Input Focus Handlers
    adminOtpInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            if (e.target.value.length > 0 && index < adminOtpInputs.length - 1) {
                adminOtpInputs[index + 1].focus();
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && e.target.value.length === 0 && index > 0) {
                adminOtpInputs[index - 1].focus();
            }
        });

        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text').trim();
            if (/^\d{6}$/.test(text)) {
                adminOtpInputs.forEach((inp, i) => {
                    inp.value = text[i];
                });
                adminOtpInputs[5].focus();
            }
        });
    });

    let adminOtpCooldownInterval;
    function startAdminOtpCooldown(seconds) {
        btnResendAdminOtp.disabled = true;
        adminOtpTimerSpan.style.display = 'inline';
        let remaining = seconds;
        adminOtpTimerSpan.textContent = ` (${remaining}s)`;

        clearInterval(adminOtpCooldownInterval);
        adminOtpCooldownInterval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(adminOtpCooldownInterval);
                btnResendAdminOtp.disabled = false;
                adminOtpTimerSpan.style.display = 'none';
            } else {
                adminOtpTimerSpan.textContent = ` (${remaining}s)`;
            }
        }, 1000);
    }

    // Resend OTP click
    btnResendAdminOtp.addEventListener('click', async () => {
        adminOtpError.style.display = 'none';
        btnResendAdminOtp.disabled = true;
        const origText = btnResendAdminOtp.textContent;
        btnResendAdminOtp.textContent = 'Resending...';

        try {
            const res = await fetch('/api/login-resend-otp', { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                showToast(data.message || "OTP resent to your Gmail!");
                startAdminOtpCooldown(60);
            } else {
                adminOtpError.textContent = data.message || "Failed to resend code.";
                adminOtpError.style.display = 'block';
            }
        } catch (err) {
            console.error("Resend OTP failed:", err);
            adminOtpError.textContent = "Connection error resending code.";
            adminOtpError.style.display = 'block';
        } finally {
            btnResendAdminOtp.textContent = origText;
            btnResendAdminOtp.disabled = false;
        }
    });

    // OTP form submit
    adminOtpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        adminOtpError.style.display = 'none';
        btnVerifyAdminOtp.disabled = true;
        const origContent = btnVerifyAdminOtp.innerHTML;
        btnVerifyAdminOtp.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';

        const code = Array.from(adminOtpInputs).map(inp => inp.value).join('');
        if (code.length !== 6) {
            adminOtpError.textContent = 'Please enter all 6 digits.';
            adminOtpError.style.display = 'block';
            btnVerifyAdminOtp.disabled = false;
            btnVerifyAdminOtp.innerHTML = origContent;
            return;
        }

        try {
            const res = await fetch('/api/login-verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });

            const data = await res.json().catch(() => ({}));
            if (res.ok && data.status === 'success') {
                localStorage.setItem('aura_owner_login_time', Date.now().toString());
                adminOtpForm.reset();
                adminOtpForm.style.display = 'none';
                adminLoginForm.style.display = 'flex'; // Reset visual form state for future logins
                await checkAdminAuth();
                showToast("Device authorized. Welcome to SBL Admin.");
            } else {
                adminOtpError.textContent = data.message || "Invalid or expired code.";
                adminOtpError.style.display = 'block';
                adminOtpInputs.forEach(inp => inp.value = '');
                adminOtpInputs[0].focus();
            }
        } catch (err) {
            console.error("OTP verification failed:", err);
            adminOtpError.textContent = 'Connection error. Please try again.';
            adminOtpError.style.display = 'block';
        } finally {
            btnVerifyAdminOtp.disabled = false;
            btnVerifyAdminOtp.innerHTML = origContent;
        }
    });


    // Admin Logout button click
    adminLogoutBtn.addEventListener('click', () => {
        logoutAdmin("Logged out from SBL admin portal.");
    });

    // Register activity listeners to reset inactivity timer
    ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'].forEach(eventName => {
        document.addEventListener(eventName, () => {
            if (currentIsLoggedIn) {
                resetInactivityTimer();
            }
        }, { passive: true });
    });

    // Refresh button
    refreshOwnerBtn.addEventListener('click', () => {
        loadDatabase();
        renderDashboard();
        showToast("Database records refreshed.");
    });

    // Re-seed button
    seedOwnerBtn.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/seed', { method: 'POST', credentials: 'include' });
            if (!res.ok) throw new Error('Seed failed');
            const result = await res.json();
            await loadDatabase();
            renderDashboard();
            showToast(result.message || 'Database re-seeded.');
        } catch (err) {
            console.error(err);
            showToast('Failed to seed database.');
        }
    });

    // Close toast trigger
    document.getElementById('closeToastBtn').addEventListener('click', () => {
        toast.classList.remove('active');
    });

    // Real-Time Sync: Listen to localStorage changes in other tabs (storefront)
    window.addEventListener('storage', (e) => {
        if (currentIsLoggedIn) {
            if (e.key === 'aura_registered_users' || e.key === 'aura_activity_logs' || e.key === 'aura_cart' || e.key === 'aura_user' || e.key === 'aura_consultations') {
                loadDatabase();
                renderDashboard();
            }
        }
    });

    // Drag & Drop Image Upload triggers
    const dropzone = document.getElementById('dropzoneContainer');
    const fileInput = document.getElementById('prodImages');

    if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'var(--color-accent-gold)';
            dropzone.style.backgroundColor = 'var(--color-accent-gold-light)';
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.style.borderColor = '#bfb9af';
            dropzone.style.backgroundColor = 'var(--color-bg-white)';
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = '#bfb9af';
            dropzone.style.backgroundColor = 'var(--color-bg-white)';
            if (e.dataTransfer.files.length > 0) {
                handleSelectedFiles(e.dataTransfer.files);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleSelectedFiles(e.target.files);
            }
        });
    }

    // Add Spec button in upload form
    const btnAddSpec = document.getElementById('btnAddSpec');
    if (btnAddSpec) {
        btnAddSpec.addEventListener('click', () => {
            addSpecRow();
        });
    }

    // Cancel edit form
    const cancelEditBtn = document.getElementById('btnCancelEditForm');
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
            resetProductForm();
            window.switchTab('inventory');
        });
    }

    // Submit product form (Save / Update)
    const productForm = document.getElementById('productForm');
    if (productForm) {
        productForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const prodName = document.getElementById('prodName').value.trim();
            const prodCategory = document.getElementById('prodCategory').value;
            const prodMaterial = document.getElementById('prodMaterial').value;
            const prodPurity = document.getElementById('prodPurity').value.trim();
            const prodWeight = document.getElementById('prodWeight').value.trim();
            const prodStock = parseInt(document.getElementById('prodStock').value, 10);
            const prodStatus = document.getElementById('prodStatus').value;
            const prodDescription = document.getElementById('prodDescription').value.trim();

            const isFeatured = document.getElementById('flagFeatured').checked;
            const isNewArrival = document.getElementById('flagNewArrival').checked;
            const isBestSeller = document.getElementById('flagBestSeller').checked;
            const isTrending = document.getElementById('flagTrending').checked;
            const isInStock = document.getElementById('flagInStock').checked;

            // Collect dynamic custom specs
            const customSpecs = {};
            const specRows = document.querySelectorAll('#specsContainer .spec-row');
            specRows.forEach(row => {
                const nameInput = row.querySelector('.spec-name-input');
                const typeSelect = row.querySelector('.spec-type-select');
                if (nameInput && typeSelect) {
                    const key = nameInput.value.trim();
                    if (key) {
                        const type = typeSelect.value;
                        let value;
                        if (type === 'boolean') {
                            value = row.querySelector('.spec-value-checkbox').checked ? 'Yes' : 'No';
                        } else if (type === 'number') {
                            value = parseFloat(row.querySelector('.spec-value-input').value) || 0;
                        } else {
                            value = row.querySelector('.spec-value-input').value.trim();
                        }
                        customSpecs[key] = value;
                    }
                }
            });

            const productPayload = {
                name: prodName,
                category: prodCategory,
                material: prodMaterial,
                purity: prodPurity,
                weight: prodWeight,
                price: 0,
                stock: prodStock,
                status: prodStatus,
                details: prodDescription,
                isFeatured: isFeatured,
                isNewArrival: isNewArrival,
                isBestSeller: isBestSeller,
                isTrending: isTrending,
                isInStock: isInStock,
                images: uploadedImagesBase64,
                specs: customSpecs
            };

            if (editingProductId) {
                productPayload.id = editingProductId;
            }

            try {
                const res = await fetch('/api/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(productPayload)
                });

                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.message || 'Failed to save product');
                }

                const result = await res.json();
                showToast(result.message || 'Product saved successfully!');
                resetProductForm();
                await loadDatabase();
                renderDashboard();
                window.switchTab('inventory');
            } catch (err) {
                console.error(err);
                showToast('Error: ' + err.message);
            }
        });
    }

    // Real-Time Inventory Filters event listeners
    const searchInput = document.getElementById('inventorySearch');
    const catSelect = document.getElementById('filterCategory');
    const matSelect = document.getElementById('filterMaterial');
    const statusSelect = document.getElementById('filterStatus');

    if (searchInput) searchInput.addEventListener('input', renderInventory);
    if (catSelect) catSelect.addEventListener('change', renderInventory);
    if (matSelect) matSelect.addEventListener('change', renderInventory);
    if (statusSelect) statusSelect.addEventListener('change', renderInventory);

    // Collections Image Upload Dropzone
    const collDropzone = document.getElementById('collDropzoneContainer');
    const collFileInput = document.getElementById('collImage');

    if (collDropzone && collFileInput) {
        collDropzone.addEventListener('click', () => collFileInput.click());

        collDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            collDropzone.style.borderColor = 'var(--color-accent-gold)';
            collDropzone.style.backgroundColor = 'var(--color-accent-gold-light)';
        });

        collDropzone.addEventListener('dragleave', () => {
            collDropzone.style.borderColor = '#bfb9af';
            collDropzone.style.backgroundColor = 'var(--color-bg-white)';
        });

        collDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            collDropzone.style.borderColor = '#bfb9af';
            collDropzone.style.backgroundColor = 'var(--color-bg-white)';
            if (e.dataTransfer.files.length > 0) {
                handleCollectionSelectedFile(e.dataTransfer.files[0]);
            }
        });

        collFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleCollectionSelectedFile(e.target.files[0]);
            }
        });
    }

    // Submit collection form
    const collectionForm = document.getElementById('collectionForm');
    if (collectionForm) {
        collectionForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const title = document.getElementById('collTitle').value.trim();
            const subtitle = document.getElementById('collSubtitle').value.trim();
            const category = document.getElementById('collCategory').value;

            const collectionPayload = {
                title: title,
                subtitle: subtitle,
                category: category,
                image: uploadedCollectionImageBase64
            };

            if (editingCollectionId) {
                collectionPayload.id = editingCollectionId;
            }

            try {
                const res = await fetch('/api/collections', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(collectionPayload)
                });

                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.message || 'Failed to save collection');
                }

                const result = await res.json();
                showToast(result.message || 'Collection saved successfully!');
                resetCollectionForm();
                await loadDatabase();
                renderDashboard();
            } catch (err) {
                console.error(err);
                showToast('Error: ' + err.message);
            }
        });
    }

    // Cancel edit collection button
    const cancelCollEditBtn = document.getElementById('btnCancelCollectionEdit');
    if (cancelCollEditBtn) {
        cancelCollEditBtn.addEventListener('click', () => {
            resetCollectionForm();
        });
    }
}

// Toast helper
function showToast(message) {
    toastMessage.textContent = message;
    toast.classList.add('active');
    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
        toast.classList.remove('active');
    }, 3000);
}

// 8. ACTIONS: DELETE CUSTOMER
window.deleteUserFromDB = async function (email, phone) {
    try {
        const res = await fetch('/api/customers', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, phone })
        });
        if (!res.ok) throw new Error('Delete failed');
        const result = await res.json();
        // Refresh data
        await loadDatabase();
        renderDashboard();
        showToast(result.message || 'User removed from database.');
    } catch (err) {
        console.error(err);
        showToast('Failed to delete user.');
    }
};

// Toggle elite status of registered client
window.toggleEliteStatus = async function (email, isElite) {
    try {
        const res = await fetch('/api/customers/elite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, isElite })
        });
        if (!res.ok) throw new Error('Elite status toggle failed');
        const result = await res.json();
        await loadDatabase();
        renderDashboard();
        showToast(result.message || 'User elite status updated.');
    } catch (err) {
        console.error(err);
        showToast('Failed to update elite status.');
    }
};

// 9. ACTIONS: DELETE CONSULTATION
window.deleteBooking = async function (id) {
    try {
        const res = await fetch(`/api/consultations/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        if (!res.ok) throw new Error('Delete failed');
        const result = await res.json();
        await loadDatabase();
        renderDashboard();
        showToast(result.message || 'Consultation archived.');
    } catch (err) {
        console.error(err);
        showToast('Failed to delete consultation.');
    }
};

// Toggle password visibility on dashboard
window.togglePasswordVisibility = function (elementIdId, passwordValue) {
    const el = document.getElementById('pwd-' + elementIdId);
    if (!el) return;
    if (el.textContent === '- hidden -') {
        el.textContent = passwordValue;
        el.style.color = 'var(--color-accent-gold-hover)';
        event.currentTarget.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Hide';
    } else {
        el.textContent = '- hidden -';
        el.style.color = 'var(--color-text-muted)';
        event.currentTarget.innerHTML = '<i class="fa-solid fa-eye"></i> Show';
    }
};

// ---------- PRODUCT MANAGEMENT HELPER ACTIONS ---------- //

// Handle Reading Files and converting to base64 strings
function handleSelectedFiles(files) {
    const maxAllowed = 3;
    const remaining = maxAllowed - uploadedImagesBase64.length;
    if (remaining <= 0) {
        showToast("Maximum of 3 images can be uploaded per product.");
        return;
    }

    const filesToUpload = Array.from(files).slice(0, remaining);

    filesToUpload.forEach(file => {
        if (!file.type.startsWith('image/')) {
            showToast("Only image files are allowed.");
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            uploadedImagesBase64.push(e.target.result);
            renderImagePreviews();
        };
        reader.readAsDataURL(file);
    });
}

// Render uploaded images preview thumbnails
function renderImagePreviews() {
    const container = document.getElementById('thumbnailPreviewContainer');
    if (!container) return;

    container.innerHTML = '';
    uploadedImagesBase64.forEach((base64Url, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'thumbnail-wrapper';
        wrapper.innerHTML = `
            <img src="${base64Url}" alt="Preview image ${idx + 1}">
            <button type="button" class="btn-delete-thumbnail" onclick="removeUploadedImage(${idx})">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;
        container.appendChild(wrapper);
    });
}

// Remove an uploaded image
window.removeUploadedImage = function (idx) {
    uploadedImagesBase64.splice(idx, 1);
    renderImagePreviews();
};

// Reset product upload/edit form state
function resetProductForm() {
    const form = document.getElementById('productForm');
    if (!form) return;

    form.reset();
    editingProductId = null;
    uploadedImagesBase64 = [];
    renderImagePreviews();

    const specsContainer = document.getElementById('specsContainer');
    if (specsContainer) specsContainer.innerHTML = '';

    document.getElementById('formTitleText').innerHTML = '<i class="fa-solid fa-circle-plus" style="color: var(--color-accent-gold);"></i> Upload Product';
    document.getElementById('formSubTitleText').textContent = 'Add a new jewellery piece to the public catalog.';
    document.getElementById('btnSubmitForm').textContent = 'Save Product';
    document.getElementById('btnCancelEditForm').style.display = 'none';
}

// Render inventory products list
function renderInventory() {
    const inventoryTableBody = document.getElementById('inventoryTableBody');
    if (!inventoryTableBody) return;

    inventoryTableBody.innerHTML = '';

    if (dbProducts.length === 0) {
        inventoryTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No products in database. Seeding will run on next load.</td></tr>`;
        return;
    }

    // Get filter inputs
    const query = (document.getElementById('inventorySearch')?.value || '').toLowerCase().trim();
    const category = document.getElementById('filterCategory')?.value || 'all';
    const material = document.getElementById('filterMaterial')?.value || 'all';
    const status = document.getElementById('filterStatus')?.value || 'all';

    // Apply filtering
    const filteredProducts = dbProducts.filter(product => {
        // Search filter
        if (query) {
            const nameMatch = product.name.toLowerCase().includes(query);
            const descMatch = (product.details || '').toLowerCase().includes(query);
            const matMatch = (product.material || '').toLowerCase().includes(query);
            const catMatch = (product.category || '').toLowerCase().includes(query);
            if (!nameMatch && !descMatch && !matMatch && !catMatch) return false;
        }

        // Category filter
        if (category !== 'all' && product.category !== category) return false;

        // Material filter
        if (material !== 'all') {
            const prodMaterial = (product.material || '').toLowerCase();
            const filterMat = material.toLowerCase();
            if (filterMat === 'gold') {
                if (!prodMaterial.includes('gold')) return false;
            } else {
                if (prodMaterial !== filterMat) return false;
            }
        }

        // Status filter
        if (status !== 'all' && product.status !== status) return false;

        return true;
    });

    if (filteredProducts.length === 0) {
        inventoryTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No products match the selected filters.</td></tr>`;
        return;
    }

    filteredProducts.forEach((product, index) => {
        // Build badges for flags
        let badgesHtml = '';
        if (product.isFeatured) badgesHtml += '<span class="admin-badge flag-feat">Featured</span> ';
        if (product.isNewArrival) badgesHtml += '<span class="admin-badge flag-new">New</span> ';
        if (product.isBestSeller) badgesHtml += '<span class="admin-badge flag-best">Best Seller</span> ';
        if (product.isTrending) badgesHtml += '<span class="admin-badge flag-trend">Trending</span> ';
        if (product.isInStock) badgesHtml += '<span class="admin-badge flag-instock">In Stock</span> ';

        let statusClass = 'status-inactive';
        if (product.status === 'Active') statusClass = 'status-active';
        else if (product.status === 'Out of Stock') statusClass = 'status-out';

        const tr = document.createElement('tr');
        if (editingProductId && product.id === editingProductId) {
            tr.style.backgroundColor = 'rgba(197, 160, 89, 0.08)';
        }

        const mainImage = product.images && product.images.length > 0 ? product.images[0] : (product.image || 'assets/diamond_ring.png');

        tr.innerHTML = `
            <td style="font-weight: 600; color: var(--color-accent-gold-hover); text-align: center;">${index + 1}</td>
            <td>
                <div style="display: flex; gap: 0.75rem; align-items: center;">
                    <img class="product-table-thumb" src="${mainImage}" alt="${product.name}">
                    <div>
                        <div class="owner-table-user-name">${product.name}</div>
                        <div style="font-size: 0.75rem; color: var(--color-text-muted);">${product.category} • ${product.material || 'Metal'} (${product.purity || 'N/A'})</div>
                    </div>
                </div>
            </td>
            <td>
                <span class="admin-badge ${statusClass}">${product.status}</span>
                <div class="badge-container">${badgesHtml}</div>
            </td>
            <td>
                <div>Price: <strong>₹${getProductPrice(product, liveRates).toLocaleString('en-IN')}</strong></div>
                <div style="font-size: 0.75rem; color: var(--color-text-muted);">Stock: ${product.stock} units</div>
            </td>
            <td>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <button class="action-btn-small" onclick="editProduct(${product.id})" style="border: var(--border-luxury); cursor: pointer;"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
                    <button class="owner-table-action-btn" onclick="deleteProduct(${product.id})" style="color: #e25c5c; cursor: pointer;"><i class="fa-solid fa-trash-can"></i> Delete</button>
                </div>
            </td>
        `;
        inventoryTableBody.appendChild(tr);
    });

    const storefrontInventoryCountEl = document.getElementById('storefrontInventoryCount');
    if (storefrontInventoryCountEl) {
        if (filteredProducts.length === dbProducts.length) {
            storefrontInventoryCountEl.textContent = dbProducts.length;
        } else {
            storefrontInventoryCountEl.textContent = `${filteredProducts.length} of ${dbProducts.length}`;
        }
    }
}

// Edit product - populate form
window.editProduct = function (id) {
    const product = dbProducts.find(p => p.id === id);
    if (!product) return;

    editingProductId = id;

    // Switch to upload product tab
    window.switchTab('upload');

    // Set fields
    document.getElementById('formProductId').value = product.id;
    document.getElementById('prodName').value = product.name;
    document.getElementById('prodCategory').value = product.category;
    document.getElementById('prodMaterial').value = product.material;
    document.getElementById('prodPurity').value = product.purity || '';
    document.getElementById('prodWeight').value = product.weight || '';
    document.getElementById('prodStock').value = product.stock;
    document.getElementById('prodStatus').value = product.status || 'Active';
    document.getElementById('prodDescription').value = product.details || '';

    // Set checkboxes
    document.getElementById('flagFeatured').checked = !!product.isFeatured;
    document.getElementById('flagNewArrival').checked = !!product.isNewArrival;
    document.getElementById('flagBestSeller').checked = !!product.isBestSeller;
    document.getElementById('flagTrending').checked = !!product.isTrending;
    document.getElementById('flagInStock').checked = !!product.isInStock;

    // Load images
    uploadedImagesBase64 = product.images && Array.isArray(product.images) ? [...product.images] : [product.image];
    renderImagePreviews();

    // Populate custom specs
    const specsContainer = document.getElementById('specsContainer');
    if (specsContainer) {
        specsContainer.innerHTML = '';
        if (product.specs) {
            Object.entries(product.specs).forEach(([key, val]) => {
                if (['Metal', 'Purity', 'Weight'].includes(key)) return;

                let datatype = 'text';
                if (typeof val === 'number') {
                    datatype = 'number';
                } else if (val === 'Yes' || val === 'No' || typeof val === 'boolean') {
                    datatype = 'boolean';
                }
                addSpecRow(key, val, datatype);
            });
        }
    }

    // Update labels
    document.getElementById('formTitleText').innerHTML = `<i class="fa-solid fa-pen-to-square" style="color: var(--color-accent-gold);"></i> Editing Product #${id}`;
    document.getElementById('formSubTitleText').textContent = `Modifying "${product.name}" details.`;
    document.getElementById('btnSubmitForm').textContent = 'Update Product';
    document.getElementById('btnCancelEditForm').style.display = 'inline-block';

    // Scroll form into view
    document.getElementById('productForm').scrollIntoView({ behavior: 'smooth' });

    // Highlight table row
    renderInventory();
};

// Delete product
window.deleteProduct = async function (id) {
    if (!confirm("Are you sure you want to permanently delete this product?")) {
        return;
    }

    try {
        const res = await fetch(`/api/products/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.message || 'Failed to delete product');
        }

        const result = await res.json();
        showToast(result.message || 'Product deleted successfully!');
        if (editingProductId === id) {
            resetProductForm();
        }
        await loadDatabase();
        renderDashboard();
    } catch (err) {
        console.error(err);
        showToast('Error: ' + err.message);
    }
};

// Poll activities endpoint /api/logs every second
async function pollLogs() {
    try {
        const res = await fetch('/api/logs', { credentials: 'include' });
        if (!res.ok) return;
        const logs = await res.json();

        // If lastMaxLogId is -1, initialize it with the current maximum log ID
        if (lastMaxLogId === -1) {
            lastMaxLogId = logs.length > 0 ? Math.max(...logs.map(l => l.id)) : 0;
            return;
        }

        // Find new logs
        const newLogs = logs.filter(l => l.id > lastMaxLogId);

        if (newLogs.length > 0) {
            // Sort new logs by ID ascending so they alert in order of occurrence
            newLogs.sort((a, b) => a.id - b.id);

            let shouldRefresh = false;
            newLogs.forEach(log => {
                // Determine if it is a customer action
                const isCustomerAction = !log.text.includes('Administrator') && !log.text.includes('Admin');
                if (isCustomerAction) {
                    showAdminAlert(log);
                    shouldRefresh = true;
                }
            });

            // Update lastMaxLogId to the highest ID seen
            lastMaxLogId = Math.max(...logs.map(l => l.id), lastMaxLogId);

            if (shouldRefresh) {
                // Refresh dashboard stats and tables dynamically
                await loadDatabase();
                renderDashboard();
            }
        }
    } catch (err) {
        console.error("Error polling activity logs:", err);
    }
}

// Render dynamic slide-in alerts on the owner dashboard
function showAdminAlert(log) {
    const container = document.getElementById('adminAlertContainer');
    if (!container) return;

    const card = document.createElement('div');
    card.className = 'admin-alert-card';

    // Set icon based on type/content
    let iconClass = 'fa-bell';
    if (log.type === 'success') {
        iconClass = 'fa-circle-check';
    } else if (log.type === 'action') {
        iconClass = 'fa-circle-play';
    } else if (log.type === 'warning') {
        iconClass = 'fa-triangle-exclamation';
    }

    card.innerHTML = `
        <div class="admin-alert-icon"><i class="fa-solid ${iconClass}"></i></div>
        <div class="admin-alert-content">
            <span class="admin-alert-title">Customer Action</span>
            <span class="admin-alert-text">${log.text}</span>
        </div>
        <button class="admin-alert-close" onclick="this.parentElement.classList.remove('show'); setTimeout(() => this.parentElement.remove(), 400);"><i class="fa-solid fa-xmark"></i></button>
    `;

    container.appendChild(card);

    // Slide in alert card
    setTimeout(() => {
        card.classList.add('show');
    }, 50);

    // Auto-dismiss alert card after 5 seconds
    setTimeout(() => {
        if (card.parentNode) {
            card.classList.add('fade-out');
            setTimeout(() => {
                if (card.parentNode) card.remove();
            }, 400);
        }
    }, 5000);
}

// Toggle password field visibility
window.togglePassword = function (inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const icon = btnEl.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) {
            icon.className = 'fa-solid fa-eye-slash';
        }
        btnEl.setAttribute('title', 'Hide password');
    } else {
        input.type = 'password';
        if (icon) {
            icon.className = 'fa-solid fa-eye';
        }
        btnEl.setAttribute('title', 'Show password');
    }
};

// ---------- COLLECTIONS MANAGEMENT HELPER ACTIONS ---------- //

// Render Collections Table
window.renderCollectionsTable = function () {
    const collectionsTableBody = document.getElementById('collectionsTableBody');
    if (!collectionsTableBody) return;

    collectionsTableBody.innerHTML = '';

    if (dbCollections.length === 0) {
        collectionsTableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No collections in database.</td></tr>`;
        return;
    }

    dbCollections.forEach((collection, index) => {
        const tr = document.createElement('tr');
        if (editingCollectionId && collection.id === editingCollectionId) {
            tr.style.backgroundColor = 'rgba(197, 160, 89, 0.08)';
        }

        const imgUrl = collection.image || 'assets/diamond_ring.png';

        tr.innerHTML = `
            <td style="font-weight: 600; color: var(--color-accent-gold-hover); text-align: center;">${index + 1}</td>
            <td>
                <div style="display: flex; gap: 0.75rem; align-items: center;">
                    <img class="product-table-thumb" src="${imgUrl}" alt="${collection.title}" style="width: 50px; height: 50px; object-fit: cover; border-radius: var(--border-radius-sm);">
                    <div>
                        <div class="owner-table-user-name">${collection.title}</div>
                        <div style="font-size: 0.75rem; color: var(--color-text-muted); max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${collection.subtitle}</div>
                    </div>
                </div>
            </td>
            <td>
                <span class="admin-badge status-active">${collection.category}</span>
            </td>
            <td>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <button class="action-btn-small" onclick="editCollection(${collection.id})" style="border: var(--border-luxury); cursor: pointer;"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
                    <button class="owner-table-action-btn" onclick="deleteCollection(${collection.id})" style="color: #e25c5c; cursor: pointer; margin: 0;"><i class="fa-solid fa-trash-can"></i> Delete</button>
                </div>
            </td>
        `;
        collectionsTableBody.appendChild(tr);
    });

    const storefrontCollectionsCountEl = document.getElementById('storefrontCollectionsCount');
    if (storefrontCollectionsCountEl) storefrontCollectionsCountEl.textContent = dbCollections.length;
};

// Edit collection
window.editCollection = function (id) {
    const collection = dbCollections.find(c => c.id === id);
    if (!collection) return;

    editingCollectionId = id;

    // Set fields
    document.getElementById('formCollectionId').value = collection.id;
    document.getElementById('collTitle').value = collection.title;
    document.getElementById('collSubtitle').value = collection.subtitle;
    document.getElementById('collCategory').value = collection.category;

    // Load image preview
    uploadedCollectionImageBase64 = collection.image;
    renderCollectionImagePreview();

    // Update labels
    document.getElementById('collectionFormTitleText').innerHTML = `<i class="fa-solid fa-pen-to-square" style="color: var(--color-accent-gold);"></i> Editing Collection #${id}`;
    document.getElementById('collectionFormSubTitleText').textContent = `Modifying "${collection.title}" details.`;
    document.getElementById('btnSubmitCollectionForm').textContent = 'Update Collection';
    document.getElementById('btnCancelCollectionEdit').style.display = 'inline-block';

    // Highlight table row
    renderCollectionsTable();
};

// Delete collection
window.deleteCollection = async function (id) {
    if (!confirm("Are you sure you want to permanently delete this collection?")) {
        return;
    }

    try {
        const res = await fetch(`/api/collections/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.message || 'Failed to delete collection');
        }

        const result = await res.json();
        showToast(result.message || 'Collection deleted successfully!');
        if (editingCollectionId === id) {
            resetCollectionForm();
        }
        await loadDatabase();
        renderDashboard();
    } catch (err) {
        console.error(err);
        showToast('Error: ' + err.message);
    }
};

// Reset collection form
window.resetCollectionForm = function () {
    editingCollectionId = null;
    uploadedCollectionImageBase64 = null;

    document.getElementById('formCollectionId').value = '';
    document.getElementById('collTitle').value = '';
    document.getElementById('collSubtitle').value = '';
    document.getElementById('collCategory').selectedIndex = 0;

    // Reset file inputs
    document.getElementById('collImage').value = '';

    // Reset image preview
    const previewContainer = document.getElementById('collThumbnailPreviewContainer');
    if (previewContainer) previewContainer.innerHTML = '';

    // Reset labels
    document.getElementById('collectionFormTitleText').innerHTML = `<i class="fa-solid fa-circle-plus" style="color: var(--color-accent-gold);"></i> Add Collection`;
    document.getElementById('collectionFormSubTitleText').textContent = 'Create a new collection theme for the shop.';
    document.getElementById('btnSubmitCollectionForm').textContent = 'Save Collection';
    document.getElementById('btnCancelCollectionEdit').style.display = 'none';

    // Re-render table to clear highlighting
    renderCollectionsTable();
};

// Handle collection image file selection
window.handleCollectionSelectedFile = function (file) {
    if (!file.type.startsWith('image/')) {
        showToast("Only image files are allowed.");
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        uploadedCollectionImageBase64 = e.target.result;
        renderCollectionImagePreview();
    };
    reader.readAsDataURL(file);
};

// Render collection cover image preview
window.renderCollectionImagePreview = function () {
    const container = document.getElementById('collThumbnailPreviewContainer');
    if (!container) return;

    container.innerHTML = '';
    if (!uploadedCollectionImageBase64) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'thumbnail-wrapper';
    wrapper.innerHTML = `
        <img src="${uploadedCollectionImageBase64}" alt="Collection Cover Preview">
        <button type="button" class="btn-delete-thumbnail" onclick="removeUploadedCollectionImage()">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;
    container.appendChild(wrapper);
};

// Remove uploaded collection image
window.removeUploadedCollectionImage = function () {
    uploadedCollectionImageBase64 = null;
    document.getElementById('collImage').value = '';
    renderCollectionImagePreview();
};

// ---------- DYNAMIC CUSTOM PRODUCT SPECIFICATIONS BUILDER ---------- //

window.addSpecRow = function (name = '', value = '', datatype = 'text') {
    const container = document.getElementById('specsContainer');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'spec-row';
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '1.2fr 1fr 1.5fr auto';
    row.style.gap = '0.75rem';
    row.style.alignItems = 'center';
    row.style.background = 'var(--color-bg-light)';
    row.style.padding = '0.5rem 0.75rem';
    row.style.borderRadius = 'var(--border-radius-sm)';
    row.style.border = '1px solid #ede8e0';

    row.innerHTML = `
        <div>
            <input type="text" placeholder="Spec Name (e.g. Stone, Setting)" value="${name}" class="spec-name-input" required style="width: 100%; padding: 0.5rem; border: var(--border-luxury); border-radius: var(--border-radius-sm);">
        </div>
        <div>
            <select class="spec-type-select" onchange="handleSpecTypeChange(this)" style="width: 100%; padding: 0.5rem; border: var(--border-luxury); border-radius: var(--border-radius-sm); background: white;">
                <option value="text" ${datatype === 'text' ? 'selected' : ''}>Text</option>
                <option value="number" ${datatype === 'number' ? 'selected' : ''}>Number</option>
                <option value="boolean" ${datatype === 'boolean' ? 'selected' : ''}>Boolean</option>
            </select>
        </div>
        <div class="spec-val-container">
            <!-- Input will be dynamically injected -->
        </div>
        <button type="button" onclick="this.parentElement.remove()" style="background: none; border: none; color: #e25c5c; cursor: pointer; padding: 0.25rem 0.5rem;" title="Remove specification"><i class="fa-solid fa-trash-can"></i></button>
    `;

    container.appendChild(row);

    const typeSelect = row.querySelector('.spec-type-select');
    handleSpecTypeChange(typeSelect, value);
};

window.handleSpecTypeChange = function (selectEl, value = '') {
    const row = selectEl.closest('.spec-row');
    const valContainer = row.querySelector('.spec-val-container');
    const type = selectEl.value;

    valContainer.innerHTML = '';

    if (type === 'boolean') {
        const checked = value === true || value === 'true' || value === 'Yes';
        valContainer.innerHTML = `
            <label class="checkbox-label" style="margin: 0; padding: 0.25rem 0; display: inline-flex; align-items: center; gap: 0.4rem;">
                <input type="checkbox" class="spec-value-checkbox" ${checked ? 'checked' : ''}>
                <span class="custom-checkbox"></span>
                Yes
            </label>
        `;
    } else if (type === 'number') {
        valContainer.innerHTML = `
            <input type="number" placeholder="Value" value="${value}" class="spec-value-input" required style="width: 100%; padding: 0.5rem; border: var(--border-luxury); border-radius: var(--border-radius-sm);">
        `;
    } else {
        valContainer.innerHTML = `
            <input type="text" placeholder="Value" value="${value}" class="spec-value-input" required style="width: 100%; padding: 0.5rem; border: var(--border-luxury); border-radius: var(--border-radius-sm);">
        `;
    }
};
