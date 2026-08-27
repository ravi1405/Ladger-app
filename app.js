/* ===================== Crash-visible error handling ===================== */
// If anything throws, show it on screen instead of failing silently —
// a dead button with no console open looks identical to "nothing happens".
window.addEventListener('error', (e) => {
  showFatalError((e.error && e.error.message) || e.message || 'Unknown script error');
});
window.addEventListener('unhandledrejection', (e) => {
  showFatalError((e.reason && e.reason.message) || String(e.reason) || 'Unknown async error');
});
function showFatalError(msg){
  let el = document.getElementById('fatal-error-banner');
  if(!el){
    el = document.createElement('div');
    el.id = 'fatal-error-banner';
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#8C3B3B;color:#fff;padding:12px 16px;font-family:sans-serif;font-size:13px;z-index:9999;white-space:pre-wrap;';
    document.body.appendChild(el);
  }
  el.textContent = 'App error: ' + msg;
}

/* ===================== Storage: never let it crash the app ===================== */
// Some browsers/modes (private browsing, strict site settings) block
// localStorage and throw instead of just failing — without this wrapper
// that throw happens at the top of the file and silently kills every
// event listener below it, including the Connect button.
const memoryFallback = {};
const storage = {
  get(key){
    try{ return localStorage.getItem(key); }
    catch(e){ return (key in memoryFallback) ? memoryFallback[key] : null; }
  },
  set(key, value){
    try{ localStorage.setItem(key, value); }
    catch(e){ memoryFallback[key] = value; }
  },
  remove(key){
    try{ localStorage.removeItem(key); }
    catch(e){ delete memoryFallback[key]; }
  }
};

/* ===================== Local keys ===================== */
const K_API = 'ledger.apiUrl.v1';
const K_SESSION = 'ledger.session.v1';
const K_CATEGORIES = 'ledger.categories.cache.v1';
const K_CURRENCY = 'ledger.currency.v1';
const K_EXP_CACHE = 'ledger.expenses.cache.v1';
const K_QUEUE = 'ledger.pending.queue.v1';

const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Health', 'Entertainment', 'Other'];
const PALETTE = ['#C9A961','#8C3B3B','#6E8C74','#A8895A','#7A6B4C','#B08968','#5C7A6E','#9C7D48','#8A6E9E','#6B8A9C'];

function uid(){ return 'local' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function todayISO(){
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off*60000).toISOString().slice(0,10);
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function formatDate(iso){
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' });
}
function initials(cat){
  if(!cat) return '?';
  const words = cat.trim().split(/\s+/);
  if(words.length === 1) return words[0].slice(0,3).toUpperCase();
  return (words[0][0]+words[1][0]).toUpperCase();
}

let toastTimer = null;
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> el.classList.remove('show'), 2400);
}

/* ===================== State ===================== */
let apiUrl = storage.get(K_API) || '';
let session = safeParse(storage.get(K_SESSION));
let categories = safeParse(storage.get(K_CATEGORIES)) || DEFAULT_CATEGORIES.slice();
let currency = storage.get(K_CURRENCY) || '₹';
let expenses = safeParse(storage.get(K_EXP_CACHE)) || [];
let queue = safeParse(storage.get(K_QUEUE)) || [];
let currentPeriod = 'month';

function safeParse(s){ try{ return JSON.parse(s); }catch(e){ return null; } }

/* ===================== API layer ===================== */
async function api(action, payload){
  if(!apiUrl) throw new Error('Not connected');
  const body = Object.assign({ action }, session ? { username: session.username, password: session.password } : {}, payload || {});
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  if(!res.ok) throw new Error('Server error');
  return res.json();
}

/* ===================== Gate flow: connect -> login -> app ===================== */
const gateConnect = document.getElementById('gate-connect');
const gateLogin = document.getElementById('gate-login');
const appEl = document.getElementById('app');
const tabbar = document.getElementById('tabbar');

function boot(){
  if(!apiUrl){
    gateConnect.hidden = false;
    return;
  }
  if(!session){
    gateLogin.hidden = false;
    return;
  }
  enterApp();
}

