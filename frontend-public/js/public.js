/**
 * UMP Eventos — Script da Página Principal (Home)
 * Implementação moderna de UI/UX, Carrossel, Skeleton Shimmer e Integração API
 */

// Helper: Remove tags HTML e sanitiza textos para prévia
function stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('DIV');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || '').trim();
}

// Helper: Verifica se a URL é de vídeo
function isVideoUrl(url) {
  if (!url) return false;
  const cleanUrl = url.split('?')[0].toLowerCase();
  return cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.webm') || cleanUrl.endsWith('.mov') || cleanUrl.endsWith('.avi');
}

// Biblioteca de Ícones SVG (estilo Lucide - Crisp & Modern)
const Icons = {
  calendar: `<svg class="meta-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
  mapPin: `<svg class="meta-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`,
  users: `<svg class="meta-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
  arrowRight: `<svg class="btn-arrow-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
  info: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
  alertTriangle: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  refresh: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`
};

// Renderiza Skeleton Loading com efeito shimmer
function renderSkeletonLoading(container) {
  if (!container) return;
  const skeletonCard = `
    <div class="skeleton-card" aria-hidden="true">
      <div class="skeleton-media shimmer"></div>
      <div class="skeleton-body">
        <div class="skeleton-badge shimmer"></div>
        <div class="skeleton-title shimmer"></div>
        <div style="display: flex; flex-direction: column; gap: 8px; margin: 4px 0 12px;">
          <div class="skeleton-desc-line shimmer"></div>
          <div class="skeleton-desc-line shimmer"></div>
          <div class="skeleton-desc-line shimmer"></div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
          <div class="skeleton-meta-line shimmer"></div>
          <div class="skeleton-meta-line shimmer"></div>
          <div class="skeleton-meta-line shimmer"></div>
        </div>
        <div class="skeleton-footer">
          <div class="skeleton-price shimmer"></div>
          <div class="skeleton-btn shimmer"></div>
        </div>
      </div>
    </div>
  `;
  container.innerHTML = skeletonCard.repeat(3);
}

// Cria o HTML de um Event Card individual
function createEventCard(ev, index = 0) {
  // Datas formatadas
  const dataIniObj = new Date(ev.data_inicio);
  const dataFimObj = new Date(ev.data_fim);
  const dataInicio = dataIniObj.toLocaleDateString('pt-BR');
  const dataFim = dataFimObj.toLocaleDateString('pt-BR');
  const dataFormatada = (dataInicio === dataFim) ? dataInicio : `${dataInicio} à ${dataFim}`;

  // Preço formatado
  const numValor = parseFloat(ev.valor || 0);
  const valorFmt = numValor === 0 ? 'GRATUITO' : numValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Status dinâmico
  const isSoldOut = ev.max_participantes && ev.vagas_restantes !== null && ev.vagas_restantes <= 0;
  const isAtivo = ev.ativo !== false;

  let badgeHTML = '';
  if (!isAtivo) {
    badgeHTML = `<span class="badge-status badge-status-ended">ENCERRADO</span>`;
  } else if (isSoldOut) {
    badgeHTML = `<span class="badge-status badge-status-closed">VAGAS ESGOTADAS</span>`;
  } else {
    badgeHTML = `<span class="badge-status badge-status-open">INSCRIÇÕES ABERTAS</span>`;
  }

  // Vagas
  let vagasTexto = 'Ilimitadas';
  if (ev.max_participantes) {
    if (ev.vagas_restantes !== null) {
      vagasTexto = `${ev.vagas_restantes} restantes`;
    } else {
      vagasTexto = `${ev.max_participantes} vagas`;
    }
  }

  // Descrição limpa
  const descLimpa = stripHtml(ev.descricao) || 'Participe deste momento especial da juventude UMP PB.';

  // Mídia do Card
  const fotosList = ev.fotos ? ev.fotos.split(',').map(f => f.trim()).filter(Boolean) : [];
  const bannerUrl = fotosList.find(url => !isVideoUrl(url)) || fotosList[0];
  
  let mediaHTML = '';
  if (bannerUrl) {
    if (isVideoUrl(bannerUrl)) {
      mediaHTML = `
        <div class="event-card-media">
          <video class="event-card-video" src="${bannerUrl}" autoplay muted loop playsinline></video>
        </div>
      `;
    } else {
      mediaHTML = `
        <div class="event-card-media">
          <img class="event-card-img" src="${bannerUrl}" alt="${ev.titulo}" loading="lazy" onerror="this.src='img/banner.png';">
        </div>
      `;
    }
  } else {
    mediaHTML = `
      <div class="event-card-media">
        <img class="event-card-img" src="img/banner.png" alt="${ev.titulo}" loading="lazy">
      </div>
    `;
  }

  // Staggered delay para animação de scroll
  const delayMs = (index % 3) * 80;

  return `
    <article class="event-card reveal-item" style="transition-delay: ${delayMs}ms;" data-id="${ev.id}">
      ${mediaHTML}
      <div class="event-card-body">
        <div class="event-card-badge-wrap">
          ${badgeHTML}
        </div>
        <h3 class="event-card-title">${ev.titulo}</h3>
        <p class="event-card-desc" title="${descLimpa}">${descLimpa}</p>

        <div class="event-card-meta">
          <div class="meta-item">
            ${Icons.calendar}
            <span class="meta-item-text">${dataFormatada}</span>
          </div>
          <div class="meta-item">
            ${Icons.mapPin}
            <span class="meta-item-text">${ev.local || 'A definir'}</span>
          </div>
          <div class="meta-item">
            ${Icons.users}
            <span class="meta-item-text">Vagas: ${vagasTexto}</span>
          </div>
        </div>

        <div class="event-card-footer">
          <div class="event-card-price">${valorFmt}</div>
          <a href="evento.html?id=${ev.id}" class="btn-card-action" aria-label="Ver detalhes de ${ev.titulo}">
            <span>Ver Evento</span>
            ${Icons.arrowRight}
          </a>
        </div>
      </div>
    </article>
  `;
}

// Controlador do Carrossel de Eventos
class EventsCarouselController {
  constructor(container, prevBtn, nextBtn, dotsContainer, items) {
    this.container = container;
    this.prevBtn = prevBtn;
    this.nextBtn = nextBtn;
    this.dotsContainer = dotsContainer;
    this.items = items;
    this.currentIndex = 0;
    this.autoplayTimer = null;
    this.touchStartX = 0;
    this.touchStartY = 0;

    this.init();
  }

  getCardsPerView() {
    const width = window.innerWidth;
    if (width >= 1200) return 3;
    if (width >= 768) return 2;
    return 1;
  }

  getMaxIndex() {
    const perView = this.getCardsPerView();
    return Math.max(0, this.items.length - perView);
  }

  init() {
    this.updateControlsVisibility();
    this.renderDots();
    this.updatePosition();
    this.bindEvents();
    this.startAutoplay();
  }

  updateControlsVisibility() {
    const perView = this.getCardsPerView();
    const shouldShowControls = this.items.length > perView;

    if (this.prevBtn) {
      this.prevBtn.style.display = shouldShowControls ? 'flex' : 'none';
    }
    if (this.nextBtn) {
      this.nextBtn.style.display = shouldShowControls ? 'flex' : 'none';
    }
    if (this.dotsContainer) {
      this.dotsContainer.style.display = shouldShowControls ? 'flex' : 'none';
    }
  }

  renderDots() {
    if (!this.dotsContainer) return;
    const maxIndex = this.getMaxIndex();
    const totalDots = maxIndex + 1;

    if (totalDots <= 1) {
      this.dotsContainer.innerHTML = '';
      return;
    }

    let dotsHtml = '';
    for (let i = 0; i < totalDots; i++) {
      dotsHtml += `
        <button class="carousel-dot ${i === this.currentIndex ? 'active' : ''}" 
                data-index="${i}" 
                aria-label="Ir para slide ${i + 1}" 
                role="tab" 
                aria-selected="${i === this.currentIndex ? 'true' : 'false'}">
        </button>
      `;
    }
    this.dotsContainer.innerHTML = dotsHtml;

    // Eventos de clique nos pontos
    const dots = this.dotsContainer.querySelectorAll('.carousel-dot');
    dots.forEach(dot => {
      dot.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
        this.goToIndex(idx);
        this.resetAutoplay();
      });
    });
  }

  updatePosition() {
    const cards = this.container.querySelectorAll('.event-card');
    if (!cards || cards.length === 0) return;

    const firstCard = cards[0];
    const cardWidth = firstCard.getBoundingClientRect().width;
    const gap = 24; // Espaçamento definido no CSS

    const offset = this.currentIndex * (cardWidth + gap);
    this.container.style.transform = `translateX(-${offset}px)`;

    // Atualiza estado dos botões
    if (this.prevBtn) {
      this.prevBtn.disabled = this.currentIndex === 0;
    }
    if (this.nextBtn) {
      this.nextBtn.disabled = this.currentIndex >= this.getMaxIndex();
    }

    // Atualiza pontos
    if (this.dotsContainer) {
      const dots = this.dotsContainer.querySelectorAll('.carousel-dot');
      dots.forEach((dot, idx) => {
        const isActive = idx === this.currentIndex;
        dot.classList.toggle('active', isActive);
        dot.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
    }
  }

  goToIndex(index) {
    const maxIndex = this.getMaxIndex();
    this.currentIndex = Math.max(0, Math.min(index, maxIndex));
    this.updatePosition();
  }

  next() {
    const maxIndex = this.getMaxIndex();
    if (this.currentIndex < maxIndex) {
      this.goToIndex(this.currentIndex + 1);
    } else {
      this.goToIndex(0); // Volta ao início suavemente
    }
  }

  prev() {
    if (this.currentIndex > 0) {
      this.goToIndex(this.currentIndex - 1);
    } else {
      this.goToIndex(this.getMaxIndex());
    }
  }

  startAutoplay() {
    this.stopAutoplay();
    const perView = this.getCardsPerView();
    if (this.items.length <= perView) return;

    this.autoplayTimer = setInterval(() => {
      this.next();
    }, 7000);
  }

  stopAutoplay() {
    if (this.autoplayTimer) {
      clearInterval(this.autoplayTimer);
      this.autoplayTimer = null;
    }
  }

  resetAutoplay() {
    this.stopAutoplay();
    this.startAutoplay();
  }

  bindEvents() {
    if (this.prevBtn) {
      this.prevBtn.addEventListener('click', () => {
        this.prev();
        this.resetAutoplay();
      });
    }

    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', () => {
        this.next();
        this.resetAutoplay();
      });
    }

    // Pausar autoplay ao passar o mouse
    const viewport = document.getElementById('carousel-viewport');
    if (viewport) {
      viewport.addEventListener('mouseenter', () => this.stopAutoplay());
      viewport.addEventListener('mouseleave', () => this.startAutoplay());

      // Suporte a Touch / Swipe em dispositivos móveis
      viewport.addEventListener('touchstart', (e) => {
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
        this.stopAutoplay();
      }, { passive: true });

      viewport.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const diffX = this.touchStartX - touchEndX;
        const diffY = this.touchStartY - touchEndY;

        // Se o swipe for predominantemente horizontal e superior a 40px
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
          if (diffX > 0) {
            this.next();
          } else {
            this.prev();
          }
        }
        this.startAutoplay();
      }, { passive: true });
    }

    // Navegação por teclado (Setas Esquerda / Direita)
    window.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
      if (isInput) return;

      if (e.key === 'ArrowRight') {
        this.next();
        this.resetAutoplay();
      } else if (e.key === 'ArrowLeft') {
        this.prev();
        this.resetAutoplay();
      }
    });

    // Resize responsivo com debounce
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        this.updateControlsVisibility();
        this.renderDots();
        this.goToIndex(Math.min(this.currentIndex, this.getMaxIndex()));
      }, 150);
    });
  }
}

// Configuração do Menu Mobile
function setupMobileMenu() {
  const toggleBtn = document.getElementById('mobile-menu-toggle');
  const drawer = document.getElementById('mobile-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  const closeBtn = document.getElementById('drawer-close-btn');
  const drawerLinks = document.querySelectorAll('.drawer-link, #drawer-btn-events');

  if (!toggleBtn || !drawer || !backdrop) return;

  function openMenu() {
    drawer.classList.add('active');
    backdrop.classList.add('active');
    document.body.classList.add('menu-open');
    toggleBtn.setAttribute('aria-expanded', 'true');
    drawer.setAttribute('aria-hidden', 'false');
  }

  function closeMenu() {
    drawer.classList.remove('active');
    backdrop.classList.remove('active');
    document.body.classList.remove('menu-open');
    toggleBtn.setAttribute('aria-expanded', 'false');
    drawer.setAttribute('aria-hidden', 'true');
  }

  toggleBtn.addEventListener('click', openMenu);
  if (closeBtn) closeBtn.addEventListener('click', closeMenu);
  backdrop.addEventListener('click', closeMenu);

  drawerLinks.forEach(link => {
    link.addEventListener('click', closeMenu);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('active')) {
      closeMenu();
    }
  });
}

// Ativação do Scroll Reveal com IntersectionObserver
function setupScrollReveal() {
  if (!('IntersectionObserver' in window)) {
    // Fallback para navegadores antigos
    document.querySelectorAll('.reveal-item').forEach(el => el.classList.add('revealed'));
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        obs.unobserve(entry.target);
      }
    });
  }, {
    rootMargin: '0px 0px -40px 0px',
    threshold: 0.1
  });

  document.querySelectorAll('.reveal-item').forEach(el => {
    observer.observe(el);
  });
}

// Função principal de carregamento de eventos
async function carregarEventos() {
  const eventsContainer = document.getElementById('events-container');
  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');
  const dotsContainer = document.getElementById('carousel-dots');

  if (!eventsContainer) return;

  // 1. Exibe estado de carregamento Skeleton
  renderSkeletonLoading(eventsContainer);
  if (prevBtn) prevBtn.style.display = 'none';
  if (nextBtn) nextBtn.style.display = 'none';
  if (dotsContainer) dotsContainer.style.display = 'none';

  try {
    const eventos = await API.request('/eventos/publico');

    // 2. Estado Vazio
    if (!eventos || eventos.length === 0) {
      eventsContainer.style.transform = 'none';
      eventsContainer.innerHTML = `
        <div class="state-container">
          <div class="state-icon-wrap state-icon-info">
            ${Icons.info}
          </div>
          <h3 class="state-title">Nenhum evento disponível no momento</h3>
          <p class="state-desc">Fique atento para as próximas novidades e novos eventos cadastrados pela Sinodal UMP PB!</p>
        </div>
      `;
      return;
    }

    // 3. Renderiza os Cards dos Eventos Reais
    eventsContainer.innerHTML = eventos.map((ev, index) => createEventCard(ev, index)).join('');

    // 4. Inicializa o Carrossel
    new EventsCarouselController(eventsContainer, prevBtn, nextBtn, dotsContainer, eventos);

    // 5. Configura animação de scroll reveal
    setupScrollReveal();

  } catch (error) {
    console.error('Erro ao buscar eventos públicos:', error);
    eventsContainer.style.transform = 'none';
    eventsContainer.innerHTML = `
      <div class="state-container">
        <div class="state-icon-wrap state-icon-error">
          ${Icons.alertTriangle}
        </div>
        <h3 class="state-title">Não foi possível carregar os eventos</h3>
        <p class="state-desc">Verifique sua conexão ou tente novamente mais tarde.</p>
        <button class="btn-retry" id="btn-retry-events" aria-label="Tentar carregar eventos novamente">
          ${Icons.refresh}
          <span>Tentar novamente</span>
        </button>
      </div>
    `;

    const retryBtn = document.getElementById('btn-retry-events');
    if (retryBtn) {
      retryBtn.addEventListener('click', carregarEventos);
    }
  }
}

// Inicialização após o DOM estar pronto
document.addEventListener('DOMContentLoaded', () => {
  setupMobileMenu();
  carregarEventos();
});
