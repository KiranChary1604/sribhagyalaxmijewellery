/* ==========================================================================

   AURA FINE JEWELLERY - APPLICATION SCRIPT
   ========================================================================== */

// 1. PRODUCT DATABASE & FALLBACK
const INITIAL_PRODUCTS = [
    {
        id: 1,
        name: "Solitaire Diamond Engagement Ring",
        category: "Rings",
        price: 700000,
        material: "Platinum",
        image: "assets/diamond_ring.png",
        rating: 4.9,
        reviews: 28,
        details: "A brilliant round-cut 2.0 carat solitaire diamond set on a polished platinum band of timeless beauty and exceptional purity. Excellent cut, color grade F, clarity VS1.",
        specs: {
            "Stone": "Round Brilliant Diamond",
            "Weight": "2.0 Carat",
            "Metal": "950 Platinum",
            "Setting": "4-Prong Classic"
        },
        purity: "950",
        weight: "2.0 Carat",
        stock: 5,
        status: "Active",
        isFeatured: true,
        isNewArrival: false,
        isBestSeller: true,
        isTrending: true,
        isInStock: true,
        images: ["assets/diamond_ring.png"]
    },
    {
        id: 2,
        name: "Yellow Gold Diamond Pendant",
        category: "Necklaces",
        price: 200000,
        material: "Yellow Gold",
        image: "assets/gold_necklace.png",
        rating: 4.7,
        reviews: 14,
        details: "A modern 18k yellow gold pendant featuring a delicate bar design with micro-pavé set diamonds suspended on a thin, elegant chain.",
        specs: {
            "Stone": "Pavé Diamonds (0.35 ctw)",
            "Metal": "18k Yellow Gold",
            "Length": "18 Inches (adjustable)",
            "Clasp": "Lobster Clasp"
        },
        purity: "18k",
        weight: "0.35 ctw",
        stock: 12,
        status: "Active",
        isFeatured: false,
        isNewArrival: true,
        isBestSeller: false,
        isTrending: false,
        isInStock: true,
        images: ["assets/gold_necklace.png"]
    },
    {
        id: 3,
        name: "Tahitian Pearl Drop Earrings",
        category: "Earrings",
        price: 150000,
        material: "White Gold",
        image: "assets/pearl_earrings.png",
        rating: 4.8,
        reviews: 19,
        details: "Exquisite dark Tahitian pearls (9mm) suspended from micro-pavé encrusted 18k white gold studs. Designed to sway gently with your movement.",
        specs: {
            "Stone": "Tahitian Black Pearls",
            "Metal": "18k White Gold",
            "Backing": "Push Back"
        },
        purity: "18k",
        weight: "9mm",
        stock: 8,
        status: "Active",
        isFeatured: true,
        isNewArrival: true,
        isBestSeller: true,
        isTrending: false,
        isInStock: true,
        images: ["assets/pearl_earrings.png"]
    },
    {
        id: 4,
        name: "Emerald & Diamond Tennis Bracelet",
        category: "Bracelets",
        price: 1000000,
        material: "Yellow Gold",
        image: "assets/emerald_bracelet.png",
        rating: 5.0,
        reviews: 9,
        details: "An elite statement bracelet featuring alternating round-cut brilliant diamonds and premium vivid green Zambian emeralds in an 18k yellow gold setting.",
        specs: {
            "Stone": "Emeralds (4.0 ct), Diamonds (3.5 ctw)",
            "Metal": "18k Yellow Gold",
            "Length": "7 Inches",
            "Clasp": "Double-Safety Box Clasp"
        },
        purity: "18k",
        weight: "4.0 ct",
        stock: 3,
        status: "Active",
        isFeatured: true,
        isNewArrival: false,
        isBestSeller: false,
        isTrending: true,
        isInStock: true,
        images: ["assets/emerald_bracelet.png"]
    }
];

const INITIAL_COLLECTIONS = [
    {
        id: 1,
        title: "Eternity Rings",
        subtitle: "Brilliant solitaires & diamond eternity bands",
        category: "Rings",
        image: "assets/diamond_ring.png"
    },
    {
        id: 2,
        title: "Fine Necklaces",
        subtitle: "22k gold pendants and luxury chokers",
        category: "Necklaces",
        image: "assets/gold_necklace.png"
    },
    {
        id: 3,
        title: "Exquisite Earrings",
        subtitle: "Pearl drops, studs, and diamond hoops",
        category: "Earrings",
        image: "assets/pearl_earrings.png"
    },
    {
        id: 4,
        title: "Luxe Bracelets",
        subtitle: "Emerald cuffs and sparkling tennis chains",
        category: "Bracelets",
        image: "assets/emerald_bracelet.png"
    }
];

let products = [];
let collections = [];

// 2. STATE MANAGEMENT
// Simple useState hook implementation for vanilla JavaScript
function useState(initialValue, listener) {
    let state = initialValue;
    const getValue = () => state;
    const setValue = (newValue) => {
        if (typeof newValue === 'function') {
            state = newValue(state);
        } else {
            state = newValue;
        }
        if (listener) listener(state);
    };
    // Initialize immediately, deferred to the next event loop tick to allow variable assignment
    if (listener) {
        setTimeout(() => {
            try {
                listener(state);
            } catch (err) {
                console.error("Error executing initial state listener:", err);
            }
        }, 0);
    }
    return [getValue, setValue];
}

const [getBullionRates, setBullionRates] = useState(
    {
        goldRate: 'Loading...',
        goldChange: 0,
        goldUnit: 'g',
        silverRate: 'Loading...',
        silverChange: 0,
        silverUnit: 'kg'
    },
    (state) => renderBullionRatesUI(state)
);
let currentUser = JSON.parse(localStorage.getItem('aura_user')) || null;
const [getCart, setCart] = useState(
    JSON.parse(localStorage.getItem('aura_cart')) || [],
    (state) => {
        localStorage.setItem('aura_cart', JSON.stringify(state));
        if (currentUser) {
            fetch('/api/cart/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: currentUser.email,
                    cart: state
                })
            })
                .then(res => {
                    if (!res.ok) console.error("Failed to sync cart with database");
                })
                .catch(err => {
                    console.error("Error syncing cart:", err);
                });
        }
        updateBadges(state);
        renderCart(state);
    }
);
let registeredUsers = [];
let activityLogs = [];
let showAllProducts = false;
let showAllCollections = false;



const filters = {
    category: 'all',
    materials: [],
    maxPrice: 1500000,
    search: '',
    sortBy: 'default'
};

// 3. DOM ELEMENTS
const productsGrid = document.getElementById('productsGrid');
const emptyState = document.getElementById('emptyState');
const activeFiltersRow = document.getElementById('activeFiltersRow');
const priceRange = document.getElementById('priceRange');
const priceVal = document.getElementById('priceVal');
const sortBy = document.getElementById('sortBy');
const searchInput = document.getElementById('searchInput');
const searchOverlay = document.getElementById('searchOverlay');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

// Badge counts
const cartBadge = document.getElementById('cartBadge');
const cartCount = document.getElementById('cartCount');

// Overlays/Drawers
const cartOverlay = document.getElementById('cartOverlay');
const cartDrawer = document.getElementById('cartDrawer');
const productModal = document.getElementById('productModal');
const filtersSidebar = document.getElementById('filtersSidebar');

// Forms
const bookingForm = document.getElementById('bookingForm');
const bookingSuccess = document.getElementById('bookingSuccess');
const successClientName = document.getElementById('successClientName');
const newsletterForm = document.getElementById('newsletterForm');
const newsletterSuccess = document.getElementById('newsletterSuccess');

// Account elements
const accountModal = document.getElementById('accountModal');
const accountToggleBtn = document.getElementById('accountToggleBtn');
const closeAccountModalBtn = document.getElementById('closeAccountModalBtn');
const authView = document.getElementById('authView');
const loggedInView = document.getElementById('loggedInView');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const profileGreeting = document.getElementById('profileGreeting');
const profileEmail = document.getElementById('profileEmail');
const profilePhone = document.getElementById('profilePhone');
const profileAvatar = document.getElementById('profileAvatar');
const logoutBtn = document.getElementById('logoutBtn');
const tabLoginBtn = document.getElementById('tabLoginBtn');
const tabRegisterBtn = document.getElementById('tabRegisterBtn');
const registerErrorMsg = document.getElementById('registerErrorMsg');