document.getElementById('connect-submit').addEventListener('click', async ()=>{
  const url = document.getElementById('connect-url').value.trim();
  const statusEl = document.getElementById('connect-status');
  if(!url.startsWith('https://script.google.com/')){
    statusEl.textContent = 'That doesn\'t look like an Apps Script Web App URL.';
    return;
  }
  apiUrl = url;
  storage.set(K_API, apiUrl);
  statusEl.textContent = '';
  gateConnect.hidden = true;
  gateLogin.hidden = false;
});

document.getElementById('reset-connection').addEventListener('click', ()=>{
  if(!confirm('This disconnects the app from the current sheet. You\'ll need the setup URL again to reconnect.')) return;
  storage.remove(K_API);
  storage.remove(K_SESSION);
  apiUrl = ''; session = null;
  gateLogin.hidden = true;
  gateConnect.hidden = false;
});

document.getElementById('login-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const statusEl = document.getElementById('login-status');
  const btn = document.getElementById('login-submit');
  btn.disabled = true; btn.textContent = 'Signing in…';
  statusEl.textContent = '';
  try{
    const res = await api('login', { username, password });
    if(!res.ok){
      statusEl.textContent = res.error || 'Could not sign in';
    } else {
      session = { username: res.username, password, role: res.role, displayName: res.displayName };
      storage.set(K_SESSION, JSON.stringify(session));
      gateLogin.hidden = true;
      enterApp();
    }
  }catch(err){
    statusEl.textContent = 'Couldn\'t reach the server. Check your connection.';
  }
  btn.disabled = false; btn.textContent = 'Sign in';
});

async function enterApp(){
  appEl.hidden = false;
  tabbar.hidden = false;
  document.getElementById('greeting').textContent = 'Welcome, ' + (session.displayName || session.username);
  document.getElementById('account-info').textContent = `${session.displayName} (${session.username}) · ${session.role === 'admin' ? 'Administrator' : 'Member'}`;
  document.getElementById('tab-admin').hidden = session.role !== 'admin';
  document.getElementById('input-currency').value = currency;
  document.getElementById('currency-mark').textContent = currency;
  document.getElementById('input-date').value = todayISO();

  renderCategoriesInputs();
  renderCachedImmediately();
  showView('add');

  await Promise.all([refreshCategories(), refreshExpenses()]);
  flushQueue();
}

document.getElementById('btn-logout').addEventListener('click', ()=>{
  storage.remove(K_SESSION);
  session = null;
  appEl.hidden = true;
  tabbar.hidden = true;
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  gateLogin.hidden = false;
});

/* ===================== Navigation ===================== */
const views = document.querySelectorAll('.view');
const tabs = document.querySelectorAll('.tab');
function showView(name){
  views.forEach(v => v.hidden = (v.dataset.view !== name));
  tabs.forEach(t => t.classList.toggle('active', t.dataset.target === name));
  if(name === 'history') renderHistory();
  if(name === 'analysis') renderAnalysis();
  if(name === 'account') renderCategoriesChips();
  if(name === 'admin') renderAdmin();
  window.scrollTo(0,0);
}
tabs.forEach(t => t.addEventListener('click', () => showView(t.dataset.target)));

/* ===================== Sync banner ===================== */
function setBanner(msg){
  const el = document.getElementById('sync-banner');
  if(!msg){ el.hidden = true; return; }
  el.textContent = msg;
  el.hidden = false;
}
window.addEventListener('online', ()=>{ setBanner(''); flushQueue(); refreshExpenses(); });
window.addEventListener('offline', ()=> setBanner('Offline — showing last synced data. New entries will sync automatically.'));

/* ===================== Categories ===================== */
async function refreshCategories(){
  try{
    const res = await api('getCategories', {});
    if(res.ok){
      categories = res.categories.length ? res.categories : DEFAULT_CATEGORIES.slice();
      storage.set(K_CATEGORIES, JSON.stringify(categories));
      renderCategoriesInputs();
      renderCategoriesChips();
    }
  }catch(e){ /* keep cached categories */ }
}

