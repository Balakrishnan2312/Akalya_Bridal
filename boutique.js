const configuredBoutiqueApiBase = String(window.AKALYA_CONFIG?.API_BASE_URL || '').replace(/\/$/, '');
const BOUTIQUE_API_BASE = configuredBoutiqueApiBase || (
  window.location.port !== '5000' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')
    ? 'http://localhost:5000'
    : ''
);

function escapeBoutiqueHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function resolveBoutiqueImage(value) {
  const raw = String(value || '').trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${BOUTIQUE_API_BASE}${raw}`;
  return raw ? `${BOUTIQUE_API_BASE}/${raw}` : '';
}

function formatBoutiquePrice(price) {
  return `₹ ${(Number(price) || 0).toLocaleString('en-IN')}`;
}

async function loadBoutiqueCollection() {
  const grid = document.getElementById('boutique-dress-grid');
  if (!grid) return;

  try {
    const response = await fetch(`${BOUTIQUE_API_BASE}/api/dresses`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'Unable to load the collection.');

    const dresses = Array.isArray(payload) ? payload.filter((dress) => dress.isAvailable !== false) : [];
    if (dresses.length === 0) {
      grid.innerHTML = '<div class="collection-state">New bridal pieces are being prepared. Please contact the studio for the latest collection.</div>';
      return;
    }

    grid.innerHTML = dresses.map((dress) => {
      const name = String(dress.name || 'Bridal dress');
      const safeName = escapeBoutiqueHtml(name);
      const description = escapeBoutiqueHtml(dress.description || 'A studio-curated bridal design with custom fitting available.');
      const imageUrl = escapeBoutiqueHtml(resolveBoutiqueImage(dress.imageUrl || dress.img));
      const price = formatBoutiquePrice(dress.price);
      const message = encodeURIComponent(`Hello Akalya's Bridal Studio, I would like to enquire about ${name} (${price}).`);

      return `
        <article class="collection-card">
          <img class="collection-image" src="${imageUrl}" alt="${safeName}" loading="lazy">
          <div class="collection-card-body">
            <h3>${safeName}</h3>
            <span class="collection-price">${price}</span>
            <p class="collection-description">${description}</p>
            <a class="collection-inquire" href="https://wa.me/919360728730?text=${message}" target="_blank" rel="noopener noreferrer">
              <i class="bx bxl-whatsapp"></i> Enquire on WhatsApp
            </a>
          </div>
        </article>
      `;
    }).join('');
  } catch (error) {
    console.error('[BOUTIQUE] Failed to load dresses:', error);
    grid.innerHTML = '<div class="collection-state">The dress collection is temporarily unavailable. Please contact the studio directly.</div>';
  }
}

document.addEventListener('DOMContentLoaded', loadBoutiqueCollection);