// 4. INITIALIZE APP
const initApp = async () => {
    initOwnerDB();
    updateBadges();
    await loadProducts();
    await loadCollections();
    if (currentUser) {
        await syncUserProfile();
    }
    updateUserUI();
    setupEventListeners();

    // Initialize Live Gold Rate updates (server poll every 5 min, tick update every 1 sec)
    updateGoldRate().then(() => {
        tickRates();
    });
    setInterval(updateGoldRate, 300000); // Poll server every 5 minutes
    setInterval(tickRates, 1000);        // Animate local ticker every 1 second

    // Setup periodic 5-minute login reminder for guest users
    setInterval(() => {
        if (!currentUser) {
            updateUserUI();
            accountModal.classList.add('active');
            showToast("Please log in or create an account to get the full experience.");
        }
    }, 300000); // 5 minutes

    // Handle query parameter actions (like opening cart, account, search on page load)
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    if (action === 'cart' && typeof cartOverlay !== 'undefined' && cartOverlay) {
        cartOverlay.classList.add('active');
    } else if (action === 'account' && typeof accountModal !== 'undefined' && accountModal) {
        accountModal.classList.add('active');
    } else if (action === 'search' && typeof searchOverlay !== 'undefined' && searchOverlay) {
        searchOverlay.classList.add('active');
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
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
    const goldRate = (rates && rates.goldRate && rates.goldRate !== 'Loading...') ? parseFloat(rates.goldRate) : 6235.20;
    const silverRate = (rates && rates.silverRate && rates.silverRate !== 'Loading...') ? parseFloat(rates.silverRate) : 78450.00;

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

// Base rates cache for client-side ticker simulation
let baseRates = {
    goldRate: 7350.00, // Realistic fallback rate per gram (INR)
    goldChange: 0.50,
    goldUnit: 'g',
    silverRate: 88500.00, // Realistic fallback rate per kg (INR)
    silverChange: -0.20,
    silverUnit: 'kg'
};

// Fetch and update the gold & silver rates dynamically
async function updateGoldRate() {
    try {
        const res = await fetch('/api/gold-rate');
        if (!res.ok) throw new Error('API request failed');
        const data = await res.json();
        
        // Update base rates cache
        baseRates.goldRate = parseFloat(data.goldRate) || 7350.00;
        baseRates.goldChange = parseFloat(data.goldChange) || 0.50;
        baseRates.goldUnit = data.goldUnit || 'g';
        baseRates.silverRate = parseFloat(data.silverRate) || 88500.00;
        baseRates.silverChange = parseFloat(data.silverChange) || -0.20;
        baseRates.silverUnit = data.silverUnit || 'kg';
        
        // Force an immediate ticker update
        tickRates();
    } catch (err) {
        console.error("Failed to load gold & silver rate from server:", err);
        // Load fallback values into the cache
        baseRates.goldRate = 7350.00;
        baseRates.goldChange = 0.50;
        baseRates.silverRate = 88500.00;
        baseRates.silverChange = -0.20;
        tickRates();
    }
}

// Client-side ticker simulator to animate micro-fluctuations every second
function tickRates() {
    // If state is still 'Loading...' and we haven't fetched fallback/live rates yet, let it load
    const currentRates = getBullionRates();
    if (baseRates.goldRate === 7350.00 && currentRates && currentRates.goldRate === 'Loading...') {
        // Return if not initialized
        return;
    }
    
    const timeSec = Date.now() / 1000;
    // Simulate micro-ticks exactly like the server
    const cycleGold = Math.sin(timeSec * 0.2) * 0.45;
    const noiseGold = (Math.random() - 0.5) * 0.12;
    const currentGoldRate = baseRates.goldRate + cycleGold + noiseGold;
    
    const cycleSilver = Math.sin(timeSec * 0.15) * 12.5;
    const noiseSilver = (Math.random() - 0.5) * 3.5;
    const currentSilverRate = baseRates.silverRate + cycleSilver + noiseSilver;
    
    setBullionRates({
        goldRate: currentGoldRate.toFixed(2),
        goldChange: baseRates.goldChange.toFixed(2),
        goldUnit: baseRates.goldUnit,
        silverRate: currentSilverRate.toFixed(2),
        silverChange: baseRates.silverChange.toFixed(2),
        silverUnit: baseRates.silverUnit
    });
}

// Render dynamic rates to DOM based on state updates
function renderBullionRatesUI(state) {
    // Update Gold UI
    const priceValEl = document.getElementById('navbarGoldPrice');
    const changeValEl = document.getElementById('navbarGoldChange');
    if (priceValEl && changeValEl) {
        if (state.goldRate === 'Loading...') {
            priceValEl.textContent = 'Loading...';
            changeValEl.innerHTML = '';
        } else {
            // Display per 10g instead of per 1g
            const pricePer10g = parseFloat(state.goldRate) * 10;
            const formattedPrice = `₹${pricePer10g.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/10${state.goldUnit}`;
            priceValEl.textContent = formattedPrice;

            const btnPriceEl = document.getElementById('btnGoldPrice');
            if (btnPriceEl) {
                btnPriceEl.textContent = formattedPrice;
            }

            const changePercent = parseFloat(state.goldChange);
            const sign = changePercent >= 0 ? '+' : '';
            const icon = changePercent >= 0 ? '<i class="fa-solid fa-caret-up"></i>' : '<i class="fa-solid fa-caret-down"></i>';
            changeValEl.innerHTML = `${icon} ${sign}${changePercent.toFixed(2)}%`;
            changeValEl.className = changePercent >= 0 ? 'gold-rate-change up' : 'gold-rate-change down';
        }
    }

    // Update Silver UI
    const silverPriceValEl = document.getElementById('navbarSilverPrice');
    const silverChangeValEl = document.getElementById('navbarSilverChange');
    if (silverPriceValEl && silverChangeValEl) {
        if (state.silverRate === 'Loading...') {
            silverPriceValEl.textContent = 'Loading...';
            silverChangeValEl.innerHTML = '';
        } else {
            const formattedPriceSilver = `₹${parseFloat(state.silverRate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/${state.silverUnit}`;
            silverPriceValEl.textContent = formattedPriceSilver;

            const changePercentSilver = parseFloat(state.silverChange);
            const signSilver = changePercentSilver >= 0 ? '+' : '';
            const iconSilver = changePercentSilver >= 0 ? '<i class="fa-solid fa-caret-up"></i>' : '<i class="fa-solid fa-caret-down"></i>';
            silverChangeValEl.innerHTML = `${iconSilver} ${signSilver}${changePercentSilver.toFixed(2)}%`;
            silverChangeValEl.className = changePercentSilver >= 0 ? 'gold-rate-change up' : 'gold-rate-change down';
        }
    }
    // Automatically trigger estimation update when rates change
    calculateEstimation(state);

    // Re-render products if they exist to reflect live prices
    if (typeof products !== 'undefined' && products.length > 0) {
        renderProducts(true);
    }
    // Re-render cart if it has items
    const currentCart = getCart();
    if (currentCart && currentCart.length > 0) {
        renderCart(currentCart);
    }
    // Update active product modal if open
    const productModal = document.getElementById('productModal');
    if (productModal && productModal.classList.contains('active') && productModal.dataset.productId) {
        const activeProductId = parseInt(productModal.dataset.productId, 10);
        if (typeof products !== 'undefined') {
            const activeProduct = products.find(p => p.id === activeProductId);
            if (activeProduct) {
                const livePrice = getProductPrice(activeProduct, state);
                const modalPriceEl = productModal.querySelector('.modal-price');
                if (modalPriceEl) {
                    modalPriceEl.textContent = `₹${livePrice.toLocaleString('en-IN')}`;
                }
                const whatsappBtnEl = productModal.querySelector('.whatsapp-product-btn');
                if (whatsappBtnEl) {
                    whatsappBtnEl.setAttribute('onclick', `askOnWhatsApp('${activeProduct.name}', ${livePrice})`);
                }
            }
        }
    }
}

// Live Bullion Calculator Price Estimator logic
function calculateEstimation(ratesData) {
    const calcMetal = document.getElementById('calcMetal');
    const calcWeight = document.getElementById('calcWeight');
    const calcEstPrice = document.getElementById('calcEstPrice');
    const calcWeightUnit = document.getElementById('calcWeightUnit');

    if (!calcMetal || !calcWeight || !calcEstPrice) return;

    const metal = calcMetal.value;
    const weightVal = parseFloat(calcWeight.value) || 0;

    // Safety check for ratesData vs Event vs standard state getter fallback
    const rates = (ratesData && typeof ratesData.goldRate !== 'undefined')
        ? ratesData
        : (typeof getBullionRates === 'function' ? getBullionRates() : {
            goldRate: 'Loading...',
            goldChange: 0,
            goldUnit: 'g',
            silverRate: 'Loading...',
            silverChange: 0,
            silverUnit: 'kg'
        });

    if (metal === 'gold') {
        if (calcWeightUnit) calcWeightUnit.textContent = 'g';
        if (rates.goldRate && rates.goldRate !== 'Loading...') {
            const pricePerGram = parseFloat(rates.goldRate);
            const total = pricePerGram * weightVal;
            calcEstPrice.textContent = `₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        } else {
            calcEstPrice.textContent = 'Loading...';
        }
    } else if (metal === 'silver') {
        // Change unit to grams for calculator and calculate gram price (rate/1000)
        if (calcWeightUnit) calcWeightUnit.textContent = 'g';
        if (rates.silverRate && rates.silverRate !== 'Loading...') {
            const pricePerGramSilver = parseFloat(rates.silverRate) / 1000;
            const total = pricePerGramSilver * weightVal;
            calcEstPrice.textContent = `₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        } else {
            calcEstPrice.textContent = 'Loading...';
        }
    }
}

// Load products from API
async function loadProducts() {
    try {
        const res = await fetch('/api/products');
        if (res.ok) {
            const data = await res.json();
            // Filter only Active status products for storefront display
            products = data.filter(p => p.status === 'Active');
        } else {
            products = INITIAL_PRODUCTS.filter(p => p.status === 'Active');
        }
    } catch (err) {
        console.error("Error loading products from server:", err);
        products = INITIAL_PRODUCTS.filter(p => p.status === 'Active');
    }
    renderProducts();
}

// Load collections from API
async function loadCollections() {
    try {
        const res = await fetch('/api/collections');
        if (res.ok) {
            collections = await res.json();
        } else {
            collections = INITIAL_COLLECTIONS;
        }
    } catch (err) {
        console.error("Error loading collections from server:", err);
        collections = INITIAL_COLLECTIONS;
    }
    renderCollections();
}

// Render dynamic collections grid
function renderCollections() {
    const grid = document.getElementById('collectionsGrid');
    if (!grid) return;

    grid.innerHTML = '';
    
    // Determine collections to render (show all collections by default)
    const collectionsToRender = collections;

    collectionsToRender.forEach(col => {
        const card = document.createElement('div');
        card.className = 'collection-card';
        card.setAttribute('data-category', col.category);

        card.innerHTML = `
            <div class="collection-img" style="background-image: url('${col.image}');"></div>
            <div class="collection-overlay">
                <h3>${col.title}</h3>
                <p>${col.subtitle}</p>
                <span class="shop-link">Browse Collection <i class="fa-solid fa-arrow-right-long"></i></span>
            </div>
        `;

        // Attach click filter behavior
        card.addEventListener('click', () => {
            const cat = col.category;
            filters.category = cat;

            const radio = document.querySelector(`input[name="category"][value="${cat}"]`);
            if (radio) {
                radio.checked = true;
            }

            renderProducts();
            document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });
        });

        grid.appendChild(card);
    });

    // Hide More Collections button since all collections are rendered by default
    const actionContainer = document.getElementById('collectionsActionContainer');
    if (actionContainer) {
        actionContainer.style.display = 'none';
    }
}