function renderCategoriesInputs(){
  const addSel = document.getElementById('input-category');
  const filterSel = document.getElementById('filter-category');
  const prevAdd = addSel.value, prevFilter = filterSel.value;
  addSel.innerHTML = categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  filterSel.innerHTML = '<option value="">All categories</option>' + categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  if(categories.includes(prevAdd)) addSel.value = prevAdd;
  if(categories.includes(prevFilter)) filterSel.value = prevFilter;
}

function renderCategoriesChips(){
  const el = document.getElementById('category-list');
  el.innerHTML = categories.map(c => `<span class="category-chip">${escapeHtml(c)}<button data-remove="${escapeHtml(c)}" aria-label="Remove ${escapeHtml(c)}">✕</button></span>`).join('');
  el.querySelectorAll('[data-remove]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const cat = btn.dataset.remove;
      if(!confirm(`Remove "${cat}"? Existing entries keep the old label.`)) return;
      try{
        const res = await api('removeCategory', { name: cat });
        if(res.ok){
          categories = categories.filter(c => c !== cat);
          if(categories.length === 0) categories = ['Other'];
          storage.set(K_CATEGORIES, JSON.stringify(categories));
          renderCategoriesInputs(); renderCategoriesChips();
          toast('Category removed');
        } else toast(res.error || 'Could not remove');
      }catch(e){ toast('Offline — try again once connected'); }
    });
  });
}

document.getElementById('category-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const input = document.getElementById('input-new-category');
  const val = input.value.trim();
  if(!val) return;
  if(categories.some(c => c.toLowerCase() === val.toLowerCase())){ toast('Already exists'); return; }
  try{
    const res = await api('addCategory', { name: val });
    if(res.ok){
      categories.push(val);
      storage.set(K_CATEGORIES, JSON.stringify(categories));
      input.value = '';
      renderCategoriesInputs(); renderCategoriesChips();
      toast('Category added');
    } else toast(res.error || 'Could not add');
  }catch(e){ toast('Offline — try again once connected'); }
});

document.getElementById('input-currency').addEventListener('change', (e)=>{
  currency = e.target.value.trim() || '₹';
  storage.set(K_CURRENCY, currency);
  document.getElementById('currency-mark').textContent = currency;
  updateTodayStrip();
  toast('Currency updated');
});

/* ===================== Expenses: fetch, cache, add ===================== */
function renderCachedImmediately(){
  updateTodayStrip();
}

async function refreshExpenses(){
  try{
    const res = await api('getExpenses', {});
    if(res.ok){
      expenses = res.expenses;
      storage.set(K_EXP_CACHE, JSON.stringify(expenses));
      setBanner('');
      updateTodayStrip();
      if(!document.getElementById('view-history').hidden) renderHistory();
      if(!document.getElementById('view-analysis').hidden) renderAnalysis();
      if(!document.getElementById('view-admin').hidden) renderAdmin();
    }
  }catch(e){
    setBanner('Offline — showing last synced data. New entries will sync automatically.');
  }
}

const addForm = document.getElementById('add-form');
addForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const amount = parseFloat(document.getElementById('input-amount').value);
  const category = document.getElementById('input-category').value;
  const description = document.getElementById('input-description').value.trim();
  const date = document.getElementById('input-date').value || todayISO();

  if(!amount || amount <= 0){ toast('Enter a valid amount'); return; }
  if(!category){ toast('Pick a category'); return; }

  const btn = document.getElementById('add-submit');
  btn.disabled = true;

  const localEntry = { id: uid(), username: session.username, amount: Math.round(amount*100)/100, category, description, date, pending: true };
  expenses.unshift(localEntry);
  storage.set(K_EXP_CACHE, JSON.stringify(expenses));
  updateTodayStrip();

  addForm.reset();
  document.getElementById('input-date').value = todayISO();
  renderCategoriesInputs();
  document.getElementById('input-category').value = category;

  try{
    const res = await api('addExpense', { date, category, description, amount });
    if(res.ok){
      const idx = expenses.findIndex(x => x.id === localEntry.id);
      if(idx > -1) expenses[idx] = res.entry;
      storage.set(K_EXP_CACHE, JSON.stringify(expenses));
      toast('Added to ledger');
    } else {
      toast(res.error || 'Could not save — will retry');
      queue.push({ type:'addExpense', payload:{ date, category, description, amount }, localId: localEntry.id });
      storage.set(K_QUEUE, JSON.stringify(queue));
    }
  }catch(err){
    toast('Offline — saved on this phone, will sync later');
    queue.push({ type:'addExpense', payload:{ date, category, description, amount }, localId: localEntry.id });
    storage.set(K_QUEUE, JSON.stringify(queue));
  }
  btn.disabled = false;
  updateTodayStrip();
});

