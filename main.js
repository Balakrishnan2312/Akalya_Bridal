const API_BASE = (window.location.port !== '5000' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:'))
  ? 'http://localhost:5000'
  : '';

// Add fade-in CSS animations dynamically to the page head
const styleToken = document.createElement('style');
styleToken.textContent = `
  @keyframes galleryFadeIn {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .gallery-item {
    opacity: 0;
    animation: galleryFadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  /* Disabled button styling for closed bookings */
  .btn-gold.disabled-action {
    background: #cccccc !important;
    color: #888888 !important;
    border-color: #bbbbbb !important;
    pointer-events: none !important;
    box-shadow: none !important;
    cursor: not-allowed !important;
  }
`;
document.head.appendChild(styleToken);

let allGalleryImages = [];

// ================= RENDER DYNAMIC GALLERY =================
async function fetchAndRenderGallery(activeFilter = 'all') {
  const grid = document.getElementById('gallery-grid');
  if (!grid) return;
  console.log('[GALLERY] Fetching gallery list from /api/gallery...');

  try {
    const res = await fetch(`${API_BASE}/api/gallery`);
    if (res.ok) {
      allGalleryImages = await res.json();
    } else {
      const fallbackRes = await fetch(`${API_BASE}/images`);
      allGalleryImages = await fallbackRes.json();
    }
    console.log(`[GALLERY] Successfully loaded ${allGalleryImages.length} images.`);
    renderFilteredGrid(activeFilter);
  } catch (err) {
    console.error('[GALLERY] Error loading gallery:', err);
    grid.innerHTML = '<div class="w-full text-center py-12 text-gray-500 italic">Error loading studio gallery photos.</div>';
  }
}

function renderFilteredGrid(filter = 'all') {
  const grid = document.getElementById('gallery-grid');
  if (!grid) return;

  const items = filter === 'all' ? allGalleryImages : allGalleryImages.filter(img => (img.cat === filter || img.category === filter));

  if (items.length === 0) {
    grid.innerHTML = '<div class="w-full text-center py-16 text-gray-500 font-medium text-lg">No photos yet</div>';
    return;
  }

  grid.innerHTML = items.map((g, index) => {
    const rawImg = g.img || g.imageUrl || '';
    const resolvedImg = (rawImg.startsWith('http') || rawImg.startsWith('data:')) ? rawImg : `${API_BASE}${rawImg.startsWith('/') ? '' : '/'}${rawImg}`;
    const fullImg = resolvedImg.includes('unsplash.com') ? resolvedImg.replace('w=900', 'w=1600') : resolvedImg;
    const animationDelay = `${(index % 8) * 0.08}s`;
    
    return `
      <div class="gallery-item cursor-pointer" data-full="${fullImg}" style="animation-delay: ${animationDelay};">
        <img src="${resolvedImg}" alt="${g.title}" class="w-full h-full object-cover transition-all duration-500" loading="lazy"
             onerror="this.closest('.gallery-item').style.background='linear-gradient(135deg,#D8B98A,#C89B6D)'; this.remove();">
        <div class="gallery-overlay">
          <p class="text-white text-sm font-medium">${g.title}</p>
        </div>
      </div>`;
  }).join('');

  attachLightboxEvents();
}

function attachLightboxEvents() {
  document.querySelectorAll('.gallery-item').forEach(item => {
    item.addEventListener('click', () => {
      const lightbox = document.getElementById('lightbox');
      const lightboxImg = document.querySelector('#lightbox img');
      if (lightbox && lightboxImg) {
        lightboxImg.src = item.dataset.full;
        lightbox.classList.add('open');
      }
    });
  });
}

function formatTime12h(time24) {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

// ================= STORE & BOOKING STATUS MANAGER =================
async function enforceStoreStatus() {
  console.log('[STATUS] Fetching store and booking status from /api/store/status...');
  try {
    let res = await fetch(`${API_BASE}/api/store/status`);
    if (!res.ok) {
      res = await fetch(`${API_BASE}/status`);
    }
    const data = await res.json();
    console.log('[STATUS] Received:', data);
    
    handleUIForStoreStatus(data);
    handleUIForBookingStatus(data.bookingOpen);
  } catch (err) {
    console.error('[STATUS] Connection failed:', err);
    const topStatus = document.getElementById('top-store-status');
    if (topStatus) {
      topStatus.innerHTML = '<span style="color: #c62828; font-weight: 600;">⚠️ Server Offline</span>';
    }
  }
}

// Handles the Store Status badge (top left/navbar)
function handleUIForStoreStatus(statusData) {
  const topStatus = document.getElementById('top-store-status');
  if (!topStatus) return;

  const storeIsOpen = typeof statusData === 'object' ? statusData.isOpen : statusData;

  if (storeIsOpen) {
    topStatus.textContent = `🟢 Store Open`;
    topStatus.style.borderColor = 'rgba(46, 125, 50, 0.35)';
    topStatus.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
    topStatus.style.color = '#1b5e20';
    topStatus.style.backdropFilter = 'blur(18px)';
    topStatus.style.webkitBackdropFilter = 'blur(18px)';
    topStatus.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.08)';
  } else {
    topStatus.textContent = `🔴 Store Closed`;
    topStatus.style.borderColor = 'rgba(198, 40, 40, 0.35)';
    topStatus.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
    topStatus.style.color = '#b71c1c';
    topStatus.style.backdropFilter = 'blur(18px)';
    topStatus.style.webkitBackdropFilter = 'blur(18px)';
    topStatus.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.08)';
  }
}