// 5. RENDER FUNCTIONS
function renderProducts(keepLimit = false) {
    if (!keepLimit) {
        showAllProducts = false;
    }

    // Apply filters
    let filtered = products.filter(product => {
        // Category Filter
        if (filters.category !== 'all' && product.category !== filters.category) return false;

        // Material Filter
        if (filters.materials.length > 0 && !filters.materials.includes(product.material)) return false;

        // Price Filter (Dynamically calculated based on live rate)
        const livePrice = getProductPrice(product, getBullionRates());
        if (livePrice > filters.maxPrice) return false;

        // Search Filter
        if (filters.search) {
            const query = filters.search.toLowerCase();
            const matchesName = product.name.toLowerCase().includes(query);
            const matchesDesc = product.details.toLowerCase().includes(query);
            const matchesMetal = product.material.toLowerCase().includes(query);
            if (!matchesName && !matchesDesc && !matchesMetal) return false;
        }

        return true;
    });

    // Apply Sorting
    if (filters.sortBy === 'price-low') {
        filtered.sort((a, b) => getProductPrice(a, getBullionRates()) - getProductPrice(b, getBullionRates()));
    } else if (filters.sortBy === 'price-high') {
        filtered.sort((a, b) => getProductPrice(b, getBullionRates()) - getProductPrice(a, getBullionRates()));
    }

    // Render Grid
    productsGrid.innerHTML = '';

    const viewMoreContainer = document.getElementById('viewMoreContainer');

    if (filtered.length === 0) {
        emptyState.style.display = 'block';
        productsGrid.style.display = 'none';
        if (viewMoreContainer) viewMoreContainer.style.display = 'none';
    } else {
        emptyState.style.display = 'none';
        productsGrid.style.display = 'grid';

        const itemsToRender = showAllProducts ? filtered : filtered.slice(0, 4);

        itemsToRender.forEach(product => {
            const livePrice = getProductPrice(product, getBullionRates());
            const card = document.createElement('div');
            card.className = 'product-card';
            card.innerHTML = `
                <div class="product-img-wrapper" onclick="openProductModal(${product.id})">
                    <img src="${product.image}" alt="${product.name}" class="product-img" loading="lazy">
                    <div class="product-badge">${product.material}</div>
                </div>
                <div class="product-info">
                    <span class="product-meta">${product.category}</span>
                    <h3 class="product-name" onclick="openProductModal(${product.id})">${product.name}</h3>
                    <div class="product-footer-flex">
                        <span class="product-price">₹${livePrice.toLocaleString('en-IN')}</span>
                        <a href="javascript:void(0)" onclick="addToCart(${product.id}, 1)" class="product-add-bag-link">Select Piece</a>
                    </div>
                </div>
            `;
            productsGrid.appendChild(card);
        });

        if (viewMoreContainer) {
            if (!showAllProducts && filtered.length > 4) {
                viewMoreContainer.style.display = 'block';
            } else {
                viewMoreContainer.style.display = 'none';
            }
        }
    }

    renderActiveFilterTags();
}

function renderActiveFilterTags() {
    activeFiltersRow.innerHTML = '';

    if (filters.category !== 'all') {
        createTag(`Category: ${filters.category}`, () => {
            filters.category = 'all';
            document.querySelector(`input[name="category"][value="all"]`).checked = true;
            renderProducts();
        });
    }

    filters.materials.forEach(material => {
        createTag(material, () => {
            filters.materials = filters.materials.filter(m => m !== material);
            const checkbox = document.querySelector(`input[name="material"][value="${material}"]`);
            if (checkbox) checkbox.checked = false;
            renderProducts();
        });
    });

    if (filters.maxPrice < 1500000) {
        createTag(`Under ₹${filters.maxPrice.toLocaleString('en-IN')}`, () => {
            filters.maxPrice = 1500000;
            priceRange.value = 1500000;
            priceVal.textContent = '₹15,00,000';
            renderProducts();
        });
    }

    if (filters.search) {
        createTag(`Search: "${filters.search}"`, () => {
            filters.search = '';
            searchInput.value = '';
            renderProducts();
        });
    }
}

function createTag(text, onRemove) {
    const tag = document.createElement('span');
    tag.className = 'active-filter-tag';
    tag.innerHTML = `${text} <button><i class="fa-solid fa-xmark"></i></button>`;
    tag.querySelector('button').addEventListener('click', onRemove);
    activeFiltersRow.appendChild(tag);
}