function updateTodayStrip(){
  const today = todayISO();
  const mine = expenses.filter(e => e.date === today && e.username === session.username);
  const total = mine.reduce((s,e)=> s+e.amount, 0);
  document.getElementById('today-total').textContent = currency + ' ' + total.toFixed(2);
}

async function flushQueue(){
  if(queue.length === 0) return;
  const remaining = [];
  for(const item of queue){
    try{
      const res = await api(item.type, item.payload);
      if(!res.ok) remaining.push(item);
    }catch(e){ remaining.push(item); }
  }
  queue = remaining;
  storage.set(K_QUEUE, JSON.stringify(queue));
  if(remaining.length === 0){
    refreshExpenses();
  } else {
    setBanner(`${remaining.length} entr${remaining.length===1?'y':'ies'} waiting to sync…`);
  }
}

/* ===================== History (own entries) ===================== */
function renderHistory(){
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  const search = document.getElementById('search-box').value.trim().toLowerCase();
  const filterCat = document.getElementById('filter-category').value;

  let items = expenses.filter(e => e.username === session.username);
  items = items.slice().sort((a,b)=> (b.date+String(b.createdAt||'')).localeCompare(a.date+String(a.createdAt||'')));
  if(search) items = items.filter(e => (e.description||'').toLowerCase().includes(search) || (e.category||'').toLowerCase().includes(search));
  if(filterCat) items = items.filter(e => e.category === filterCat);

  if(items.length === 0){ list.innerHTML=''; empty.hidden=false; return; }
  empty.hidden = true;
  list.innerHTML = items.map(rowHtml).join('');
  bindDeleteButtons(list);
}

function rowHtml(e){
  return `
    <div class="history-row" data-id="${e.id}">
      <div class="stamp">${escapeHtml(initials(e.category))}</div>
      <div class="history-row-body">
        <div class="history-row-cat">${escapeHtml(e.category)}</div>
        <div class="history-row-desc">${escapeHtml(e.description || '—')}</div>
        <div class="history-row-date">${formatDate(e.date)}${e.pending ? ' · syncing…' : ''}</div>
      </div>
      <div class="history-row-amount${e.pending?' pending':''}">${currency}${e.amount.toFixed(2)}</div>
      <button class="history-row-del" data-del="${e.id}" aria-label="Delete">✕</button>
    </div>
  `;
}

function bindDeleteButtons(container){
  container.querySelectorAll('[data-del]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.del;
      const entry = expenses.find(e => e.id === id);
      if(entry && entry.pending){
        expenses = expenses.filter(e => e.id !== id);
        queue = queue.filter(q => q.localId !== id);
        storage.set(K_QUEUE, JSON.stringify(queue));
      } else {
        try{
          const res = await api('deleteExpense', { id });
          if(!res.ok){ toast(res.error || 'Could not delete'); return; }
          expenses = expenses.filter(e => e.id !== id);
        }catch(e){ toast('Offline — try again once connected'); return; }
      }
      storage.set(K_EXP_CACHE, JSON.stringify(expenses));
      renderHistory(); updateTodayStrip();
      if(!document.getElementById('view-admin').hidden) renderAdmin();
      toast('Entry deleted');
    });
  });
}

document.getElementById('search-box').addEventListener('input', renderHistory);
document.getElementById('filter-category').addEventListener('change', renderHistory);