// Handles the Booking Form state and badge container
function handleUIForBookingStatus(bookingIsOpen) {
  const badgeContainer = document.getElementById('booking-badge-container');
  const submitBtn = document.getElementById('booking-submit-btn');
  const bookingForm = document.getElementById('booking-form');

  // 1. Show appropriate open/closed badge on the form
  if (badgeContainer) {
    if (bookingIsOpen) {
      badgeContainer.innerHTML = `<span class="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs px-4 py-1.5 rounded-full font-semibold uppercase tracking-wider select-none shadow-sm transition-all duration-300">Bookings Open</span>`;
    } else {
      badgeContainer.innerHTML = `<span class="bg-red-500/10 border border-red-500/30 text-red-400 text-xs px-4 py-1.5 rounded-full font-semibold uppercase tracking-wider select-none shadow-sm transition-all duration-300">Currently Closed</span>`;
    }
  }

  // 2. Submit Button state
  if (submitBtn) {
    if (bookingIsOpen) {
      submitBtn.textContent = 'Request Appointment';
      submitBtn.removeAttribute('disabled');
      submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      submitBtn.style.pointerEvents = 'auto';
    } else {
      submitBtn.textContent = 'Bookings Closed';
      submitBtn.setAttribute('disabled', 'true');
      submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
      submitBtn.style.pointerEvents = 'none';
    }
  }

  // 3. Enable or disable input controls inside the form
  if (bookingForm) {
    const inputs = bookingForm.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      if (!bookingIsOpen) {
        input.setAttribute('disabled', 'true');
        input.style.opacity = '0.5';
        input.style.cursor = 'not-allowed';
      } else {
        input.removeAttribute('disabled');
        input.style.opacity = '1';
        input.style.cursor = 'auto';
      }
    });
  }

  // 4. Handle navigation links to booking page
  document.querySelectorAll('a[href="#booking"], a[href="index.html#booking"]').forEach(btn => {
    if (btn.id === 'booking-submit-btn') return;
    
    if (!bookingIsOpen) {
      btn.classList.add('disabled-action');
      if (!btn.hasAttribute('data-original-html')) {
        btn.setAttribute('data-original-html', btn.innerHTML);
      }
      btn.innerHTML = 'Bookings Closed';
      btn.style.pointerEvents = 'none';
      btn.style.opacity = '0.6';
    } else {
      btn.classList.remove('disabled-action');
      if (btn.hasAttribute('data-original-html')) {
        btn.innerHTML = btn.getAttribute('data-original-html');
      }
      btn.style.pointerEvents = 'auto';
      btn.style.opacity = '1';
    }
  });
}

