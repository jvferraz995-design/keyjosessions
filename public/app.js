const GENRES = ["Ação","Aventura","Comédia","Drama","Terror","Ficção científica","Fantasia","Romance","Suspense","Animação","Documentário","Crime","Guerra","Musical","Família","Mistério"];
const REFRESH_MS = 30000;
const UNDO_MS = 5000;

let movies = [];
let currentFilter = "all";
let searchTerm = "";
let sortBy = "recent";
let loaded = false;
let pendingMeta = null;
let titleWasAutofilled = false;
let lastDrawnId = null;
let fetchSeq = 0;
const pendingDeletes = new Map(); // id -> { movie, timer }

const $ = (id) => document.getElementById(id);
const grid = $('movieGrid');
const genreChipsEl = $('genreChips');
const genreFilterEl = $('genreFilter');
const statusNote = $('statusNote');
const linkInputEl = $('linkInput');
const titleInputEl = $('titleInput');
const fetchInfoBtn = $('fetchInfoBtn');
const fetchPreviewEl = $('fetchPreview');
const addBtn = $('addBtn');
const drawBtn = $('drawBtn');
const drawResult = $('drawResult');
const drawEmpty = $('drawEmpty');
const authDialog = $('authDialog');
const authForm = $('authForm');
const authEmailEl = $('authEmail');
const authPasswordEl = $('authPassword');
const authErrorEl = $('authError');
const authSubmitBtn = $('authSubmit');
const sessionUserEl = $('sessionUser');
const sessionBtn = $('sessionBtn');

// ---------- auth (Netlify Identity) ----------
// Ver a lista é livre; qualquer alteração exige login. A sessão fica salva no navegador.

const identityReady = import('https://esm.sh/@netlify/identity@2.0.0').catch(()=> null);
let currentUser = null;
let authMode = 'login'; // login | invite | recovery
let inviteToken = '';
let authWaiter = null;

const AUTH_COPY = {
  login: { eyebrow:'acesso restrito', title:'Entrar', submit:'Entrar', sub:'Só vocês dois podem mexer na lista. Entrem uma vez e o acesso fica salvo neste navegador.' },
  invite: { eyebrow:'convite aceito', title:'Criar senha', submit:'Salvar e entrar', sub:'Escolham uma senha para concluir o cadastro.' },
  recovery: { eyebrow:'recuperação', title:'Nova senha', submit:'Salvar senha', sub:'Digitem a nova senha da conta.' },
};

function renderSession(){
  sessionUserEl.hidden = !currentUser;
  sessionUserEl.textContent = currentUser ? (currentUser.name || currentUser.email) : '';
  sessionBtn.textContent = currentUser ? 'sair' : 'entrar';
}

function openAuth(mode = 'login'){
  authMode = mode;
  const copy = AUTH_COPY[mode];
  $('authEyebrow').textContent = copy.eyebrow;
  $('authTitle').textContent = copy.title;
  $('authSub').textContent = copy.sub;
  authSubmitBtn.textContent = copy.submit;
  $('authEmailField').hidden = mode !== 'login';
  $('authForgot').hidden = mode !== 'login';
  $('authCancel').hidden = mode !== 'login';
  authPasswordEl.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  authPasswordEl.value = '';
  authErrorEl.hidden = true;
  if(!authDialog.open) authDialog.showModal();
  (mode === 'login' && !authEmailEl.value ? authEmailEl : authPasswordEl).focus();
}

function showAuthError(msg){
  authErrorEl.textContent = msg;
  authErrorEl.hidden = false;
}

// Resolve true quando há alguém logado; abre o login se preciso.
async function requireAuth(){
  const id = await identityReady;
  if(!id){
    toast('O login está indisponível agora. Recarreguem a página.', { error:true });
    return false;
  }
  if(currentUser){
    await id.refreshSession().catch(()=> null);
    return true;
  }
  return new Promise(resolve => {
    authWaiter = resolve;
    openAuth('login');
  });
}

authDialog.addEventListener('close', ()=>{
  authWaiter?.(!!currentUser);
  authWaiter = null;
});