/* ===================== Analysis (own entries) ===================== */
document.getElementById('period-tabs').addEventListener('click', (e)=>{
  const btn = e.target.closest('.period-tab');
  if(!btn) return;
  document.querySelectorAll('.period-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  currentPeriod = btn.dataset.period;
  renderAnalysis();
});

function filterByPeriod(list, period){
  const now = new Date();
  if(period === 'all') return list;
  if(period === 'week'){
    const day = now.getDay();
    const monday = new Date(now); monday.setDate(now.getDate() - ((day+6)%7)); monday.setHours(0,0,0,0);
    return list.filter(e => new Date(e.date+'T00:00:00') >= monday);
  }
  const y = now.getFullYear(), m = now.getMonth();
  return list.filter(e=>{
    const d = new Date(e.date+'T00:00:00');
    return d.getFullYear()===y && d.getMonth()===m;
  });
}

function renderAnalysis(){
  const own = expenses.filter(e => e.username === session.username);
  const items = filterByPeriod(own, currentPeriod);
  const total = items.reduce((s,e)=>s+e.amount,0);
  document.getElementById('analysis-total').textContent = currency + ' ' + total.toFixed(2);
  document.getElementById('analysis-count').textContent = items.length + (items.length===1 ? ' entry' : ' entries');

  const byCat = {};
  items.forEach(e=>{ byCat[e.category] = (byCat[e.category]||0) + e.amount; });
  const rows = Object.entries(byCat).sort((a,b)=> b[1]-a[1]);
  renderPieChart(rows, total, 'pie-chart', 'pie-legend');
  renderBarList(rows, total, 'bar-list');
}

function renderPieChart(rows, total, svgId, legendId){
  const svg = document.getElementById(svgId);
  const legend = document.getElementById(legendId);
  svg.innerHTML = ''; legend.innerHTML = '';
  if(total <= 0 || rows.length === 0){
    svg.innerHTML = `<circle cx="120" cy="120" r="90" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="22"/>
      <text x="120" y="126" text-anchor="middle" font-size="14" fill="#A69C8D" font-family="sans-serif">No data yet</text>`;
    return;
  }
  const cx=120, cy=120, r=90;
  let startAngle = -90;
  const ns = 'http://www.w3.org/2000/svg';
  rows.forEach((row, i) => {
    const [cat, amt] = row;
    const frac = amt/total;
    const endAngle = startAngle + frac*360;
    const path = describeArc(cx, cy, r, startAngle, endAngle);
    const el = document.createElementNS(ns, 'path');
    el.setAttribute('d', path);
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', PALETTE[i % PALETTE.length]);
    el.setAttribute('stroke-width', 34);
    el.setAttribute('stroke-linecap', i>0 && rows.length>1 ? 'butt' : 'butt');
    svg.appendChild(el);
    startAngle = endAngle;

    const legendItem = document.createElement('div');
    legendItem.className = 'legend-item';
    legendItem.innerHTML = `<span class="legend-swatch" style="background:${PALETTE[i % PALETTE.length]}"></span>${escapeHtml(cat)} · ${(frac*100).toFixed(0)}%`;
    legend.appendChild(legendItem);
  });
}

function polarToCartesian(cx, cy, r, angleDeg){
  const a = angleDeg * Math.PI/180;
  return { x: cx + r*Math.cos(a), y: cy + r*Math.sin(a) };
}
function describeArc(cx, cy, r, startAngle, endAngle){
  if(endAngle - startAngle >= 359.999){ endAngle = startAngle + 359.999; }
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = (endAngle-startAngle) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function renderBarList(rows, total, elId){
  const el = document.getElementById(elId);
  if(rows.length === 0){ el.innerHTML = '<div class="no-data">Nothing to show for this period.</div>'; return; }
  el.innerHTML = rows.map((row,i)=>{
    const [cat, amt] = row;
    const pct = total>0 ? (amt/total*100) : 0;
    return `
      <div class="bar-row">
        <div class="bar-row-top"><span class="bar-row-cat">${escapeHtml(cat)}</span><span class="bar-row-amount">${currency}${amt.toFixed(2)}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%; background:${PALETTE[i%PALETTE.length]}"></div></div>
      </div>
    `;
  }).join('');
}

/* ===================== Admin ===================== */
async function renderAdmin(){
  if(session.role !== 'admin') return;
  const items = expenses.slice();
  const total = items.reduce((s,e)=>s+e.amount,0);
  document.getElementById('admin-total').textContent = currency + ' ' + total.toFixed(2);
  document.getElementById('admin-count').textContent = items.length + ' entries · both accounts';

  const byUser = {};
  items.forEach(e => { byUser[e.username] = (byUser[e.username]||0) + e.amount; });
  const rows = Object.entries(byUser).sort((a,b)=>b[1]-a[1]);
  renderBarList(rows, total, 'admin-by-user');

  renderAdminHistory();
  await loadAdminUsers();
}

function renderAdminHistory(){
  const filterUser = document.getElementById('admin-filter-user').value;
  let items = expenses.slice().sort((a,b)=> (b.date+String(b.createdAt||'')).localeCompare(a.date+String(a.createdAt||'')));
  if(filterUser) items = items.filter(e => e.username === filterUser);
  const list = document.getElementById('admin-history-list');
  if(items.length === 0){ list.innerHTML = '<div class="no-data">No entries.</div>'; return; }
  list.innerHTML = items.map(e => `
    <div class="history-row" data-id="${e.id}">
      <div class="stamp">${escapeHtml(initials(e.category))}</div>
      <div class="history-row-body">
        <div class="history-row-cat">${escapeHtml(e.category)}</div>
        <div class="history-row-desc">${escapeHtml(e.description || '—')}</div>
        <div class="history-row-user">${escapeHtml(e.username)} · ${formatDate(e.date)}</div>
      </div>
      <div class="history-row-amount">${currency}${e.amount.toFixed(2)}</div>
      <button class="history-row-del" data-del="${e.id}" aria-label="Delete">✕</button>
    </div>
  `).join('');
  bindDeleteButtons(list);
}
document.getElementById('admin-filter-user').addEventListener('change', renderAdminHistory);

async function loadAdminUsers(){
  const el = document.getElementById('admin-users-list');
  try{
    const res = await api('getUsers', {});
    if(!res.ok){ el.innerHTML = `<div class="no-data">${escapeHtml(res.error||'Could not load accounts')}</div>`; return; }
    const filterSel = document.getElementById('admin-filter-user');
    filterSel.innerHTML = '<option value="">Both accounts</option>' + res.users.map(u=>`<option value="${escapeHtml(u.username)}">${escapeHtml(u.displayName)}</option>`).join('');

    el.innerHTML = res.users.map(u => `
      <div class="admin-user-card" data-username="${escapeHtml(u.username)}">
        <div class="admin-user-top">
          <span class="admin-user-name">${escapeHtml(u.displayName)}</span>
          <span class="admin-user-role">${escapeHtml(u.role)}</span>
        </div>
        <input type="text" class="admin-name-input" value="${escapeHtml(u.displayName)}" placeholder="Display name">
        <input type="password" class="admin-pass-input" placeholder="Set new password (leave blank to keep)">
        <button class="btn-secondary admin-save-btn">Save changes</button>
      </div>
    `).join('');

    el.querySelectorAll('.admin-user-card').forEach(card=>{
      card.querySelector('.admin-save-btn').addEventListener('click', async ()=>{
        const targetUsername = card.dataset.username;
        const newDisplayName = card.querySelector('.admin-name-input').value.trim();
        const newPassword = card.querySelector('.admin-pass-input').value;
        try{
          const res2 = await api('updateUser', { targetUsername, newDisplayName, newPassword });
          if(res2.ok){
            toast('Account updated');
            card.querySelector('.admin-pass-input').value = '';
            if(targetUsername === session.username && newDisplayName){
              session.displayName = newDisplayName;
              storage.set(K_SESSION, JSON.stringify(session));
              document.getElementById('greeting').textContent = 'Welcome, ' + session.displayName;
            }
            if(targetUsername === session.username && newPassword){
              session.password = newPassword;
              storage.set(K_SESSION, JSON.stringify(session));
            }
          } else toast(res2.error || 'Could not update');
        }catch(e){ toast('Offline — try again once connected'); }
      });
    });
  }catch(e){
    el.innerHTML = '<div class="no-data">Offline — accounts unavailable right now.</div>';
  }
}

/* ===================== Init ===================== */
try{
  boot();
}catch(e){
  showFatalError(e.message || String(e));
}

if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('service-worker.js').catch(()=>{});
  });
}