// ================= BOOKING FORM INTEGRATION =================
function setupBookingFormHandler() {
  const bookingForm = document.getElementById('booking-form');
  if (!bookingForm) return;

  const submitBtn = document.getElementById('booking-submit-btn');
  const errorEl = document.getElementById('form-error');
  const successEl = document.getElementById('form-success');
  const bDate = document.getElementById('b-date');

  if (bDate) {
    bDate.min = new Date().toISOString().split('T')[0];
  }

  // Clear error highlight on field input
  const requiredFields = ['b-name', 'b-phone', 'b-date', 'b-service'];
  requiredFields.forEach(fieldId => {
    const input = document.getElementById(fieldId);
    if (input) {
      input.addEventListener('input', function () {
        const fieldContainer = this.closest('.form-field');
        if (fieldContainer) fieldContainer.classList.remove('error');
      });
    }
  });

  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Reset error states
    document.querySelectorAll('.form-field').forEach(field => field.classList.remove('error'));
    if (errorEl) errorEl.classList.add('hidden');
    if (successEl) successEl.classList.add('hidden');

    const name = document.getElementById('b-name')?.value.trim() || '';
    const phone = document.getElementById('b-phone')?.value.trim() || '';
    const email = document.getElementById('b-email')?.value.trim() || '';
    const date = document.getElementById('b-date')?.value || '';
    const service = document.getElementById('b-service')?.value || '';
    const message = document.getElementById('b-message')?.value.trim() || '';

    let isValid = true;
    if (!name) {
      document.getElementById('b-name')?.closest('.form-field')?.classList.add('error');
      isValid = false;
    }
    if (!phone || !/^\d{10}$/.test(phone.replace(/[^0-9]/g, ''))) {
      document.getElementById('b-phone')?.closest('.form-field')?.classList.add('error');
      isValid = false;
    }
    if (!date) {
      document.getElementById('b-date')?.closest('.form-field')?.classList.add('error');
      isValid = false;
    }
    if (!service) {
      document.getElementById('b-service')?.closest('.form-field')?.classList.add('error');
      isValid = false;
    }

    if (!isValid) {
      if (errorEl) {
        errorEl.textContent = '⚠️ Please fill in all required fields accurately.';
        errorEl.classList.remove('hidden');
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending Request...';
    }

    try {
      const res = await fetch(`${API_BASE}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: name,
          phone: phone,
          email: email,
          eventDate: date,
          service: service,
          message: message
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        if (successEl) {
          successEl.textContent = '✓ Appointment request submitted successfully. We will contact you shortly.';
          successEl.classList.remove('hidden');
        }
        bookingForm.reset();

        const dateParts = date.split('-');
        const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : date;
        const waMsg = `NEW APPOINTMENT REQUEST\n\nName: ${name}\nPhone: ${phone}\nEmail: ${email || 'Not provided'}\nEvent Date: ${formattedDate}\nService: ${service}\nEvent Details: ${message || 'None'}\n\nPlease confirm availability.`;
        const waUrl = `https://wa.me/919360728730?text=${encodeURIComponent(waMsg)}`;
        setTimeout(() => window.open(waUrl, '_blank'), 800);
      } else {
        if (errorEl) {
          errorEl.textContent = `⚠️ ${data.message || 'Error submitting booking.'}`;
          errorEl.classList.remove('hidden');
        }
      }
    } catch (err) {
      console.error('[BOOKING] Submit error:', err);
      if (successEl) {
        successEl.textContent = '✓ Opening WhatsApp with your appointment request...';
        successEl.classList.remove('hidden');
      }
      const dateParts = date.split('-');
      const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : date;
      const waMsg = `NEW APPOINTMENT REQUEST\n\nName: ${name}\nPhone: ${phone}\nEmail: ${email || 'Not provided'}\nEvent Date: ${formattedDate}\nService: ${service}\nEvent Details: ${message || 'None'}`;
      const waUrl = `https://wa.me/919360728730?text=${encodeURIComponent(waMsg)}`;
      setTimeout(() => {
        window.open(waUrl, '_blank');
        bookingForm.reset();
      }, 500);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Request Appointment';
      }
    }
  });
// ================= DRESS SHOPPING & CART SYSTEM =================
let allDressesList = [];
let cartState = [];