authDialog.addEventListener('cancel', (e)=>{
  if(authMode !== 'login') e.preventDefault(); // convite/recuperação precisam terminar
});

$('authCancel').addEventListener('click', ()=> authDialog.close());

authForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const id = await identityReady;
  if(!id) return showAuthError('O login está indisponível agora.');
  const email = authEmailEl.value.trim();
  const password = authPasswordEl.value;
  if(authMode === 'login' && !email) return showAuthError('Digitem o e-mail.');
  if(!password) return showAuthError('Digitem a senha.');

  authSubmitBtn.disabled = true;
  authErrorEl.hidden = true;
  try{
    if(authMode === 'login') currentUser = await id.login(email, password);
    if(authMode === 'invite') currentUser = await id.acceptInvite(inviteToken, password);
    if(authMode === 'recovery') currentUser = await id.updateUser({ password });
    renderSession();
    authDialog.close();
    toast(authMode === 'login' ? 'Acesso liberado.' : 'Senha salva. Vocês já estão logados.');
  }catch(err){
    if(err?.status === 401 || err?.status === 400) showAuthError('E-mail ou senha incorretos.');
    else if(err?.status === 422) showAuthError('Senha inválida. Usem pelo menos 6 caracteres.');
    else showAuthError(err?.message || 'Não deu pra entrar agora. Tentem de novo.');
  }finally{
    authSubmitBtn.disabled = false;
  }
});

$('authForgot').addEventListener('click', async ()=>{
  const email = authEmailEl.value.trim();
  if(!email) return showAuthError('Digitem o e-mail para receber o link de recuperação.');
  const id = await identityReady;
  try{
    await id.requestPasswordRecovery(email);
    authErrorEl.hidden = true;
    toast('Se o e-mail estiver cadastrado, chega um link de recuperação em instantes.', { duration:5000 });
  }catch(err){
    showAuthError('Não consegui enviar o e-mail agora.');
  }
});

sessionBtn.addEventListener('click', async ()=>{
  if(!currentUser) return requireAuth();
  const id = await identityReady;
  await id?.logout().catch(()=> null);
  currentUser = null;
  renderSession();
  toast('Vocês saíram. A lista continua visível, mas pra mexer precisa entrar de novo.');
});

async function initAuth(){
  const id = await identityReady;
  if(!id) return;
  try{
    const result = await id.handleAuthCallback();
    if(result?.type === 'invite'){
      inviteToken = result.token;
      openAuth('invite');
    }else if(result?.type === 'recovery'){
      currentUser = result.user;
      openAuth('recovery');
    }else if(result?.type === 'confirmation'){
      toast('E-mail confirmado.');
    }
  }catch(err){
    toast('Esse link expirou ou já foi usado.', { error:true });
  }
  currentUser = currentUser || await id.getUser();
  renderSession();
  id.onAuthChange((event, user)=>{
    currentUser = user;
    renderSession();
  });
}

// ---------- helpers ----------

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function normalizeStr(s){
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
}

function imdbIdFrom(link){
  return (link || '').match(/tt\d{5,10}/)?.[0] || '';
}

// Pôsteres do IMDb passam pelo Netlify Image CDN (redimensionados e em webp).
function posterSrc(url, width){
  if(!url) return '';
  if(/^https:\/\/m\.media-amazon\.com\//.test(url)){
    return `/.netlify/images?url=${encodeURIComponent(url)}&w=${width * 2}&fm=webp`;
  }
  return url;
}

function posterPlaceholder(m){
  return `<div class="poster-ph" aria-hidden="true">${escapeHtml((m.title || '?')[0].toUpperCase())}</div>`;
}

function posterHtml(m, cls, width){
  if(!m.poster) return posterPlaceholder(m);
  return `<img class="${cls}" src="${escapeHtml(posterSrc(m.poster, width))}" data-original="${escapeHtml(m.poster)}" data-initial="${escapeHtml((m.title || '?')[0].toUpperCase())}" alt="" loading="lazy">`;
}