// 6. EVENT LISTENERS SETUP
function setupEventListeners() {
    // Toggle collections visibility (More / Less)
    const toggleCollectionsBtn = document.getElementById('btnToggleCollections');
    if (toggleCollectionsBtn) {
        toggleCollectionsBtn.addEventListener('click', () => {
            showAllCollections = !showAllCollections;
            renderCollections();
        });
    }

    // Sticky Header & Scroll Spy Active Link indicator
    const handleScroll = () => {
        const header = document.querySelector('.header');
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
        scrollSpy();
    };
    window.addEventListener('scroll', handleScroll);
    scrollSpy(); // Initialize on page load

    // Mobile Navigation Menu Toggle
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const navMenu = document.getElementById('navMenu');
    mobileMenuBtn.addEventListener('click', () => {
        navMenu.classList.toggle('active');
        const icon = mobileMenuBtn.querySelector('i');
        if (navMenu.classList.contains('active')) {
            icon.className = 'fa-solid fa-xmark';
        } else {
            icon.className = 'fa-solid fa-bars';
        }
    });

    // Close menu when clicking links
    navMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navMenu.classList.remove('active');
            mobileMenuBtn.querySelector('i').className = 'fa-solid fa-bars';
        });
    });

    // Catalog Sidebar Filters (Mobile)
    const filterToggleBtn = document.getElementById('filterToggleBtn');
    const closeFiltersBtn = document.getElementById('closeFiltersBtn');
    if (filterToggleBtn && closeFiltersBtn) {
        filterToggleBtn.addEventListener('click', () => filtersSidebar.classList.add('active'));
        closeFiltersBtn.addEventListener('click', () => filtersSidebar.classList.remove('active'));
    }

    // Radio Category Filters
    document.querySelectorAll('input[name="category"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            filters.category = e.target.value;
            renderProducts();
            // Close mobile filters drawer on selection
            if (window.innerWidth <= 900) filtersSidebar.classList.remove('active');
        });
    });

    // Collection Cards Filter triggers
    document.querySelectorAll('.collection-card').forEach(card => {
        card.addEventListener('click', () => {
            const cat = card.getAttribute('data-category');
            filters.category = cat;

            const radio = document.querySelector(`input[name="category"][value="${cat}"]`);
            if (radio) radio.checked = true;

            renderProducts();
            document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });
        });
    });

    // Footer links category filters
    document.querySelectorAll('.filter-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const cat = link.getAttribute('data-cat');
            filters.category = cat;

            const radio = document.querySelector(`input[name="category"][value="${cat}"]`);
            if (radio) radio.checked = true;

            renderProducts();
        });
    });

    // Material Checkbox Filters
    document.querySelectorAll('input[name="material"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const checked = [];
            document.querySelectorAll('input[name="material"]:checked').forEach(cb => {
                checked.push(cb.value);
            });
            filters.materials = checked;
            renderProducts();
        });
    });

    // Price Range Filter
    priceRange.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        filters.maxPrice = val;
        priceVal.textContent = val === 1500000 ? '₹15,00,000+' : `₹${val.toLocaleString('en-IN')}`;
        renderProducts();
    });

    // Sort By Selector
    sortBy.addEventListener('change', (e) => {
        filters.sortBy = e.target.value;
        renderProducts();
    });

    // Search Trigger Overlay
    const searchBtn = document.getElementById('searchBtn');
    const closeSearchBtn = document.getElementById('closeSearchBtn');

    searchBtn.addEventListener('click', () => {
        searchOverlay.classList.add('active');
        setTimeout(() => searchInput.focus(), 100);
    });

    closeSearchBtn.addEventListener('click', () => {
        searchOverlay.classList.remove('active');
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            filters.search = searchInput.value;
            renderProducts();
            searchOverlay.classList.remove('active');
            document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });
        }
        if (e.key === 'Escape') {
            searchOverlay.classList.remove('active');
        }
    });

    // Clear Filters Actions
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    const resetEmptyFiltersBtn = document.getElementById('resetEmptyFiltersBtn');

    const resetFiltersAction = () => {
        filters.category = 'all';
        filters.materials = [];
        filters.maxPrice = 1500000;
        filters.search = '';
        filters.sortBy = 'default';

        // Reset controls
        document.querySelector('input[name="category"][value="all"]').checked = true;
        document.querySelectorAll('input[name="material"]').forEach(cb => cb.checked = false);
        priceRange.value = 1500000;
        priceVal.textContent = '₹15,00,000';
        sortBy.value = 'default';
        searchInput.value = '';

        renderProducts();
    };

    if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', resetFiltersAction);
    if (resetEmptyFiltersBtn) resetEmptyFiltersBtn.addEventListener('click', resetFiltersAction);

    // Gold Rate Dropdown Toggle
    const goldRateToggleBtn = document.getElementById('goldRateToggleBtn');
    const goldRateDropdown = document.getElementById('goldRateDropdown');

    if (goldRateToggleBtn && goldRateDropdown) {
        goldRateToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = goldRateDropdown.classList.toggle('active');
            goldRateToggleBtn.classList.toggle('active', isActive);
        });

        document.addEventListener('click', (e) => {
            if (!goldRateDropdown.contains(e.target) && !goldRateToggleBtn.contains(e.target)) {
                goldRateDropdown.classList.remove('active');
                goldRateToggleBtn.classList.remove('active');
            }
        });
    }

    // Bullion Price Estimator Listeners
    const calcMetal = document.getElementById('calcMetal');
    const calcWeight = document.getElementById('calcWeight');
    if (calcMetal) {
        calcMetal.addEventListener('change', calculateEstimation);
    }
    if (calcWeight) {
        calcWeight.addEventListener('input', calculateEstimation);
    }

    // Cart Drawer Toggle
    const cartToggleBtn = document.getElementById('cartToggleBtn');
    const closeCartBtn = document.getElementById('closeCartBtn');
    const cartExploreBtn = document.getElementById('cartExploreBtn');

    cartToggleBtn.addEventListener('click', () => {
        renderCart();
        cartOverlay.classList.add('active');
    });
    closeCartBtn.addEventListener('click', () => cartOverlay.classList.remove('active'));
    cartExploreBtn.addEventListener('click', () => cartOverlay.classList.remove('active'));
    cartOverlay.addEventListener('click', (e) => {
        if (e.target === cartOverlay) cartOverlay.classList.remove('active');
    });

    // View More Button
    const viewMoreBtn = document.getElementById('viewMoreBtn');
    if (viewMoreBtn) {
        viewMoreBtn.addEventListener('click', () => {
            showAllProducts = true;
            renderProducts(true);
        });
    }

    // Product Modal Close Trigger
    const closeModalBtn = document.getElementById('closeModalBtn');
    closeModalBtn.addEventListener('click', () => productModal.classList.remove('active'));
    productModal.addEventListener('click', (e) => {
        if (e.target === productModal) productModal.classList.remove('active');
    });

    // Toast Close
    document.getElementById('closeToastBtn').addEventListener('click', () => {
        toast.classList.remove('active');
    });

    // Booking Consultation Form Submit
    bookingForm.addEventListener('submit', (e) => {
        e.preventDefault();

        if (!currentUser) {
            updateUserUI();
            accountModal.classList.add('active');
            showToast("Please log in or create an account to book a consultation.");
            return;
        }

        const clientName = document.getElementById('bookingName').value;
        const email = document.getElementById('bookingEmail').value;
        const bookingCountryCode = document.getElementById('bookingCountryCode').value;
        const bookingPhoneRaw = document.getElementById('bookingPhone').value.trim();
        const phoneDigits = bookingPhoneRaw.replace(/\D/g, '');
        if (phoneDigits.length !== 10) {
            showToast("Please enter a valid 10-digit phone number.");
            return;
        }
        const phone = bookingCountryCode + phoneDigits;
        const service = document.getElementById('bookingService').value;
        const date = document.getElementById('bookingDate').value;
        const time = document.getElementById('bookingTime').value;
        const notes = document.getElementById('bookingNotes').value;

        // Save to localStorage (local backup)
        const consultations = JSON.parse(localStorage.getItem('aura_consultations')) || [];
        consultations.push({
            id: Date.now(),
            name: clientName,
            email: email,
            phone: phone,
            service: service,
            date: date,
            time: time,
            notes: notes,
            timestamp: new Date().toLocaleString()
        });
        localStorage.setItem('aura_consultations', JSON.stringify(consultations));

        // Save to backend database via API
        fetch('/api/consultations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: clientName,
                email: email,
                phone: phone,
                service: service,
                date: date,
                time: time,
                notes: notes
            })
        })
        .then(res => {
            if (!res.ok) console.error("Failed to save consultation booking to database");
        })
        .catch(err => {
            console.error("Error saving consultation booking to database:", err);
        });

        // Send consultation confirmation email to the customer
        sendEmailToServer(
            email,
            "Consultation Booking Request - SBL Jewellery",
            `Hello ${clientName},\n\nWe have received your private viewing request.\n\nService: ${service}\nDate: ${date}\nTime Session: ${time}\nNotes: ${notes || 'None'}\n\nOur concierge will contact you within 24 hours to confirm your appointment.\n\nThank you,\nSBL Jewellery Team`,
            `<h3>Consultation Booking Requested</h3><p>Hello <strong>${clientName}</strong>,</p><p>Thank you for reaching out to SBL Jewellery. We have received your viewing request with the following details:</p><table style="width: 100%; border-collapse: collapse; margin-top: 1rem;"><tr><td style="padding: 8px; border: 1px solid #ede8e0; font-weight: 600;">Service</td><td style="padding: 8px; border: 1px solid #ede8e0;">${service}</td></tr><tr><td style="padding: 8px; border: 1px solid #ede8e0; font-weight: 600;">Date</td><td style="padding: 8px; border: 1px solid #ede8e0;">${date}</td></tr><tr><td style="padding: 8px; border: 1px solid #ede8e0; font-weight: 600;">Time Session</td><td style="padding: 8px; border: 1px solid #ede8e0;">${time}</td></tr><tr><td style="padding: 8px; border: 1px solid #ede8e0; font-weight: 600;">Notes</td><td style="padding: 8px; border: 1px solid #ede8e0;">${notes || 'None'}</td></tr></table><p style="margin-top: 1.5rem;">Our concierge will contact you within 24 hours to confirm your appointment schedule.</p><br><p>Thank you,<br><strong>SBL Jewellery Team</strong></p>`
        );

        // Send email alert to the owner
        sendEmailToServer(
            "sbljewellery@gmail.com, sribhagyalaxmijewellery@gmail.com",
            "New Consultation Booking Alert - SBL Jewellery",
            `Hello Administrator,\n\nA new consultation booking has been requested by a customer:\n\nClient Name: ${clientName}\nEmail Address: ${email}\nPhone Number: ${phone}\nService Chosen: ${service}\nDate Requested: ${date}\nTime Slot: ${time}\nSpecial Notes: ${notes || 'None'}\n\nPlease check the AURA Owner Dashboard to view this request.\n\nThank you,\nSBL Jewellery System`,
            `<h3>New Consultation Booking Alert</h3><p>A new private viewing consultation has been requested by a customer with the following details:</p><table style="width: 100%; border-collapse: collapse; margin-top: 1rem;"><tr><td style="padding: 8px; border: 1px solid #ede8e0; font-weight: 600;">Client Name</td><td style="padding: 8px; border: 1px solid #ede8e0;">${clientName}</td></tr><tr><td style="padding: 8px; border: 1px solid #ede8e0; font-weight: 600;">Email Address</td><td style="padding: 8px; border: 1px solid #ede8e0;">${email}</td></tr><tr><td style="padding: 8px; border: 1px solid #ede8e0; font-weight: 600;">Phone Number</td><td style="padding: 8px; border: 1px solid #ede8e0;">${phone}</td></tr><tr><td style="padding: 8px; border: 1px solid #ede8e0; font-weight: 600;">Service Chosen</td><td style="padding: 8px; border: 1px solid #ede8e0;">${service}</td></tr><tr><td style="padding: 8px; border: 1px solid #ede8e0; font-weight: 600;">Date Requested</td><td style="padding: 8px; border: 1px solid #ede8e0;">${date}</td></tr><tr><td style="padding: 8px; border: 1px solid #ede8e0; font-weight: 600;">Time Slot</td><td style="padding: 8px; border: 1px solid #ede8e0;">${time}</td></tr><tr><td style="padding: 8px; border: 1px solid #ede8e0; font-weight: 600;">Special Notes</td><td style="padding: 8px; border: 1px solid #ede8e0;">${notes || 'None'}</td></tr></table><p style="margin-top: 1.5rem;">Please log into the <a href="http://localhost:5500/owner.html">AURA Dashboard</a> to view and manage this booking.</p>`
        );

        // Hide Form and Show Success
        bookingForm.style.display = 'none';
        successClientName.textContent = clientName;
        bookingSuccess.style.display = 'flex';
        addActivityLog(`Consultation requested by ${clientName} for: ${service}.`, "success");

        // Hook up Contact Consultant on WhatsApp button
        const bookingWhatsappBtn = document.getElementById('bookingWhatsappBtn');
        if (bookingWhatsappBtn) {
            bookingWhatsappBtn.onclick = () => {
                addActivityLog("WhatsApp click: Booking Page", "action");
                const message = `Hello SBL Digital Jewelry, I am interested in booking a consultation for:\n\nService: ${service}\nDate: ${date}\nTime: ${time}\n\nMy name is: ${clientName}.`;
                const url = `https://wa.me/919949426288?text=${encodeURIComponent(message)}`;
                window.open(url, '_blank');
            };
        }
    });

    const resetBookingBtn = document.getElementById('resetBookingBtn');
    resetBookingBtn.addEventListener('click', () => {
        bookingForm.reset();
        bookingForm.style.display = 'flex';
        bookingSuccess.style.display = 'none';
    });

    // Newsletter Form Submit
    newsletterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('newsletterEmail').value;

        newsletterForm.style.display = 'none';
        newsletterSuccess.style.display = 'block';
        addActivityLog(`Newsletter subscriber registered: ${email}.`, "success");
    });

    // Checkout Button Click Action (Rebranded to Book Showroom Viewing)
    document.getElementById('checkoutBtn').addEventListener('click', () => {
        const cart = getCart();
        if (cart.length > 0) {
            let itemsText = 'I am interested in scheduling a showroom viewing for the following selection:\n';
            cart.forEach(item => {
                itemsText += `- ${item.name} (${item.material}) x ${item.quantity}\n`;
            });
            itemsText += '\nPlease coordinate an in-person viewing appointment.';
            
            const bookingNotes = document.getElementById('bookingNotes');
            if (bookingNotes) {
                bookingNotes.value = itemsText;
            }
            
            // Close selection drawer
            cartOverlay.classList.remove('active');
            
            // Smooth scroll to booking section
            const appointmentSection = document.getElementById('appointment');
            if (appointmentSection) {
                appointmentSection.scrollIntoView({ behavior: 'smooth' });
            }
            
            showToast("Selection transferred to the booking form below.");
            addActivityLog(`${currentUser ? currentUser.name : 'Guest'} transferred selection to showroom booking form.`, "action");
        } else {
            showToast("Your selection list is empty.");
        }
    });

    // Account Modal Toggle
    accountToggleBtn.addEventListener('click', async () => {
        if (currentUser) {
            await syncUserProfile();
        }
        updateUserUI();
        accountModal.classList.add('active');
    });

    closeAccountModalBtn.addEventListener('click', () => {
        accountModal.classList.remove('active');
    });

    accountModal.addEventListener('click', (e) => {
        if (e.target === accountModal) accountModal.classList.remove('active');
    });

    // Login Form Submit
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userInput = document.getElementById('loginUser').value.trim().toLowerCase();
        const passwordInput = document.getElementById('loginPassword').value;
        const loginErrorMsg = document.getElementById('loginErrorMsg');

        if (loginErrorMsg) loginErrorMsg.style.display = 'none';

        try {
            const res = await fetch('/api/login/customer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: userInput, password: passwordInput })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.message || 'Invalid credentials');
            }

            const userData = await res.json();

            // Successful authentication
            currentUser = {
                name: userData.name,
                email: userData.email,
                phone: userData.phone,
                password: passwordInput,
                isElite: !!userData.isElite
            };

            // Load their cart from DB via reactive hook
            setCart(userData.cart || []);

            localStorage.setItem('aura_user', JSON.stringify(currentUser));
            updateUserUI();
            showToast(`Welcome back, ${currentUser.name}!`);
            loginForm.reset();
            addActivityLog(`${currentUser.name} signed in successfully.`, "success");
            setTimeout(() => accountModal.classList.remove('active'), 1200);
        } catch (err) {
            console.error(err);
            if (loginErrorMsg) {
                loginErrorMsg.textContent = err.message;
                loginErrorMsg.style.display = 'block';
            } else {
                showToast(err.message);
            }
        }
    });

    // Forgot Password Flow
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const forgotPasswordView = document.getElementById('forgotPasswordView');
    const resetPasswordView = document.getElementById('resetPasswordView');
    const authView = document.getElementById('authView');
    const backToLoginFromForgot = document.getElementById('backToLoginFromForgot');
    const backToLoginFromReset = document.getElementById('backToLoginFromReset');
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    const resetPasswordForm = document.getElementById('resetPasswordForm');
    const forgotErrorMsg = document.getElementById('forgotErrorMsg');
    const resetErrorMsg = document.getElementById('resetErrorMsg');

    // Simple in-memory OTP store (phone/email => code)
    const otpStore = {};

    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', () => {
            authView.style.display = 'none';
            forgotPasswordView.style.display = 'block';
        });
    }
    if (backToLoginFromForgot) {
        backToLoginFromForgot.addEventListener('click', () => {
            forgotPasswordView.style.display = 'none';
            authView.style.display = 'block';
        });
    }
    if (backToLoginFromReset) {
        backToLoginFromReset.addEventListener('click', () => {
            resetPasswordView.style.display = 'none';
            authView.style.display = 'block';
        });
    }
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = document.getElementById('forgotUser').value.trim().toLowerCase();
            const forgotErrorMsg = document.getElementById('forgotErrorMsg');
            if (forgotErrorMsg) forgotErrorMsg.style.display = 'none';

            try {
                const res = await fetch('/api/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: user })
                });

                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.message || 'Account not found.');
                }

                const data = await res.json();
                otpStore[user] = data.otp;

                const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                if (isLocalhost && data.otp) {
                    console.log(`[DEV OTP] Password reset code for ${user} is: ${data.otp}`);
                    showToast(`[Local Dev] Reset code is: ${data.otp}`);
                    
                    let resetHelper = document.getElementById('resetCodeHelper');
                    if (!resetHelper) {
                        resetHelper = document.createElement('p');
                        resetHelper.id = 'resetCodeHelper';
                        resetHelper.style.fontSize = '0.85rem';
                        resetHelper.style.color = 'var(--color-text-muted)';
                        resetHelper.style.marginBottom = '1rem';
                        const form = document.getElementById('resetPasswordForm');
                        if (form) {
                            form.parentNode.insertBefore(resetHelper, form);
                        }
                    }
                    resetHelper.innerHTML = `<strong style="color: var(--color-accent-gold);">[Local Dev Mode] Your reset code is: ${data.otp}</strong>`;
                    resetHelper.style.display = 'block';
                } else {
                    showToast('Reset code has been sent to your Gmail.');
                    const resetHelper = document.getElementById('resetCodeHelper');
                    if (resetHelper) resetHelper.style.display = 'none';
                }

                // Switch to reset view
                forgotPasswordView.style.display = 'none';
                resetPasswordView.style.display = 'block';
            } catch (err) {
                console.error(err);
                if (forgotErrorMsg) {
                    forgotErrorMsg.textContent = err.message;
                    forgotErrorMsg.style.display = 'block';
                } else {
                    showToast(err.message);
                }
            }
        });
    }
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = document.getElementById('forgotUser').value.trim().toLowerCase(); // reuse same input id
            const enteredCode = document.getElementById('resetCode').value.trim();
            const newPass = document.getElementById('newPassword').value;
            if (otpStore[user] !== enteredCode) {
                if (resetErrorMsg) {
                    resetErrorMsg.textContent = 'Invalid or expired reset code.';
                    resetErrorMsg.style.display = 'block';
                } else {
                    showToast('Invalid reset code.');
                }
                return;
            }
            
            try {
                const res = await fetch('/api/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: user, password: newPass })
                });

                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.message || 'Failed to reset password.');
                }

                delete otpStore[user];
                showToast('Password reset successful. You may now sign in.');
                resetPasswordView.style.display = 'none';
                authView.style.display = 'block';
                addActivityLog(`Password reset for ${user}.`, 'success');
            } catch (err) {
                console.error(err);
                if (resetErrorMsg) {
                    resetErrorMsg.textContent = err.message;
                    resetErrorMsg.style.display = 'block';
                } else {
                    showToast(err.message);
                }
            }
        });
    }

    // Register Form Submit
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('registerName').value || "Guest User";
        const email = document.getElementById('registerEmail').value.trim();
        const registerCountryCode = document.getElementById('registerCountryCode').value;
        const registerPhoneRaw = document.getElementById('registerPhone').value.trim();
        const phoneDigits = registerPhoneRaw.replace(/\D/g, '');
        if (phoneDigits.length !== 10) {
            registerErrorMsg.textContent = "Please enter a valid 10-digit mobile number.";
            registerErrorMsg.style.display = 'block';
            return;
        }
        const phone = registerCountryCode + phoneDigits;
        const password = document.getElementById('registerPassword').value;

        const normalizedEmail = email.toLowerCase();
        if (registerErrorMsg) registerErrorMsg.style.display = 'none';

        try {
            // Check if email or phone is already registered
            const checkRes = await fetch('/api/check-exists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: normalizedEmail, phone })
            });

            if (!checkRes.ok) {
                const errData = await checkRes.json();
                throw new Error(errData.message || 'Failed to verify account registration details.');
            }

            const checkData = await checkRes.json();
            if (checkData.exists) {
                registerErrorMsg.textContent = "An account with this email or phone number already exists.";
                registerErrorMsg.style.display = 'block';
                return;
            }

            // Save temporary registration details
            window.tempRegisterData = { name, email: normalizedEmail, phone, password };

            // Generate random 6-digit verification code
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            window.currentRegisterOtp = code;

            // Log code to console for local developers
            console.log(`[DEV OTP] Registration verification code for ${email} is: ${code}`);

            // Update OTP screen elements
            document.getElementById('otpTargetPhone').textContent = email;
            document.getElementById('otpCode').value = '';
            document.getElementById('otpErrorMsg').style.display = 'none';

            // If localhost, show the code helper in otpView subtitle
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const otpDesc = document.querySelector('#otpView p');
            if (otpDesc) {
                if (isLocalhost) {
                    otpDesc.innerHTML = `We have sent a verification code to your Gmail: <span id="otpTargetPhone" style="font-weight: 600; color: var(--color-text-dark);">${email}</span>.<br><strong style="color: var(--color-accent-gold); display: block; margin-top: 0.5rem; font-size: 0.95rem;">[Local Dev Mode] Your OTP is: ${code}</strong>`;
                } else {
                    otpDesc.innerHTML = `We have sent a verification code to your Gmail: <span id="otpTargetPhone" style="font-weight: 600; color: var(--color-text-dark);">${email}</span>. Enter it below to complete registration.`;
                }
            }

            // Send actual verification code via email
            sendEmailToServer(
                email,
                "Verify Your SBL Jewellery Account",
                `Hello ${name},\n\nYour 6-digit confirmation code is: ${code}\n\nThank you,\nSBL Jewellery Team`,
                `<h3>Verify Your Account</h3><p>Hello <strong>${name}</strong>,</p><p>Thank you for registering at SBL Jewellery. Your 6-digit verification code is:</p><h2 style="color: #c5a059; letter-spacing: 0.1em;">${code}</h2><p>Please enter this code on the verification screen to complete your registration.</p><br><p>Thank you,<br><strong>SBL Jewellery Team</strong></p>`
            );

            // Switch views: hide auth forms, show OTP verify screen
            authView.style.display = 'none';
            document.getElementById('otpView').style.display = 'block';

            showToast(isLocalhost ? `[Local Dev] OTP is: ${code}` : 'Verification code has been sent to your Gmail.');

            addActivityLog(`OTP verification sent to ${name} (${email}).`, "action");
        } catch (err) {
            console.error(err);
            registerErrorMsg.textContent = err.message;
            registerErrorMsg.style.display = 'block';
        }
    });

    // OTP Form Submit Action
    const otpForm = document.getElementById('otpForm');
    const otpCodeInput = document.getElementById('otpCode');
    const otpErrorMsg = document.getElementById('otpErrorMsg');

    otpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const enteredCode = otpCodeInput.value.trim();

        if (enteredCode === window.currentRegisterOtp) {
            const data = window.tempRegisterData;
            const normalizedEmail = data.email.toLowerCase();

            try {
                // Register via backend API
                const res = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: data.name,
                        email: normalizedEmail,
                        phone: data.phone,
                        password: data.password
                    })
                });

                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.message || 'Failed to register account.');
                }

                const newUser = {
                    name: data.name,
                    email: normalizedEmail,
                    phone: data.phone,
                    password: data.password,
                    isElite: false
                };

                currentUser = newUser;
                localStorage.setItem('aura_user', JSON.stringify(currentUser));

                // Start user session with clean bags via reactive hook
                setCart([]);

                updateUserUI();

                // Close OTP view
                document.getElementById('otpView').style.display = 'none';
                showToast(`Account verified! Welcome, ${data.name}.`);
                registerForm.reset();
                otpForm.reset();

                addActivityLog(`New user registered: ${data.name} (${data.phone}) [Verified via OTP].`, "success");
                setTimeout(() => accountModal.classList.remove('active'), 1200);
            } catch (err) {
                console.error(err);
                otpErrorMsg.textContent = err.message;
                otpErrorMsg.style.display = 'block';
            }
        } else {
            otpErrorMsg.textContent = "Invalid verification code. Please try again.";
            otpErrorMsg.style.display = 'block';
        }
    });

    // Resend OTP Code
    const resendOtpBtn = document.getElementById('resendOtpBtn');
    resendOtpBtn.addEventListener('click', () => {
        const phone = window.tempRegisterData ? window.tempRegisterData.phone : 'your phone';
        const email = window.tempRegisterData ? window.tempRegisterData.email : '';
        const name = window.tempRegisterData ? window.tempRegisterData.name : 'User';
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        window.currentRegisterOtp = code;

        // Log code to console for local developers
        console.log(`[DEV OTP] Resent registration verification code for ${email} is: ${code}`);

        otpErrorMsg.style.display = 'none';
        otpCodeInput.value = '';

        // If localhost, show the code helper in otpView subtitle
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const otpDesc = document.querySelector('#otpView p');
        if (otpDesc && isLocalhost && email) {
            otpDesc.innerHTML = `We have sent a verification code to your Gmail: <span id="otpTargetPhone" style="font-weight: 600; color: var(--color-text-dark);">${email}</span>.<br><strong style="color: var(--color-accent-gold); display: block; margin-top: 0.5rem; font-size: 0.95rem;">[Local Dev Mode] Your OTP is: ${code}</strong>`;
        }

        if (email) {
            sendEmailToServer(
                email,
                "Verify Your SBL Jewellery Account - Resend Code",
                `Hello ${name},\n\nYour new 6-digit confirmation code is: ${code}\n\nThank you,\nSBL Jewellery Team`,
                `<h3>Verify Your Account</h3><p>Hello <strong>${name}</strong>,</p><p>Your new 6-digit verification code is:</p><h2 style="color: #c5a059; letter-spacing: 0.1em;">${code}</h2><p>Please enter this code on the verification screen to complete your registration.</p><br><p>Thank you,<br><strong>SBL Jewellery Team</strong></p>`
            );
        }

        showToast(isLocalhost ? `[Local Dev] New OTP is: ${code}` : 'A new verification code has been sent to your Gmail.');
        addActivityLog(`OTP code resent to ${email || 'Gmail'}.`, "action");
    });

    // Logout Action
    logoutBtn.addEventListener('click', () => {
        const prevUserName = currentUser ? currentUser.name : 'User';
        currentUser = null;
        localStorage.removeItem('aura_user');

        // Clear session bags on logout via reactive hook
        setCart([]);

        updateUserUI();
        showToast("Signed out successfully.");
        addActivityLog(`${prevUserName} signed out.`, "success");
        accountModal.classList.remove('active');
    });

    // FAQ Accordion Toggle
    const faqTriggers = document.querySelectorAll('.faq-trigger');
    faqTriggers.forEach(trigger => {
        trigger.addEventListener('click', () => {
            const item = trigger.parentElement;
            const content = trigger.nextElementSibling;

            const isActive = item.classList.contains('active');

            // Close other items
            document.querySelectorAll('.faq-item').forEach(otherItem => {
                otherItem.classList.remove('active');
                otherItem.querySelector('.faq-content').style.maxHeight = null;
            });

            if (!isActive) {
                item.classList.add('active');
                content.style.maxHeight = content.scrollHeight + 'px';
            }
        });
    });

    // Enforce 10-digit numeric constraints
    const enforceNumericPhone = (inputEl) => {
        inputEl.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
        });
    };
    const registerPhoneEl = document.getElementById('registerPhone');
    const bookingPhoneEl = document.getElementById('bookingPhone');
    if (registerPhoneEl) enforceNumericPhone(registerPhoneEl);
    if (bookingPhoneEl) enforceNumericPhone(bookingPhoneEl);


}