function formatINR(amount) {
  return '₹ ' + (Number(amount) || 0).toLocaleString('en-IN');
}

function loadCartFromStorage() {
  try {
    const saved = localStorage.getItem('bridalCart');
    if (saved) {
      cartState = JSON.parse(saved);
    }
  } catch (e) {
    cartState = [];
  }
  updateCartBadgeAndUI();
}

function saveCartToStorage() {
  try {
    localStorage.setItem('bridalCart', JSON.stringify(cartState));
  } catch (e) {}
  updateCartBadgeAndUI();
}

async function fetchAndRenderDresses() {
  const grid = document.getElementById('dress-grid');
  if (!grid) return;

  console.log('[DRESSES] Fetching dresses list from /api/dresses...');
  try {
    const res = await fetch(`${API_BASE}/api/dresses`);
    if (res.ok) {
      allDressesList = await res.json();
    } else {
      const fbRes = await fetch(`${API_BASE}/dresses`);
      allDressesList = await fbRes.json();
    }
    console.log(`[DRESSES] Successfully loaded ${allDressesList.length} dresses.`);
    renderDressGrid();
  } catch (err) {
    console.error('[DRESSES] Error loading dresses:', err);
    grid.innerHTML = '<div class="col-span-full text-center py-16 text-charcoal/50 font-medium">Unable to load dress collection. Please refresh or try again later.</div>';
  }
}

