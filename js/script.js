// PreçoAí — Home: menu lateral, carrossel, seleção visual, lista e aviso
// (cards e categorias são criados depois pelo app.js, por isso usamos delegação de eventos)
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---- Logo: se a imagem não carregar, mostra o nome
const logoImg = $('.logo img');
if (logoImg) {
  const fallback = () => { const l = Object.assign(document.createElement('strong'), { className: 'logo-texto' }); l.innerHTML = 'Preço<span>Aí</span>'; logoImg.replaceWith(l); };
  if (logoImg.complete && logoImg.naturalWidth === 0) fallback();
  else logoImg.addEventListener('error', fallback, { once: true });
}

// ---- Menu lateral
const drawer = $('#drawer'), overlay = $('#overlay'), menuBtn = $('#menu-btn');
function toggleDrawer(open) {
  drawer.classList.toggle('open', open);
  overlay.classList.toggle('open', open);
  drawer.inert = !open;
  (open ? $('#drawer-close') : menuBtn).focus();
}
menuBtn.onclick = () => toggleDrawer(true);
$('#drawer-close').onclick = overlay.onclick = () => toggleDrawer(false);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawer.classList.contains('open')) toggleDrawer(false); });

// ---- Carrossel do banner
const track = $('#track'), dots = $$('.dot');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let timer;
const go = i => track.scrollTo({ left: i * track.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
track.addEventListener('scroll', () => {
  const i = Math.round(track.scrollLeft / track.clientWidth);
  dots.forEach((d, n) => d.classList.toggle('active', n === i));
});
dots.forEach((d, i) => d.onclick = () => { go(i); restart(); });
function restart() {
  clearInterval(timer);
  if (reduce) return;
  timer = setInterval(() => go((Math.round(track.scrollLeft / track.clientWidth) + 1) % dots.length), 5000);
}
['pointerdown', 'focusin'].forEach(ev => track.addEventListener(ev, () => clearInterval(timer)));
restart();

// ---- Seleção única (categorias e navegação inferior), por delegação
function selecaoUnica(container, seletor) {
  container.addEventListener('click', e => {
    const alvo = e.target.closest(seletor);
    if (!alvo) return;
    $$(seletor, container).forEach(o => o.classList.toggle('active', o === alvo));
  });
}
selecaoUnica($('#categorias'), '.cat');

// ---- Lista: guarda os produtos marcados (localStorage) e atualiza o contador da aba Lista
const badge = $('#badge');
const CHAVE_LISTA = 'precoai:lista';
function lerLista() { try { return new Set(JSON.parse(localStorage.getItem(CHAVE_LISTA) || '[]')); } catch { return new Set(); } }
function salvarLista() { try { localStorage.setItem(CHAVE_LISTA, JSON.stringify([...window.listaIds])); } catch { /* modo privado */ } }
window.listaIds = lerLista();               // o app.js lê isto ao desenhar os cards
badge.textContent = window.listaIds.size || '';
document.addEventListener('click', e => {
  const btn = e.target.closest('.btn-add');
  if (!btn) return;
  const id = btn.dataset.produtoId, nome = btn.dataset.nome || 'Produto';
  const on = !window.listaIds.has(id);
  on ? window.listaIds.add(id) : window.listaIds.delete(id);
  salvarLista();
  // mantém todos os botões do mesmo produto (cesta, resultados, mais buscados) iguais
  $$('.btn-add').filter(b => b.dataset.produtoId === id).forEach(b => {
    b.classList.toggle('on', on);
    b.textContent = on ? '✓' : '+';
    b.setAttribute('aria-label', (on ? 'Remover ' : 'Adicionar ') + nome + (on ? ' da lista' : ' à lista'));
  });
  badge.textContent = window.listaIds.size || '';
  toast(on ? nome + ' adicionado à lista' : nome + ' removido da lista');
});

// ---- Aviso rápido
let tt;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('show'), 1800);
}

// ---- Navegação inferior e menu lateral (telas ainda não criadas avisam "Em breve")
$('.bottom-nav').addEventListener('click', e => {
  const b = e.target.closest('.nav-item');
  if (!b) return;
  const k = b.dataset.nav;
  if (k === 'inicio') scrollTo({ top: 0, behavior: 'smooth' });
  else if (k === 'buscar') { scrollTo({ top: 0, behavior: 'smooth' }); $('#search').focus({ preventScroll: true }); }
  else if (k === 'cesta') toast(window.listaIds.size ? window.listaIds.size + ' item(ns) na cesta · tela em breve' : 'Sua cesta está vazia');
  else toast('Em breve');
});
$('#perfil-btn').addEventListener('click', () => toast('Perfil em breve'));
$('#drawer').addEventListener('click', e => {
  const a = e.target.closest('a[data-go], a[data-soon], button[data-soon]');
  if (!a) return;
  if (a.dataset.go !== undefined) { e.preventDefault(); toggleDrawer(false); document.querySelector(a.getAttribute('href')).scrollIntoView({ behavior: 'smooth' }); }
  else { e.preventDefault(); toast('Em breve'); }
});
