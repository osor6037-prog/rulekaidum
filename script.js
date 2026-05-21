// ── STATE ──
let images = [];
let pendingFiles = [];
let currentFilter = 'all';
let searchQuery   = '';
let _dbReady      = false;
let _pendingDeleteId = null;

// Pagination State (เพื่อไม่ให้โหลด DOM พร้อมกันเยอะๆ จนค้าง)
let filteredList = [];
let renderCount = 0;
const CHUNK_SIZE = 15; // โหลดทีละ 15 รูป

const CURRENCY_SYMBOLS = { THB: '฿', USD: '$', JPY: '¥', EUR: '€', GBP: '£', CNY: '¥', KRW: '₩', SGD: 'S$', MYR: 'RM' };
const sampleColors = ['#1a6b2d','#22883a','#0d3318','#134d21','#1a6b2d','#0a2b10','#2eaa4a','#0d4a1a','#19712e','#0f3d17'];
const sampleNames = ['Misty Forest Spirit','Emerald Shrine','Green Witch','Bamboo Guardian','Leaf Fairy','Mossy Cave Dweller','Jade Samurai','Forest Priestess','Nature Mage','River Nymph','Valley Keeper','Fern Spirit'];

// ── FIREBASE HELPERS ──
function dbRef(path) { return window._fbRef(window._fbDB, path); }

async function fbSaveImage(img) {
  await window._fbSet(dbRef(`images/${img.id}`), {
    id: img.id, name: img.name, src: img.src, date: img.date,
    liked: img.liked, price: img.price || '', currency: img.currency || 'THB',
    isPlaceholder: img.isPlaceholder || false
  });
}

async function fbDeleteImage(id) { await window._fbRemove(dbRef(`images/${id}`)); }
async function fbUpdateLike(id, liked) { await window._fbUpdate(dbRef(`images/${id}`), { liked }); }
async function fbClearAll() { await window._fbRemove(dbRef('images')); }

// ── INIT ──
function init() {
  showLoading(true);
  if (window._fbReady) startListening();
  else document.addEventListener('firebase-ready', startListening);
  
  setupInfiniteScroll(); // เปิดระบบดักจับการเลื่อนจอ
}

function showLoading(on) {
  let el = document.getElementById('fbLoading');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fbLoading';
    el.style.cssText = `position:fixed;inset:0;z-index:999;background:rgba(10,26,14,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;font-family:'Orbitron',monospace;color:var(--accent);font-size:0.8rem;letter-spacing:3px;`;
    el.innerHTML = `<div style="width:48px;height:48px;border:3px solid rgba(0,255,106,0.2);border-top-color:var(--accent);border-radius:50%;animation:spin 0.8s linear infinite"></div><span>CONNECTING TO FIREBASE...</span><style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;
    document.body.appendChild(el);
  }
  el.style.display = on ? 'flex' : 'none';
}

function startListening() {
  _dbReady = true;
  window._fbOnValue(dbRef('images'), snapshot => {
    const data = snapshot.val();
    images = data ? Object.values(data).sort((a,b) => b.id - a.id) : [];
    showLoading(false);
    if (images.length === 0) loadSamples(true);
    else applyFiltersAndResetRender();
  });
}

// ── OPTIMIZATION: LAZY LOADING ──
const imageObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      img.src = img.dataset.src; // โหลดภาพเมื่อเลื่อนจอมาเจอ
      img.onload = () => img.classList.add('loaded'); // สั่งแสดงผล
      observer.unobserve(img);
    }
  });
}, { rootMargin: '100px 0px' });

function setupInfiniteScroll() {
  const trigger = document.getElementById('loadMoreTrigger');
  const scrollObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && renderCount < filteredList.length) {
      renderNextChunk();
    }
  }, { rootMargin: '200px' });
  scrollObserver.observe(trigger);
}

// ── RENDER ENGINE ──
function applyFiltersAndResetRender() {
  let list = [...images];
  if (currentFilter === 'today') {
    const today = new Date().toDateString();
    list = list.filter(img => new Date(img.date).toDateString() === today);
  } else if (currentFilter === 'fav') {
    list = list.filter(img => img.liked);
  }
  
  if (searchQuery) {
    const q = searchQuery.toLowerCase().trim();
    list = list.filter(img => {
      const priceRaw = img.price ? String(img.price) : '';
      return img.name.toLowerCase().includes(q) || priceRaw.includes(q);
    });
  }
  
  filteredList = list;
  renderCount = 0;
  
  document.getElementById('headerCount').textContent = `${images.length} IMAGES`;
  document.getElementById('galleryCount').textContent = `${filteredList.length} รูป`;
  document.getElementById('galleryGrid').innerHTML = ''; 
  
  if (filteredList.length === 0) {
    document.getElementById('galleryGrid').innerHTML = `<div class="empty-state"><div class="empty-icon">🌿</div><div class="empty-text">ไม่พบรูปภาพ</div></div>`;
    return;
  }
  
  renderNextChunk();
}

function renderNextChunk() {
  const grid = document.getElementById('galleryGrid');
  const fragment = document.createDocumentFragment();
  const nextEnd = Math.min(renderCount + CHUNK_SIZE, filteredList.length);
  const chunkToRender = filteredList.slice(renderCount, nextEnd);
  
  chunkToRender.forEach((img, index) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.onclick = () => openLightbox(img.id);
    const priceDisplay = img.price ? formatPrice(img.price, img.currency || 'THB') : '';
    
    card.innerHTML = `
      <div class="card-img-wrap">
        <img class="card-img" data-src="${img.src}" alt="${escHtml(img.name)}" loading="lazy" decoding="async">
        <div class="card-badge">PNG</div>
        <div class="card-overlay">
          <div class="card-actions">
            <button class="card-action-btn" title="Fullscreen" onclick="event.stopPropagation();openLightbox('${img.id}')">🔍</button>
            <button class="card-action-btn" title="Download" onclick="event.stopPropagation();downloadImg('${img.id}')">⬇</button>
          </div>
        </div>
      </div>
      <div class="card-body">
        <div class="card-name" title="${escHtml(img.name)}">${escHtml(img.name)}</div>
        <div class="card-price ${!img.price ? 'no-price' : ''}">${priceDisplay || 'ไม่ระบุราคา'}</div>
        <div class="card-meta">
          <span class="card-date">${fmtDate(img.date)}</span>
          <div style="display:flex;align-items:center">
            <button class="card-heart ${img.liked?'liked':''}" onclick="event.stopPropagation();toggleLike('${img.id}',this)">${img.liked?'❤':'🤍'}</button>
            <button class="card-delete" onclick="event.stopPropagation();showConfirm('${img.id}')">🗑</button>
          </div>
        </div>
      </div>
    `;
    fragment.appendChild(card);
    imageObserver.observe(card.querySelector('img')); // สั่งให้ Observer เฝ้ามองรูปนี้
  });
  
  grid.appendChild(fragment);
  renderCount = nextEnd;
}

// ── UTILITIES & UI FUNCTIONS ──
function filterCards() { searchQuery = document.getElementById('searchInput').value.toLowerCase(); applyFiltersAndResetRender(); }
function clearSearch() { document.getElementById('searchInput').value = ''; searchQuery = ''; applyFiltersAndResetRender(); }
function setFilter(f, btn) {
  currentFilter = f;
  document.querySelectorAll('.filter-tag').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyFiltersAndResetRender();
}

function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtDate(iso) { const d = new Date(iso); return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear().toString().slice(-2)}`; }
function formatPrice(price, currency) {
  if (!price && price !== 0) return '';
  const sym = CURRENCY_SYMBOLS[currency] || currency;
  const num = parseFloat(price);
  if (isNaN(num)) return '';
  const decimals = (currency === 'JPY' || currency === 'KRW') ? 0 : 2;
  return `${sym} ${num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${currency}`;
}