async function syncUserProfile() {
    if (!currentUser || !currentUser.email) return;
    try {
        const res = await fetch(`/api/customers/profile?email=${encodeURIComponent(currentUser.email)}`);
        if (res.ok) {
            const userData = await res.json();
            currentUser = {
                name: userData.name,
                email: userData.email,
                phone: userData.phone,
                password: currentUser.password,
                isElite: !!userData.isElite
            };
            localStorage.setItem('aura_user', JSON.stringify(currentUser));
        }
    } catch (err) {
        console.error("Failed to sync user profile with backend:", err);
    }
}

function updateUserUI() {
    const forgotPasswordView = document.getElementById('forgotPasswordView');
    const resetPasswordView = document.getElementById('resetPasswordView');
    const otpView = document.getElementById('otpView');

    if (currentUser) {
        authView.style.display = 'none';
        if (forgotPasswordView) forgotPasswordView.style.display = 'none';
        if (resetPasswordView) resetPasswordView.style.display = 'none';
        if (otpView) otpView.style.display = 'none';
        loggedInView.style.display = 'block';
        
        // Clean greeting text (no badge next to name)
        profileGreeting.textContent = `Welcome back, ${currentUser.name}!`;
        
        const profileEliteItem = document.getElementById('profileEliteItem');
        if (currentUser.isElite) {
            profileAvatar.classList.add('elite-shine');
            if (profileEliteItem) {
                profileEliteItem.style.display = 'flex';
            }
        } else {
            profileAvatar.classList.remove('elite-shine');
            profileAvatar.style.border = '';
            profileAvatar.style.color = '';
            profileAvatar.style.backgroundColor = '';
            if (profileEliteItem) {
                profileEliteItem.style.display = 'none';
            }
        }

        profileEmail.textContent = currentUser.email;
        profilePhone.textContent = currentUser.phone || 'No phone linked';
        profileAvatar.textContent = currentUser.name.charAt(0).toUpperCase();
        accountToggleBtn.innerHTML = `<i class="fa-solid fa-user-check" style="color: var(--color-accent-gold);"></i>`;

        // Autofill booking details if fields are empty
        const bookingName = document.getElementById('bookingName');
        const bookingEmail = document.getElementById('bookingEmail');
        const bookingPhone = document.getElementById('bookingPhone');
        if (bookingName && !bookingName.value) bookingName.value = currentUser.name || '';
        if (bookingEmail && !bookingEmail.value) bookingEmail.value = currentUser.email || '';
        if (bookingPhone && !bookingPhone.value && currentUser.phone) {
            const phoneClean = currentUser.phone.replace(/\D/g, '').slice(-10);
            bookingPhone.value = phoneClean;
        }
    } else {
        authView.style.display = 'block';
        if (forgotPasswordView) forgotPasswordView.style.display = 'none';
        if (resetPasswordView) resetPasswordView.style.display = 'none';
        loggedInView.style.display = 'none';
        if (otpView) otpView.style.display = 'none';
        const loginErrorMsg = document.getElementById('loginErrorMsg');
        if (loginErrorMsg) loginErrorMsg.style.display = 'none';
        if (registerErrorMsg) registerErrorMsg.style.display = 'none';
        accountToggleBtn.innerHTML = `<i class="fa-regular fa-user"></i>`;

        profileAvatar.classList.remove('elite-shine');
        profileAvatar.style.border = '';
        profileAvatar.style.color = '';
        profileAvatar.style.backgroundColor = '';

        const profileEliteItem = document.getElementById('profileEliteItem');
        if (profileEliteItem) {
            profileEliteItem.style.display = 'none';
        }
    }
}