function renderDressGrid() {
  const grid = document.getElementById('dress-grid');
  if (!grid) return;

  if (!Array.isArray(allDressesList) || allDressesList.length === 0) {
    grid.innerHTML = '<div class="col-span-full text-center py-16 text-charcoal/50 font-medium">No dresses available in boutique catalog.</div>';
    return;
  }

  grid.innerHTML = allDressesList.map(dress => {
    const rawImg = dress.imageUrl || dress.img || '';
    const resolvedImg = (rawImg.startsWith('http') || rawImg.startsWith('data:')) ? rawImg : `${API_BASE}${rawImg.startsWith('/') ? '' : '/'}${rawImg}`;
    const formattedPrice = formatINR(dress.price);
    const dressId = dress.id || dress._id;
    const descText = dress.description ? (dress.description.length > 75 ? dress.description.substring(0, 75) + '...' : dress.description) : 'Handcrafted luxury bridal wear with bespoke detailing.';

    return `
      <div class="dress-card group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-500 border border-sand/40 flex flex-col">
        <div class="relative aspect-[3/4] overflow-hidden bg-ivory cursor-pointer" onclick="openDressDetailModal('${dressId}')">
          <img src="${resolvedImg}" alt="${dress.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out" loading="lazy" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1610030469983-98e550d6193c?q=80&w=900&auto=format&fit=crop';">
          <div class="absolute inset-0 bg-gradient-to-t from-charcoal/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4 hidden md:flex">
            <button type="button" class="w-full py-2.5 bg-white/90 backdrop-blur-sm text-charcoal text-xs font-semibold uppercase tracking-wider rounded-xl hover:bg-white transition-colors cursor-pointer">
              <i class="bx bx-show text-sm align-middle mr-1"></i> Quick View
            </button>
          </div>
          <span class="absolute top-3 right-3 bg-charcoal/85 backdrop-blur-md text-champagne text-xs font-bold px-3 py-1.5 rounded-full shadow-md">
            ${formattedPrice}
          </span>
        </div>
        <div class="p-5 md:p-6 flex flex-col flex-grow">
          <h3 onclick="openDressDetailModal('${dressId}')" class="font-display text-base md:text-lg font-semibold text-charcoal mb-2 group-hover:text-rosegold transition-colors leading-snug cursor-pointer">${dress.name}</h3>
          <p class="text-xs text-charcoal/65 line-clamp-2 mb-4 flex-grow leading-relaxed">${descText}</p>
          <div class="pt-4 border-t border-sand/30 flex items-center justify-between gap-2 mt-auto">
            <div class="flex flex-col">
              <span class="text-[0.65rem] uppercase tracking-wider text-charcoal/50 font-semibold">Price</span>
              <span class="font-display text-sm md:text-base font-bold text-rosegold">${formattedPrice}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <button type="button" onclick="openDressDetailModal('${dressId}')" class="px-2.5 py-2 border border-sand hover:border-rosegold text-charcoal rounded-xl text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer" title="View Details">
                <i class="bx bx-show text-base text-rosegold"></i> <span class="hidden xs:inline">Details</span>
              </button>
              <button type="button" onclick="addToCart('${dressId}')" class="btn-gold text-xs py-2 px-3 rounded-xl flex items-center gap-1 shadow-sm hover:shadow-md cursor-pointer">
                <i class="bx bx-shopping-bag text-base"></i> Add
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function addToCart(dressId, quantity = 1) {
  const dress = allDressesList.find(d => (d.id === dressId || d._id === dressId));
  if (!dress) return;

  const existingIndex = cartState.findIndex(item => item.id === dressId || item._id === dressId);
  if (existingIndex > -1) {
    cartState[existingIndex].qty += quantity;
  } else {
    cartState.push({
      id: dress.id || dress._id,
      _id: dress.id || dress._id,
      name: dress.name,
      price: dress.price,
      imageUrl: dress.imageUrl || dress.img || '',
      qty: quantity
    });
  }

  saveCartToStorage();
  openCartDrawer();
}

function updateCartQuantity(dressId, delta) {
  const index = cartState.findIndex(item => item.id === dressId || item._id === dressId);
  if (index > -1) {
    cartState[index].qty += delta;
    if (cartState[index].qty <= 0) {
      cartState.splice(index, 1);
    }
    saveCartToStorage();
  }
}

function removeFromCart(dressId) {
  cartState = cartState.filter(item => item.id !== dressId && item._id !== dressId);
  saveCartToStorage();
}

function updateCartBadgeAndUI() {
  const badge = document.getElementById('cart-badge-count');
  const countLabel = document.getElementById('cart-item-count-label');
  const itemsContainer = document.getElementById('cart-items-container');
  const subtotalEl = document.getElementById('cart-subtotal-price');
  const totalEl = document.getElementById('cart-total-price');
  const checkoutBtn = document.getElementById('proceed-checkout-btn');

  const totalQty = cartState.reduce((sum, item) => sum + item.qty, 0);
  const totalPrice = cartState.reduce((sum, item) => sum + (item.price * item.qty), 0);

  if (badge) badge.textContent = totalQty;
  if (countLabel) countLabel.textContent = `${totalQty} item${totalQty === 1 ? '' : 's'} in cart`;

  if (subtotalEl) subtotalEl.textContent = formatINR(totalPrice);
  if (totalEl) totalEl.textContent = formatINR(totalPrice);

  if (checkoutBtn) {
    if (totalQty === 0) {
      checkoutBtn.setAttribute('disabled', 'true');
      checkoutBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
      checkoutBtn.removeAttribute('disabled');
      checkoutBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  }

  if (itemsContainer) {
    if (cartState.length === 0) {
      itemsContainer.innerHTML = `
        <div class="text-center py-16 text-charcoal/50">
          <i class="bx bx-shopping-bag text-5xl text-sand mb-3"></i>
          <p class="font-medium text-sm">Your shopping cart is empty.</p>
          <p class="text-xs text-charcoal/40 mt-1">Add bridal dresses to view them here.</p>
        </div>
      `;
      return;
    }

    itemsContainer.innerHTML = cartState.map(item => {
      const rawImg = item.imageUrl || item.img || '';
      const resolvedImg = (rawImg.startsWith('http') || rawImg.startsWith('data:')) ? rawImg : `${API_BASE}${rawImg.startsWith('/') ? '' : '/'}${rawImg}`;
      const itemTotalFormatted = formatINR(item.price * item.qty);
      const itemId = item.id || item._id;

      return `
        <div class="flex items-center gap-4 p-3 bg-ivory rounded-2xl border border-sand/30">
          <img src="${resolvedImg}" alt="${item.name}" class="w-16 h-16 object-cover rounded-xl border border-sand/40" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1610030469983-98e550d6193c?q=80&w=900&auto=format&fit=crop';">
          <div class="flex-grow">
            <h4 class="font-display font-semibold text-sm text-charcoal line-clamp-1">${item.name}</h4>
            <span class="text-xs font-bold text-rosegold">${formatINR(item.price)}</span>
            <div class="flex items-center gap-2 mt-2">
              <div class="flex items-center border border-sand rounded-lg bg-white overflow-hidden">
                <button onclick="updateCartQuantity('${itemId}', -1)" class="w-6 h-6 flex items-center justify-center text-xs font-bold text-charcoal hover:bg-sand/40 cursor-pointer">-</button>
                <span class="w-7 text-center text-xs font-semibold">${item.qty}</span>
                <button onclick="updateCartQuantity('${itemId}', 1)" class="w-6 h-6 flex items-center justify-center text-xs font-bold text-charcoal hover:bg-sand/40 cursor-pointer">+</button>
              </div>
              <span class="text-xs text-charcoal/50 font-medium ml-auto">${itemTotalFormatted}</span>
            </div>
          </div>
          <button onclick="removeFromCart('${itemId}')" class="text-charcoal/40 hover:text-red-500 p-1 text-lg transition-colors cursor-pointer" title="Remove item">
            <i class="bx bx-trash"></i>
          </button>
        </div>
      `;
    }).join('');
  }
}

// Product Details Modal Control
let currentDetailDressId = null;
function openDressDetailModal(dressId) {
  const dress = allDressesList.find(d => (d.id === dressId || d._id === dressId));
  if (!dress) return;

  currentDetailDressId = dress.id || dress._id;
  const modal = document.getElementById('dress-detail-modal');
  const img = document.getElementById('detail-dress-img');
  const title = document.getElementById('detail-dress-title');
  const price = document.getElementById('detail-dress-price');
  const desc = document.getElementById('detail-dress-desc');
  const qtyInput = document.getElementById('detail-qty-input');

  if (!modal) return;

  const rawImg = dress.imageUrl || dress.img || '';
  const resolvedImg = (rawImg.startsWith('http') || rawImg.startsWith('data:')) ? rawImg : `${API_BASE}${rawImg.startsWith('/') ? '' : '/'}${rawImg}`;

  if (img) img.src = resolvedImg;
  if (title) title.textContent = dress.name;
  if (price) price.textContent = formatINR(dress.price);
  if (desc) desc.textContent = dress.description || 'Exclusive bridal design handcrafted with premium fabrics, embroidery, and fit.';
  if (qtyInput) qtyInput.value = 1;

  modal.classList.remove('hidden');
}

function closeDressDetailModal() {
  const modal = document.getElementById('dress-detail-modal');
  if (modal) modal.classList.add('hidden');
}

// Cart Drawer Controls
function openCartDrawer() {
  const cartModal = document.getElementById('cart-modal');
  if (cartModal) cartModal.classList.remove('hidden');
}

function closeCartDrawer() {
  const cartModal = document.getElementById('cart-modal');
  if (cartModal) cartModal.classList.add('hidden');
}

// Checkout Modal Controls
function openCheckoutModal() {
  if (cartState.length === 0) return;
  closeCartDrawer();

  const checkoutModal = document.getElementById('checkout-modal');
  const summaryBox = document.getElementById('checkout-summary-box');
  const formContainer = document.getElementById('checkout-form-container');
  const successContainer = document.getElementById('checkout-success-container');

  if (!checkoutModal) return;

  if (formContainer) formContainer.classList.remove('hidden');
  if (successContainer) successContainer.classList.add('hidden');

  const totalPrice = cartState.reduce((sum, item) => sum + (item.price * item.qty), 0);

  if (summaryBox) {
    summaryBox.innerHTML = `
      <div class="space-y-2 mb-3">
        ${cartState.map(i => `
          <div class="flex justify-between items-center text-xs">
            <span class="font-medium text-charcoal">${i.name} (x${i.qty})</span>
            <span class="font-bold text-rosegold">${formatINR(i.price * i.qty)}</span>
          </div>
        `).join('')}
      </div>
      <div class="pt-2 border-t border-sand/40 flex justify-between items-center font-bold text-sm text-charcoal">
        <span>Total Amount:</span>
        <span class="text-rosegold text-base">${formatINR(totalPrice)}</span>
      </div>
    `;
  }

  checkoutModal.classList.remove('hidden');
}

function closeCheckoutModal() {
  const checkoutModal = document.getElementById('checkout-modal');
  if (checkoutModal) checkoutModal.classList.add('hidden');
}

// Expose functions globally
window.openDressDetailModal = openDressDetailModal;
window.addToCart = addToCart;
window.updateCartQuantity = updateCartQuantity;
window.removeFromCart = removeFromCart;

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', () => {
  const yearSpan = document.getElementById('year');
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();

  // Load status and poll every 8 seconds
  enforceStoreStatus();
  setInterval(enforceStoreStatus, 8000);

  // Initialize Gallery Grid & Dress Shopping Collection
  fetchAndRenderGallery();
  fetchAndRenderDresses();
  loadCartFromStorage();

  // Bind Booking Form Submission Handler
  setupBookingFormHandler();

  // Bind category button filters
  document.querySelectorAll('.gallery-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.gallery-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      renderFilteredGrid(filter);
    });
  });

  // Lightbox close events
  const lightboxClose = document.getElementById('lightbox-close');
  if (lightboxClose) {
    lightboxClose.addEventListener('click', () => {
      const lightbox = document.getElementById('lightbox');
      if (lightbox) lightbox.classList.remove('open');
    });
  }

  const lightbox = document.getElementById('lightbox');
  if (lightbox) {
    lightbox.addEventListener('click', (e) => {
      if (e.target.id === 'lightbox') lightbox.classList.remove('open');
    });
  }

  // Dress Details Modal Events
  const closeDetailBtn = document.getElementById('close-dress-detail-modal');
  if (closeDetailBtn) closeDetailBtn.addEventListener('click', closeDressDetailModal);

  const qtyMinusBtn = document.getElementById('detail-qty-minus');
  const qtyPlusBtn = document.getElementById('detail-qty-plus');
  const qtyInput = document.getElementById('detail-qty-input');

  if (qtyMinusBtn && qtyInput) {
    qtyMinusBtn.addEventListener('click', () => {
      let val = parseInt(qtyInput.value, 10) || 1;
      if (val > 1) qtyInput.value = val - 1;
    });
  }

  if (qtyPlusBtn && qtyInput) {
    qtyPlusBtn.addEventListener('click', () => {
      let val = parseInt(qtyInput.value, 10) || 1;
      if (val < 99) qtyInput.value = val + 1;
    });
  }

  const detailAddCartBtn = document.getElementById('detail-add-cart-btn');
  if (detailAddCartBtn) {
    detailAddCartBtn.addEventListener('click', () => {
      if (!currentDetailDressId) return;
      const qty = parseInt(document.getElementById('detail-qty-input').value, 10) || 1;
      addToCart(currentDetailDressId, qty);
      closeDressDetailModal();
    });
  }

  // Cart Drawer Events
  const openCartBtn = document.getElementById('open-cart-btn');
  const closeCartBtn = document.getElementById('close-cart-modal');
  if (openCartBtn) openCartBtn.addEventListener('click', openCartDrawer);
  if (closeCartBtn) closeCartBtn.addEventListener('click', closeCartDrawer);

  // Checkout Modal Events
  const proceedCheckoutBtn = document.getElementById('proceed-checkout-btn');
  const closeCheckoutBtn = document.getElementById('close-checkout-modal');
  if (proceedCheckoutBtn) proceedCheckoutBtn.addEventListener('click', openCheckoutModal);
  if (closeCheckoutBtn) closeCheckoutBtn.addEventListener('click', closeCheckoutModal);

  const checkoutForm = document.getElementById('checkout-form');
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const formContainer = document.getElementById('checkout-form-container');
      const successContainer = document.getElementById('checkout-success-container');
      if (formContainer) formContainer.classList.add('hidden');
      if (successContainer) successContainer.classList.remove('hidden');

      // Clear Cart after successful checkout
      cartState = [];
      saveCartToStorage();
    });
  }

  const finishCheckoutBtn = document.getElementById('finish-checkout-btn');
  if (finishCheckoutBtn) finishCheckoutBtn.addEventListener('click', closeCheckoutModal);
});