// Se o CDN falhar, tenta a imagem original; se ela também falhar, mostra a inicial do título.
document.addEventListener('error', (e)=>{
  const img = e.target;
  if(!(img instanceof HTMLImageElement) || !img.dataset.initial) return;
  if(img.dataset.original && img.src !== img.dataset.original && !img.dataset.retried){
    img.dataset.retried = '1';
    img.src = img.dataset.original;
    return;
  }
  const ph = document.createElement('div');
  ph.className = 'poster-ph';
  ph.textContent = img.dataset.initial;
  img.replaceWith(ph);
}, true);

function formatDate(iso){
  if(!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' });
}

function toast(message, { error = false, action, onAction, duration = 3500 } = {}){
  const el = document.createElement('div');
  el.className = 'toast' + (error ? ' error' : '');
  el.innerHTML = `<span>${escapeHtml(message)}</span>`;
  if(action){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = action;
    btn.addEventListener('click', ()=>{ onAction?.(); el.remove(); });
    el.appendChild(btn);
  }
  $('toasts').appendChild(el);
  setTimeout(()=> el.remove(), duration);
}

async function api(path, options = {}){
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = res.status === 204 ? null : await res.json().catch(()=> null);
  if(res.status === 401 && currentUser){
    currentUser = null;
    renderSession();
  }
  if(!res.ok){
    const err = new Error(data?.error || `Erro ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ---------- setup ----------

function buildGenreChips(){
  genreChipsEl.innerHTML = GENRES.map(g =>
    `<button type="button" class="chip" data-genre="${g}" aria-pressed="false">${g}</button>`
  ).join('');
}

genreChipsEl.addEventListener('click', (e)=>{
  const chip = e.target.closest('.chip');
  if(!chip) return;
  setChip(chip, !chip.classList.contains('active'));
});

function setChip(chip, on){
  chip.classList.toggle('active', on);
  chip.setAttribute('aria-pressed', String(on));
}

function buildGenreFilter(){
  const counts = {};
  movies.filter(m => !m.watched).forEach(m => (m.genres || []).forEach(g => counts[g] = (counts[g] || 0) + 1));
  const selected = genreFilterEl.value;
  genreFilterEl.innerHTML = `<option value="">Todos os gêneros</option>` +
    GENRES.map(g => `<option value="${g}">${g}${counts[g] ? ` (${counts[g]})` : ''}</option>`).join('');
  genreFilterEl.value = selected;
}

// ---------- data ----------

async function loadMovies({ silent = false } = {}){
  if(!silent) statusNote.textContent = 'Carregando lista...';
  try{
    const rows = await api('/api/movies');
    movies = rows.filter(m => !pendingDeletes.has(m.id));
    loaded = true;
    statusNote.textContent = 'Lista compartilhada entre vocês dois — qualquer alteração aparece pra ambos.';
    render();
  }catch(e){
    if(!silent){
      statusNote.textContent = 'Não consegui carregar a lista. Tentando de novo em instantes...';
      setTimeout(()=> loadMovies(), 4000);
    }
  }
}

function replaceMovie(updated){
  const i = movies.findIndex(m => m.id === updated.id);
  if(i !== -1) movies[i] = updated;
}

async function updateMovie(id, patch){
  if(!(await requireAuth())){
    render(); // desfaz o clique (ex.: checkbox) se não entrou
    return;
  }
  const movie = movies.find(m => m.id === id);
  if(!movie) return;
  const before = { ...movie };
  Object.assign(movie, patch);
  if(patch.watched === false) movie.rating = 0;
  if(patch.watched === true) movie.watchedAt = new Date().toISOString();
  render();
  try{
    replaceMovie(await api(`/api/movies/${id}`, { method:'PATCH', body: JSON.stringify(patch) }));
    render();
  }catch(e){
    replaceMovie(before);
    render();
    toast(e.status === 401 ? 'Entrem de novo pra salvar.' : 'Não deu pra salvar agora. Tenta de novo em instantes.', { error:true });
  }
}

async function deleteMovie(id){
  if(!(await requireAuth())) return;
  const movie = movies.find(m => m.id === id);
  if(!movie) return;
  movies = movies.filter(m => m.id !== id);
  render();

  const timer = setTimeout(async ()=>{
    pendingDeletes.delete(id);
    try{
      await api(`/api/movies/${id}`, { method:'DELETE' });
    }catch(e){
      movies.push(movie);
      render();
      toast('Não consegui remover. Tenta de novo.', { error:true });
    }
  }, UNDO_MS);
  pendingDeletes.set(id, { movie, timer });

  toast(`"${movie.title}" removido.`, {
    action: 'Desfazer',
    duration: UNDO_MS,
    onAction: ()=>{
      clearTimeout(timer);
      pendingDeletes.delete(id);
      movies.push(movie);
      render();
    },
  });
}

// Garante que remoções pendentes sejam enviadas se a aba for fechada.
window.addEventListener('pagehide', ()=>{
  pendingDeletes.forEach((_, id)=> fetch(`/api/movies/${id}`, { method:'DELETE', keepalive:true }));
});

// ---------- rendering ----------

function render(){
  renderStats();
  buildGenreFilter();
  renderGrid();
}

function renderStats(){
  const watched = movies.filter(m => m.watched);
  const rated = watched.filter(m => m.rating > 0);
  const avg = rated.length ? (rated.reduce((s, m) => s + m.rating, 0) / rated.length).toFixed(1).replace('.', ',') + '★' : '–';
  const values = { total: movies.length, unwatched: movies.length - watched.length, watched: watched.length, avg };
  document.querySelectorAll('[data-stat]').forEach(el => el.textContent = loaded ? values[el.dataset.stat] : '–');
  const counts = { all: movies.length, unwatched: movies.length - watched.length, watched: watched.length };
  document.querySelectorAll('[data-count]').forEach(el => el.textContent = loaded ? counts[el.dataset.count] : '');
}

function renderGenreBadges(genres){
  if(!genres || !genres.length) return '';
  return `<div class="genres">${genres.map(g=>`<span class="badge">${escapeHtml(g)}</span>`).join('')}</div>`;
}

function metaParts(m){
  const parts = [];
  if(m.year) parts.push(m.year);
  if(m.country) parts.push(m.country);
  if(m.imdbRating) parts.push('IMDb ' + m.imdbRating);
  return parts;
}

function renderMetaLine(m, style = ''){
  const parts = metaParts(m);
  return parts.length ? `<p class="meta-line"${style ? ` style="${style}"` : ''}>${parts.map(escapeHtml).join(' · ')}</p>` : '';
}

function renderStars(movie, interactive){
  const rating = movie.rating || 0;
  let html = `<div class="stars${interactive ? '' : ' disabled'}" data-id="${movie.id}" role="group" aria-label="Nossa nota">`;
  for(let i=1;i<=5;i++){
    html += `<button type="button" data-star="${i}" class="${i<=rating?'filled':''}" aria-label="${i} estrela${i>1?'s':''}" aria-pressed="${i===rating}">★</button>`;
  }
  return html + `</div>`;
}

const SORTERS = {
  recent: (a,b)=> new Date(b.addedAt) - new Date(a.addedAt),
  title: (a,b)=> a.title.localeCompare(b.title, 'pt-BR'),
  imdb: (a,b)=> (parseFloat(b.imdbRating) || 0) - (parseFloat(a.imdbRating) || 0),
  ours: (a,b)=> (b.rating || 0) - (a.rating || 0) || SORTERS.recent(a,b),
  year: (a,b)=> (parseInt(b.year) || 0) - (parseInt(a.year) || 0),
};

function renderGrid(){
  if(!loaded){
    grid.innerHTML = '';
    return;
  }
  let list = movies;
  if(currentFilter === 'watched') list = list.filter(m=>m.watched);
  if(currentFilter === 'unwatched') list = list.filter(m=>!m.watched);
  if(searchTerm){
    const q = normalizeStr(searchTerm);
    list = list.filter(m => normalizeStr(m.title).includes(q));
  }

  if(list.length === 0){
    grid.innerHTML = `<div class="empty-state">${movies.length === 0 ? 'Nenhum filme ainda. Adicionem o primeiro acima.' : 'Nada por aqui com esse filtro.'}</div>`;
    return;
  }

  const sorted = [...list].sort(SORTERS[sortBy]);

  grid.innerHTML = sorted.map(m => `
    <article class="movie-card${m.watched ? ' is-watched' : ''}" data-id="${m.id}">
      <div class="row-top">
        ${posterHtml(m, 'poster', 56)}
        <div class="card-main">
          <h4>${escapeHtml(m.title)}</h4>
          ${renderMetaLine(m)}
          ${m.link ? `<a class="meta-link" href="${escapeHtml(m.link)}" target="_blank" rel="noopener">Ver no IMDb ↗</a>` : ''}
          ${renderGenreBadges(m.genres)}
        </div>
        <button type="button" class="delete-btn" data-action="delete" data-id="${m.id}" aria-label="Remover ${escapeHtml(m.title)}">remover</button>
      </div>
      <div class="row-actions">
        <label class="watched-toggle">
          <input type="checkbox" data-action="toggle-watched" data-id="${m.id}" ${m.watched ? 'checked' : ''}>
          <span>já assistimos ${m.watched && m.watchedAt ? `<small>· ${escapeHtml(formatDate(m.watchedAt))}</small>` : ''}</span>
        </label>
        ${renderStars(m, m.watched)}
      </div>
    </article>
  `).join('');
}

function highlightCard(id){
  const card = grid.querySelector(`[data-id="${id}"]`);
  if(!card) return;
  card.classList.add('highlight');
  setTimeout(()=> card.classList.remove('highlight'), 2000);
}

// ---------- list interactions ----------

grid.addEventListener('click', (e)=>{
  const del = e.target.closest('[data-action="delete"]');
  if(del){
    deleteMovie(del.dataset.id);
    return;
  }
  const star = e.target.closest('button[data-star]');
  if(star){
    const wrap = star.closest('.stars');
    if(wrap.classList.contains('disabled')) return;
    const movie = movies.find(m=>m.id === wrap.dataset.id);
    if(!movie) return;
    const val = parseInt(star.dataset.star, 10);
    updateMovie(movie.id, { rating: movie.rating === val ? 0 : val });
  }
});

grid.addEventListener('change', (e)=>{
  const chk = e.target.closest('[data-action="toggle-watched"]');
  if(chk) updateMovie(chk.dataset.id, { watched: chk.checked });
});

$('tabs').addEventListener('click', (e)=>{
  const tab = e.target.closest('.tab');
  if(!tab) return;
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t === tab));
  currentFilter = tab.dataset.filter;
  renderGrid();
});

$('searchInput').addEventListener('input', (e)=>{
  searchTerm = e.target.value;
  renderGrid();
});

$('sortSelect').addEventListener('change', (e)=>{
  sortBy = e.target.value;
  renderGrid();
});

// ---------- autofill via IMDb link ----------

function showPreview(html, cls = ''){
  fetchPreviewEl.className = 'fetch-preview' + (cls ? ' ' + cls : '');
  fetchPreviewEl.innerHTML = html;
  fetchPreviewEl.hidden = false;
}

function hidePreview(){
  fetchPreviewEl.hidden = true;
  fetchPreviewEl.innerHTML = '';
}

function findDuplicate(link){
  const id = imdbIdFrom(link);
  return id ? movies.find(m => m.imdbId === id || imdbIdFrom(m.link) === id) : null;
}

function warnDuplicate(dup){
  showPreview(`<div class="fp-info"><strong>Esse já está na lista</strong>"${escapeHtml(dup.title)}" ${dup.watched ? 'já foi assistido.' : 'ainda está esperando a vez.'}</div>`, 'warn');
}

linkInputEl.addEventListener('input', ()=>{
  pendingMeta = null;
  fetchSeq++;
  hidePreview();
});

linkInputEl.addEventListener('paste', ()=>{
  // Só busca sozinho quem já está logado; os outros pedem pelo botão.
  setTimeout(()=>{ if(currentUser && imdbIdFrom(linkInputEl.value)) fetchInfo(); }, 0);
});

titleInputEl.addEventListener('input', ()=>{ titleWasAutofilled = false; });

fetchInfoBtn.addEventListener('click', fetchInfo);

async function fetchInfo(){
  const link = linkInputEl.value.trim();
  if(!link){
    toast('Cole o link do IMDb antes de buscar.', { error:true });
    linkInputEl.focus();
    return;
  }
  if(!imdbIdFrom(link)){
    toast('Esse link não parece ser de um título do IMDb.', { error:true });
    return;
  }
  const dup = findDuplicate(link);
  if(dup){
    warnDuplicate(dup);
    return;
  }
  if(!(await requireAuth())) return;

  const seq = ++fetchSeq;
  fetchInfoBtn.disabled = true;
  fetchInfoBtn.textContent = 'Buscando...';
  showPreview(`<div class="skeleton"></div><div class="fp-info"><strong>Procurando no IMDb...</strong>isso leva alguns segundinhos</div>`, 'loading');

  try{
    const info = await api('/api/imdb', { method:'POST', body: JSON.stringify({ link }) });
    if(seq !== fetchSeq) return; // o link mudou enquanto buscava
    pendingMeta = info;

    if(info.title && (!titleInputEl.value.trim() || titleWasAutofilled)){
      titleInputEl.value = info.title;
      titleWasAutofilled = true;
    }

    const wanted = new Set((info.genres || []).map(normalizeStr));
    genreChipsEl.querySelectorAll('.chip').forEach(chip=>{
      if(wanted.has(normalizeStr(chip.dataset.genre))) setChip(chip, true);
    });

    renderFetchPreview(info);
  }catch(e){
    if(seq !== fetchSeq) return;
    hidePreview();
    toast('Não consegui buscar as informações agora. Dá pra preencher o título e os gêneros na mão.', { error:true, duration:5000 });
  }finally{
    if(seq === fetchSeq){
      fetchInfoBtn.disabled = false;
      fetchInfoBtn.textContent = 'Buscar info';
    }
  }
}

function renderFetchPreview(info){
  if(!info.title && !info.poster && !info.year){
    hidePreview();
    return;
  }
  showPreview(`
    ${info.poster ? `<img src="${escapeHtml(posterSrc(info.poster, 46))}" alt="" onerror="this.style.display='none'">` : ''}
    <div class="fp-info">
      <strong>${escapeHtml(info.title || 'Encontrado')}</strong>
      ${metaParts(info).map(escapeHtml).join(' · ')}
    </div>
  `);
}

function resetForm(){
  titleInputEl.value = '';
  linkInputEl.value = '';
  titleWasAutofilled = false;
  genreChipsEl.querySelectorAll('.chip.active').forEach(c=>setChip(c, false));
  pendingMeta = null;
  fetchSeq++;
  fetchInfoBtn.disabled = false;
  fetchInfoBtn.textContent = 'Buscar info';
  hidePreview();
}

$('addForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!(await requireAuth())) return;
  const title = titleInputEl.value.trim();
  const link = linkInputEl.value.trim();
  const genres = [...genreChipsEl.querySelectorAll('.chip.active')].map(c=>c.dataset.genre);

  if(!title){
    toast('Coloca o título do filme antes de adicionar.', { error:true });
    titleInputEl.focus();
    return;
  }
  const dup = findDuplicate(link);
  if(dup){
    warnDuplicate(dup);
    return;
  }

  const meta = pendingMeta || {};
  addBtn.disabled = true;
  addBtn.textContent = 'Adicionando...';
  try{
    const created = await api('/api/movies', {
      method:'POST',
      body: JSON.stringify({
        title, link, genres,
        poster: meta.poster || '',
        imdbRating: meta.imdbRating || '',
        year: meta.year || '',
        country: meta.country || '',
      }),
    });
    movies.unshift(created);
    resetForm();
    render();
    highlightCard(created.id);
    toast(`"${created.title}" entrou na lista 🎬`);
  }catch(err){
    if(err.status === 409 && err.data?.movie){
      warnDuplicate(err.data.movie);
      loadMovies({ silent:true });
    }else{
      toast(err.status === 401 ? 'Entrem de novo pra adicionar.' : 'Erro ao salvar. Tenta de novo em instantes.', { error:true });
    }
  }finally{
    addBtn.disabled = false;
    addBtn.textContent = 'Adicionar à lista';
  }
});

// ---------- draw ----------

drawBtn.addEventListener('click', draw);

function draw(){
  const genre = genreFilterEl.value;
  const pool = movies.filter(m => !m.watched && (!genre || (m.genres||[]).includes(genre)));

  drawResult.classList.remove('show');
  drawEmpty.hidden = true;

  if(pool.length === 0){
    drawResult.innerHTML = '';
    drawEmpty.textContent = movies.filter(m=>!m.watched).length === 0
      ? 'Todos os filmes da lista já foram assistidos. Hora de adicionar mais!'
      : 'Não há filmes não assistidos nesse gênero.';
    drawEmpty.hidden = false;
    return;
  }

  // Evita repetir o mesmo filme duas vezes seguidas quando há alternativas.
  const candidates = pool.length > 1 ? pool.filter(m => m.id !== lastDrawnId) : pool;
  const chosen = candidates[Math.floor(Math.random()*candidates.length)];
  lastDrawnId = chosen.id;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduceMotion || pool.length === 1){
    showTicket(chosen);
    return;
  }

  drawBtn.disabled = true;
  drawBtn.textContent = 'Sorteando...';
  drawResult.classList.add('spinning');

  // Desacelera aos poucos, como uma roleta.
  let delay = 60;
  const tick = ()=>{
    const flash = pool[Math.floor(Math.random()*pool.length)];
    drawResult.innerHTML = buildTicketHtml(flash, false);
    delay *= 1.18;
    if(delay < 420) setTimeout(tick, delay);
    else showTicket(chosen);
  };
  tick();
}

function showTicket(m){
  drawResult.classList.remove('spinning');
  drawResult.innerHTML = buildTicketHtml(m, true);
  requestAnimationFrame(()=> drawResult.classList.add('show'));
  drawBtn.disabled = false;
  drawBtn.textContent = 'Sortear ▸';
}

drawResult.addEventListener('click', async (e)=>{
  const btn = e.target.closest('[data-ticket]');
  if(!btn) return;
  if(btn.dataset.ticket === 'again') draw();
  if(btn.dataset.ticket === 'watch'){
    if(!(await requireAuth())) return; // mantém o bilhete se cancelar o login
    const id = btn.dataset.id;
    updateMovie(id, { watched: true });
    drawResult.classList.remove('show');
    drawResult.innerHTML = '';
    toast('Marcado como assistido. Depois deem a nota de vocês na lista ★');
  }
});

function buildTicketHtml(m, final){
  const ticketNo = String(movies.filter(x => !x.watched).indexOf(m) + 1).padStart(3, '0');
  return `
    <div class="stub-top">
      ${posterHtml(m, 'ticket-poster', 72)}
      <div style="flex:1;min-width:0;">
        <p class="eyebrow">Sessão de hoje</p>
        <h3>${escapeHtml(m.title)}</h3>
        ${renderMetaLine(m, 'margin-top:6px;')}
        ${renderGenreBadges(m.genres)}
      </div>
      ${m.link ? `<a class="imdb-link" href="${escapeHtml(m.link)}" target="_blank" rel="noopener">IMDb ↗</a>` : ''}
    </div>
    <div class="perf" aria-hidden="true"></div>
    <div class="stub-bottom">
      <span class="hint">SESSÃO Nº ${ticketNo} · 2 LUGARES</span>
      ${final ? `
        <div class="stub-actions">
          <button type="button" class="btn-ghost" data-ticket="again">Sortear outro</button>
          <button type="button" class="btn-primary" data-ticket="watch" data-id="${m.id}">Vamos ver esse ✓</button>
        </div>` : ''}
    </div>
  `;
}

// ---------- sync ----------

setInterval(()=>{ if(document.visibilityState === 'visible' && loaded) loadMovies({ silent:true }); }, REFRESH_MS);
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'visible' && loaded) loadMovies({ silent:true });
});

buildGenreChips();
buildGenreFilter();
renderStats();
renderSession();
loadMovies();
initAuth();