window.switchAuthTab = function (tab) {
    const loginErrorMsg = document.getElementById('loginErrorMsg');
    if (loginErrorMsg) loginErrorMsg.style.display = 'none';
    if (registerErrorMsg) registerErrorMsg.style.display = 'none';

    if (tab === 'login') {
        tabLoginBtn.classList.add('active');
        tabRegisterBtn.classList.remove('active');
        loginForm.style.display = 'flex';
        registerForm.style.display = 'none';
    } else {
        tabLoginBtn.classList.remove('active');
        tabRegisterBtn.classList.add('active');
        loginForm.style.display = 'none';
        registerForm.style.display = 'flex';
    }
};

// 7. TOAST NOTIFICATION HELPERS
function showToast(message) {
    toastMessage.textContent = message;
    toast.classList.add('active');

    // Clear toast auto-timeout after 4 seconds
    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
        toast.classList.remove('active');
    }, 4000);
}

// Email Sending Helper
async function sendEmailToServer(to, subject, text, html) {
    try {
        const res = await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to, subject, text, html })
        });
        if (!res.ok) throw new Error("Failed to send email via API");
        const data = await res.json();
        return data;
    } catch (err) {
        console.error("Error sending email:", err);
    }
}

// 8. CART CONTROLLER LOGIC
function updateBadges(cartState) {
    if (!cartBadge || !cartCount) return;
    const currentCart = cartState || getCart();
    const totalItems = currentCart.reduce((sum, item) => sum + item.quantity, 0);
    cartBadge.textContent = totalItems;
    cartCount.textContent = totalItems;
}