function showConfirm(id) {
  const img = images.find(i => i.id == id);
  if (!img) return;
  _pendingDeleteId = id;
  document.getElementById('confirmItemName').textContent = `"${img.name}"`;
  document.getElementById('confirmOverlay').classList.add('show');
  document.getElementById('confirmDeleteBtn').onclick = () => {
    closeConfirm();
    fbDeleteImage(_pendingDeleteId).then(() => toast('🗑 ลบรูปแล้ว')).catch(e => toast('❌ ' + e.message));
  };
}
function closeConfirm() { document.getElementById('confirmOverlay').classList.remove('show'); _pendingDeleteId = null; }
document.getElementById('confirmOverlay').addEventListener('click', function(e) { if (e.target === this) closeConfirm(); });

function fileChosen(e) {
  pendingFiles = Array.from(e.target.files);
  if (pendingFiles.length > 0) {
    const reader = new FileReader();
    reader.onload = ev => {
      const prev = document.getElementById('uploadPreview');
      prev.src = ev.target.result; prev.style.display = 'block';
      document.getElementById('dropIcon').textContent = '✅';
      document.getElementById('dropText').textContent = `${pendingFiles.length} ไฟล์เลือกแล้ว`;
    };
    reader.readAsDataURL(pendingFiles[0]);
    if (!document.getElementById('nameInput').value && pendingFiles.length === 1) {
      document.getElementById('nameInput').value = pendingFiles[0].name.replace(/\.[^.]+$/, '').replace(/[-_]/g,' ');
    }
  }
}
function dragOver(e) { e.preventDefault(); document.getElementById('dropZone').classList.add('drag-over'); }
function dragLeave() { document.getElementById('dropZone').classList.remove('drag-over'); }
function dropFile(e) { e.preventDefault(); dragLeave(); pendingFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')); if (pendingFiles.length) fileChosen({ target: { files: pendingFiles } }); }

function addImage() {
  const name = document.getElementById('nameInput').value.trim() || '(ไม่มีชื่อ)';
  const price = document.getElementById('priceInput').value.trim();
  const currency = document.getElementById('currencySelect').value;
  if (pendingFiles.length === 0) { toast('⚠ กรุณาเลือกรูปภาพก่อน'); return; }

  let processed = 0;
  pendingFiles.forEach((file, idx) => {
    const reader = new FileReader();
    reader.onload = async ev => {
      const newImg = {
        id: Date.now() + idx, name: pendingFiles.length > 1 ? `${name} ${idx+1}` : name,
        src: ev.target.result, date: new Date().toISOString(), liked: false, price: price, currency: currency
      };
      try { await fbSaveImage(newImg); } catch(e) { toast('❌ บันทึกไม่สำเร็จ: ' + e.message); }
      processed++;
      if (processed === pendingFiles.length) { resetForm(); toast(`✅ เพิ่ม ${processed} รูปสำเร็จ!`); }
    };
    reader.readAsDataURL(file);
  });
}

function resetForm() {
  document.getElementById('nameInput').value = ''; document.getElementById('priceInput').value = '';
  document.getElementById('currencySelect').value = 'THB'; document.getElementById('fileInput').value = '';
  document.getElementById('uploadPreview').style.display = 'none'; document.getElementById('dropIcon').textContent = '📂';
  document.getElementById('dropText').textContent = 'คลิกหรือลากไฟล์มาวาง'; pendingFiles = [];
}

function toggleLike(id, btn) {
  const img = images.find(i => i.id == id);
  if (!img) return;
  img.liked = !img.liked;
  btn.className = 'card-heart ' + (img.liked ? 'liked' : '');
  btn.textContent = img.liked ? '❤' : '🤍';
  fbUpdateLike(id, img.liked).catch(e => toast('❌ ' + e.message));
  if (currentFilter === 'fav') applyFiltersAndResetRender();
}

function downloadImg(id) {
  const img = images.find(i => i.id == id);
  if (!img) return;
  const a = document.createElement('a'); a.href = img.src; a.download = img.name + '.jpg'; a.click();
  toast('⬇ ดาวน์โหลดแล้ว!');
}

function clearAll() {
  if (!confirm('ลบรูปทั้งหมด?')) return;
  fbClearAll().then(() => toast('🗑 ล้างแกลเลอรีแล้ว')).catch(e => toast('❌ ' + e.message));
}

function openLightbox(id) {
  const img = images.find(i => i.id == id);
  if (!img) return;
  document.getElementById('lightboxImg').src = img.src;
  document.getElementById('lightboxCaption').textContent = img.name;
  const priceEl = document.getElementById('lightboxPrice');
  if (img.price) { priceEl.textContent = formatPrice(img.price, img.currency || 'THB'); priceEl.style.display = ''; } else { priceEl.style.display = 'none'; }
  document.getElementById('lightbox').classList.add('show'); document.body.style.overflow = 'hidden';
}
function closeLightbox(e) {
  if (e && e.target !== document.getElementById('lightbox') && !e.target.classList.contains('lightbox-close')) return;
  document.getElementById('lightbox').classList.remove('show'); document.body.style.overflow = '';
}

function toggleMenu() { document.getElementById('mobileMenu').classList.toggle('open'); document.getElementById('hamBtn').classList.toggle('open'); }
function scrollTopToTop() { window.scrollTo({top:0,behavior:'smooth'}); if(document.getElementById('mobileMenu').classList.contains('open')) toggleMenu(); }

function validatePriceInput(el) {
  let v = el.value.replace(/[^0-9.]/g, ''); const parts = v.split('.');
  if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
  if (parts[1] && parts[1].length > 2) v = parts[0] + '.' + parts[1].slice(0,2);
  el.value = v;
}

function loadSamples(silent = false) {
  const today = new Date().toISOString();
  const samples = sampleNames.map((name, i) => ({ id: Date.now() - i * 1000, name, src: generatePlaceholder(name, sampleColors[i % sampleColors.length]), date: today, liked: false, isPlaceholder: true }));
  Promise.all(samples.map(img => fbSaveImage(img))).then(() => { if (!silent) toast('✨ โหลดตัวอย่างแล้ว!'); }).catch(e => toast('❌ ' + e.message));
}

function generatePlaceholder(name, bg) {
  const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 400; const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0,0,300,400); grad.addColorStop(0, bg); grad.addColorStop(1, '#0a1a0e');
  ctx.fillStyle = grad; ctx.fillRect(0,0,300,400);
  ctx.strokeStyle = 'rgba(61,204,94,0.08)'; ctx.lineWidth = 1;
  for (let x=0;x<300;x+=30){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,400);ctx.stroke();}
  for (let y=0;y<400;y+=30){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(300,y);ctx.stroke();}
  ctx.fillStyle = 'rgba(168,245,188,0.9)'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
  const words = name.split(' '); words.forEach((w, i) => ctx.fillText(w, 150, 360 + i * 18 - (words.length-1)*9));
  return canvas.toDataURL('image/jpeg', 0.8);
}

function toast(msg) {
  const wrap = document.getElementById('toastWrap'); const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg; wrap.appendChild(el); setTimeout(() => el.remove(), 2700);
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeConfirm(); closeLightbox(); } });

// เริ่มต้นการทำงาน (รอให้ Firebase พร้อมก่อน)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}