function addToCart(productId, quantity = 1) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const currentCart = getCart();
    const existing = currentCart.find(item => item.id === productId);
    let newCart;
    if (existing) {
        newCart = currentCart.map(item =>
            item.id === productId
                ? { ...item, quantity: item.quantity + quantity }
                : item
        );
    } else {
        newCart = [
            ...currentCart,
            {
                id: product.id,
                name: product.name,
                price: product.price,
                material: product.material,
                purity: product.purity,
                weight: product.weight,
                category: product.category,
                image: product.image,
                quantity: quantity
            }
        ];
    }

    setCart(newCart);
    showToast(`Added ${quantity}x ${product.name} to your selection list.`);
    addActivityLog(`${currentUser ? currentUser.name : 'Guest'} added ${quantity}x ${product.name} to selection.`, "action");

    // Auto open cart drawer
    cartOverlay.classList.add('active');
}

function updateCartQuantity(productId, delta) {
    const currentCart = getCart();
    const item = currentCart.find(item => item.id === productId);
    if (!item) return;

    let newCart;
    if (item.quantity + delta <= 0) {
        newCart = currentCart.filter(item => item.id !== productId);
    } else {
        newCart = currentCart.map(item =>
            item.id === productId
                ? { ...item, quantity: item.quantity + delta }
                : item
        );
    }

    setCart(newCart);
    addActivityLog(`${currentUser ? currentUser.name : 'Guest'} updated cart quantity.`, "action");
}

function removeFromCart(productId) {
    const currentCart = getCart();
    const item = currentCart.find(item => item.id === productId);
    const newCart = currentCart.filter(item => item.id !== productId);
    setCart(newCart);
    if (item) {
        addActivityLog(`${currentUser ? currentUser.name : 'Guest'} removed ${item.name} from selection.`, "action");
    }
}

function renderCart(cartState) {
    const cartItemsContainer = document.getElementById('cartItems');
    const cartEmptyState = document.getElementById('cartEmptyState');
    const cartFooter = document.getElementById('cartFooter');

    if (!cartItemsContainer || !cartEmptyState || !cartFooter) return;

    const currentCart = cartState || getCart();
    cartItemsContainer.innerHTML = '';

    if (currentCart.length === 0) {
        cartEmptyState.style.display = 'flex';
        cartFooter.style.display = 'none';
        cartItemsContainer.style.display = 'none';
    } else {
        cartEmptyState.style.display = 'none';
        cartFooter.style.display = 'block';
        cartItemsContainer.style.display = 'flex';

        let subtotal = 0;

        currentCart.forEach(item => {
            const livePrice = getProductPrice(item, getBullionRates());
            subtotal += livePrice * item.quantity;

            const card = document.createElement('div');
            card.className = 'cart-item';
            card.innerHTML = `
                <img src="${item.image}" alt="${item.name}" class="cart-item-img">
                <div class="cart-item-details">
                    <h4 class="cart-item-title">${item.name}</h4>
                    <p class="cart-item-meta">${item.material}</p>
                    <div class="cart-item-quantity">
                        <button class="qty-btn" onclick="updateCartQuantity(${item.id}, -1)">-</button>
                        <span class="qty-val">${item.quantity}</span>
                        <button class="qty-btn" onclick="updateCartQuantity(${item.id}, 1)">+</button>
                    </div>
                </div>
                <div class="cart-item-price-remove">
                    <span class="cart-item-price">₹${(livePrice * item.quantity).toLocaleString('en-IN')}</span>
                    <button class="cart-item-remove" onclick="removeFromCart(${item.id})">Remove</button>
                </div>
            `;
            cartItemsContainer.appendChild(card);
        });

        document.getElementById('cartSubtotal').textContent = `₹${subtotal.toLocaleString('en-IN')}`;
    }
}

// 10. PRODUCT DETAIL MODAL CONTROLLER
function openProductModal(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    productModal.dataset.productId = productId;

    const modalContentGrid = document.getElementById('modalProductContent');

    let specsHtml = '';
    for (const [key, value] of Object.entries(product.specs)) {
        specsHtml += `
            <div class="specs-item">
                <span class="specs-label">${key}</span>
                <span class="specs-value">${value}</span>
            </div>
        `;
    }

    let imageGalleryHtml = '';
    const mainImg = product.images && product.images.length > 0 ? product.images[0] : (product.image || 'assets/diamond_ring.png');

    if (product.images && product.images.length > 1) {
        imageGalleryHtml = '<div class="modal-thumbnails" style="display: flex; gap: 0.5rem; margin-top: 1rem; justify-content: center; flex-wrap: wrap;">';
        product.images.forEach((imgUrl, index) => {
            imageGalleryHtml += `
                <img src="${imgUrl}" alt="Thumbnail ${index + 1}" 
                     style="width: 50px; height: 50px; object-fit: cover; border: var(--border-luxury); cursor: pointer; border-radius: var(--border-radius-sm);" 
                     onclick="document.getElementById('modalMainImage').src = '${imgUrl}'">
            `;
        });
        imageGalleryHtml += '</div>';
    }

    modalContentGrid.innerHTML = `
        <div class="modal-img-container">
            <img src="${mainImg}" alt="${product.name}" id="modalMainImage" style="width: 100%; max-height: 400px; object-fit: cover;">
            ${imageGalleryHtml}
        </div>
        <div class="modal-details">
            <span class="modal-category">${product.category}</span>
            <h2 class="modal-title">${product.name}</h2>
            <div class="modal-price">₹${getProductPrice(product, getBullionRates()).toLocaleString('en-IN')}</div>
            <p class="modal-desc">${product.details}</p>
            
            <div class="specs-list">
                ${specsHtml}
            </div>

            <div class="modal-actions" style="display: flex; flex-direction: column; gap: 0.75rem; width: 100%;">
                <div style="display: flex; gap: 1rem; width: 100%;">
                    <div class="modal-qty">
                        <button onclick="changeModalQty(-1)">-</button>
                        <input type="number" id="modalQtyInput" value="1" min="1" readonly>
                        <button onclick="changeModalQty(1)">+</button>
                    </div>
                    <button class="btn btn-primary" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.5rem;" onclick="addModalItemToCart(${product.id})">
                        <i class="fa-solid fa-gem"></i> Select Piece
                    </button>
                </div>
                <button class="btn btn-secondary whatsapp-product-btn" style="width: 100%; border: 2px solid #25d366; color: #25d366; display: flex; align-items: center; justify-content: center; gap: 0.5rem;" onclick="askOnWhatsApp('${product.name}', ${getProductPrice(product, getBullionRates())})">
                    <i class="fa-brands fa-whatsapp" style="font-size: 1.2rem;"></i> Ask on WhatsApp
                </button>
            </div>
        </div>
    `;

    productModal.classList.add('active');
}

// Helpers for Modal Actions
window.changeModalQty = function (delta) {
    const qtyInput = document.getElementById('modalQtyInput');
    if (!qtyInput) return;
    let qty = parseInt(qtyInput.value) + delta;
    if (qty < 1) qty = 1;
    qtyInput.value = qty;
};

window.addModalItemToCart = function (productId) {
    const qtyInput = document.getElementById('modalQtyInput');
    if (!qtyInput) return;
    const qty = parseInt(qtyInput.value);
    addToCart(productId, qty);
    productModal.classList.remove('active');
};

function scrollSpy() {
    const sectionsList = ['hero', 'collections', 'shop', 'craftsmanship', 'appointment', 'contact'];
    let currentSectionId = 'hero';
    const scrollPosition = window.scrollY + 120; // 120px offset for the fixed navbar height

    sectionsList.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const top = el.offsetTop;
            const height = el.offsetHeight;
            if (scrollPosition >= top && scrollPosition < top + height) {
                currentSectionId = id;
            }
        }
    });

    const navLinks = document.querySelectorAll('.nav-menu a');
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${currentSectionId}`) {
            link.classList.add('active');
        }
    });
}

// 11. OWNER PANEL DATABASE ENGINE
function initOwnerDB() {
    const defaultUsers = [
        {
            name: "Jane Doe",
            email: "jane.doe@example.com",
            phone: "+1 (555) 234-5678",
            password: "password123",
            cart: [
                { id: 1, name: "Solitaire Diamond Engagement Ring", price: 8500, material: "Platinum", image: "assets/diamond_ring.png", quantity: 1 }
            ]
        },
        {
            name: "Arthur Pendragon",
            email: "arthur@camelot.com",
            phone: "+1 (555) 876-5432",
            password: "password123",
            cart: [
                { id: 8, name: "Gold Interlocking Chain Link Cuff", price: 2900, material: "Yellow Gold", image: "assets/emerald_bracelet.png", quantity: 2 }
            ]
        }
    ];

    if (!localStorage.getItem('aura_registered_users')) {
        localStorage.setItem('aura_registered_users', JSON.stringify(defaultUsers));
        registeredUsers = defaultUsers;
    } else {
        registeredUsers = JSON.parse(localStorage.getItem('aura_registered_users'));
    }

    const defaultLogs = [
        { time: "15:10:02", text: "Jane Doe logged into AURA portal.", type: "success" },
        { time: "15:12:45", text: "Jane Doe added Solitaire Diamond Engagement Ring to bag.", type: "action" },
        { time: "15:20:11", text: "Arthur Pendragon created account.", type: "success" },
        { time: "15:22:30", text: "Arthur Pendragon added Gold Interlocking Chain Link Cuff to bag.", type: "action" }
    ];

    if (!localStorage.getItem('aura_activity_logs')) {
        localStorage.setItem('aura_activity_logs', JSON.stringify(defaultLogs));
        activityLogs = defaultLogs;
    } else {
        activityLogs = JSON.parse(localStorage.getItem('aura_activity_logs'));
    }

    const defaultConsultations = [
        {
            id: 101,
            name: "Jane Doe",
            email: "jane.doe@example.com",
            phone: "+1 (555) 234-5678",
            service: "Engagement Ring Consultation",
            date: "2026-06-15",
            time: "Afternoon",
            notes: "Interested in the Solitaire Diamond Ring. Prefers platinum.",
            timestamp: "5/28/2026, 3:12:00 PM"
        },
        {
            id: 102,
            name: "Arthur Pendragon",
            email: "arthur@camelot.com",
            phone: "+1 (555) 876-5432",
            service: "Custom Design",
            date: "2026-06-20",
            time: "Morning",
            notes: "Wants a custom royal emerald crest ring design.",
            timestamp: "5/28/2026, 3:22:00 PM"
        }
    ];

    if (!localStorage.getItem('aura_consultations')) {
        localStorage.setItem('aura_consultations', JSON.stringify(defaultConsultations));
    }
}

function addActivityLog(text, type = "action") {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS
    activityLogs.unshift({ time: timeStr, text: text, type: type });
    if (activityLogs.length > 25) activityLogs.pop(); // keep limit
    localStorage.setItem('aura_activity_logs', JSON.stringify(activityLogs));

    // Sync activity log to backend database
    fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, type })
    }).catch(err => console.error("Failed to send log to server:", err));
}

function syncCurrentUserToDB() {
    if (currentUser) {
        // Sync cart to backend database
        fetch('/api/cart/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: currentUser.email,
                cart: getCart()
            })
        })
            .then(res => {
                if (!res.ok) console.error("Failed to sync cart with database");
            })
            .catch(err => {
                console.error("Error syncing cart:", err);
            });
    }
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

// ==========================================================================
// LUXURY WHATSAPP INTEGRATION LOGIC
// ==========================================================================

// 1. Product Detail WhatsApp Inquiry handler
window.askOnWhatsApp = function(name, price) {
    addActivityLog(`WhatsApp click: Product Page (${name})`, "action");
    
    const message = `Hello SBL Digital Jewelry,\n\nI am interested in the following product:\n\nProduct Name: ${name}\nPrice: ₹${price.toLocaleString('en-IN')}\n\nPlease provide more details.`;
    const url = `https://wa.me/919949426288?text=${encodeURIComponent(message)}`;
    
    window.open(url, '_blank');
};

// 2. Initialize Floating WhatsApp Button logic
document.addEventListener('DOMContentLoaded', () => {
    const whatsappFloatBtn = document.getElementById('whatsappFloatBtn');
    if (whatsappFloatBtn) {
        whatsappFloatBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Determine scroll position for page source tracking
            let locationName = 'Homepage';
            const appointmentSection = document.getElementById('appointment');
            const contactSection = document.getElementById('contact');
            
            if (contactSection && window.scrollY >= contactSection.offsetTop - 300) {
                locationName = 'Contact Page';
            } else if (appointmentSection && window.scrollY >= appointmentSection.offsetTop - 300) {
                locationName = 'Booking Page';
            }
            
            addActivityLog(`WhatsApp click: ${locationName}`, "action");
            
            const message = `Hello SBL Digital Jewelry,\n\nI am interested in your jewelry collection.\n\nName:\nPhone:\n\nPlease assist me with more details.`;
            const url = `https://wa.me/919949426288?text=${encodeURIComponent(message)}`;
            
            window.open(url, '_blank');
        });

        // GSAP Spring entrance animation
        if (typeof gsap !== 'undefined') {
            gsap.fromTo('#whatsappFloatBtn', 
                { scale: 0, opacity: 0 }, 
                { scale: 1, opacity: 1, duration: 1.2, delay: 0.5, ease: "back.out(1.7)" }
            );
        }

        // Auto body scroll lock observer
        const modalObserver = new MutationObserver((mutations) => {
            let anyActive = false;
            document.querySelectorAll('.modal-overlay, #cartOverlay').forEach(el => {
                if (el.classList.contains('active')) {
                    anyActive = true;
                }
            });
            if (anyActive) {
                document.body.classList.add('modal-open');
            } else {
                document.body.classList.remove('modal-open');
            }
        });

        document.querySelectorAll('.modal-overlay, #cartOverlay').forEach(el => {
            modalObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
        });
    }
});

// Expose functions to window for module mode inline event handlers
window.openProductModal = openProductModal;
window.addToCart = addToCart;
window.updateCartQuantity = updateCartQuantity;
window.removeFromCart = removeFromCart;


