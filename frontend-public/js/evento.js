function isVideoUrl(url) {
  if (!url) return false;
  const cleanUrl = url.split('?')[0].toLowerCase();
  return cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.webm') || cleanUrl.endsWith('.mov') || cleanUrl.endsWith('.avi');
}

function showMainMedia(url) {
  const mainImg = document.getElementById('event-main-img');
  const mainVideo = document.getElementById('event-main-video');
  if (!mainImg || !mainVideo) return;

  if (isVideoUrl(url)) {
    mainImg.style.display = 'none';
    mainVideo.style.display = 'block';
    mainVideo.src = url;
  } else {
    mainVideo.style.display = 'none';
    mainVideo.pause();
    mainImg.style.display = 'block';
    mainImg.src = url;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Atualizar menu caso o participante já esteja logado
  try {
    const user = API.getUser();
    if (user && API.getToken()) {
      const firstName = user.nome ? user.nome.split(' ')[0] : 'Minha Área';
      const navUser = document.getElementById('nav-user-area');
      const drawerUser = document.getElementById('drawer-user-area');
      if (navUser) {
        navUser.innerHTML = `👤 Olá, ${firstName}`;
        navUser.href = '/usuario/dashboard.html';
      }
      if (drawerUser) {
        drawerUser.innerHTML = `👤 Olá, ${firstName}`;
        drawerUser.href = '/usuario/dashboard.html';
      }
    }
  } catch (e) {}

  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get('id');

  const loadingContainer = document.getElementById('loading-container');
  const detailContent = document.getElementById('event-detail-content');

  if (!id) {
    showToast('Nenhum evento selecionado.', 'error');
    setTimeout(() => window.location.href = 'index.html', 2000);
    return;
  }

  try {
    const ev = await API.request(`/eventos/publico/${id}`);
    
    // Ocultar loading e exibir conteúdo
    if (loadingContainer) loadingContainer.style.display = 'none';
    if (detailContent) detailContent.style.display = 'grid';

    // 1. Título e Descrição
    document.getElementById('event-title').textContent = ev.titulo;
    document.getElementById('event-description').innerHTML = ev.descricao || 'Sem descrição detalhada disponível.';

    // 2. Preço
    const valor = parseFloat(ev.valor);
    document.getElementById('event-price').textContent = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // 3. Metadados
    const dataInicio = new Date(ev.data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const dataFim = new Date(ev.data_fim).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    document.getElementById('event-date').textContent = `${dataInicio} até ${dataFim}`;
    document.getElementById('event-location').textContent = ev.local || 'A definir';

    const isSoldOut = ev.max_participantes && ev.vagas_restantes === 0;
    document.getElementById('event-vacancies').textContent = ev.max_participantes 
      ? `${ev.vagas_restantes !== null ? ev.vagas_restantes : ev.max_participantes} vagas restantes (limite: ${ev.max_participantes})`
      : 'Vagas ilimitadas';

    // 4. Badges e CTA
    const badgeContainer = document.getElementById('event-badge-container');
    const ctaContainer = document.getElementById('event-cta-container');
    const diariaCtaContainer = document.getElementById('event-diaria-cta-container');

    if (isSoldOut) {
      if (badgeContainer) {
        badgeContainer.innerHTML = `<span class="badge badge-danger" style="font-size: 0.9rem; padding: 0.5rem 1rem;">Vagas Esgotadas</span>`;
      }
      if (ctaContainer) {
        ctaContainer.innerHTML = `
          <button class="btn btn-outline" style="width: 100%; border-color: #EF4444; color: #EF4444; cursor: not-allowed; font-size: 1.1rem; padding: 0.9rem;" disabled>
            Vagas Integrais Esgotadas
          </button>
        `;
      }
    } else {
      if (badgeContainer) {
        badgeContainer.innerHTML = `<span class="badge badge-success" style="font-size: 0.9rem; padding: 0.5rem 1rem;">Inscrições Abertas</span>`;
      }
      if (ctaContainer) {
        ctaContainer.innerHTML = `
          <a href="inscricao.html?evento_id=${ev.id}" class="btn btn-primary" style="width: 100%; text-align: center; display: block; font-size: 1.1rem; padding: 0.9rem;">
            Garantir Minha Vaga &rarr;
          </a>
        `;
      }
    }

    // Diárias CTA
    if (ev.diarias_habilitadas && diariaCtaContainer) {
      let valorDiariaMin = null;
      try {
        const cfg = typeof ev.config_diarias === 'string' ? JSON.parse(ev.config_diarias) : ev.config_diarias;
        if (cfg) {
          if (cfg.valor_padrao) valorDiariaMin = parseFloat(cfg.valor_padrao);
          if (cfg.dias && Array.isArray(cfg.dias)) {
            cfg.dias.forEach(d => {
              if (d.disponivel !== false && d.valor) {
                const v = parseFloat(d.valor);
                if (valorDiariaMin === null || v < valorDiariaMin) valorDiariaMin = v;
              }
            });
          }
        }
      } catch (e) {}

      diariaCtaContainer.style.display = 'block';
      diariaCtaContainer.innerHTML = `
        <div style="background: #FAF5FF; border: 1.5px solid #C084FC; border-radius: var(--radius-md); padding: 1.25rem; text-align: center;">
          <div style="display: flex; align-items: center; justify-content: center; gap: 0.4rem; color: #7E22CE; font-weight: 700; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.35rem;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
            <span>Participação por Diária</span>
          </div>
          <p style="font-size: 0.88rem; color: #6B21A8; margin-bottom: 0.75rem; line-height: 1.4;">
            Não vai participar de todos os dias? Adquira diárias avulsas para os dias que preferir.
            ${valorDiariaMin ? `<br><strong style="font-size: 0.95rem;">A partir de ${valorDiariaMin.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/dia</strong>` : ''}
          </p>
          <a href="diaria.html?evento_id=${ev.id}" class="btn" style="width: 100%; display: block; text-align: center; background: #7E22CE; color: #FFFFFF; font-weight: 700; padding: 0.85rem 1rem; border-radius: var(--radius-md); text-decoration: none; box-shadow: 0 2px 4px rgba(126, 34, 206, 0.25);">
            Comprar Diária &rarr;
          </a>
        </div>
      `;
    }

    // 5. Galeria de Imagens
    const mainImg = document.getElementById('event-main-img');
    const thumbnailsContainer = document.getElementById('event-thumbnails');
    
    const fotosList = ev.fotos ? ev.fotos.split(',').filter(f => f.trim() !== '') : [];

    if (fotosList.length > 0) {
      showMainMedia(fotosList[0]);
      
      if (fotosList.length > 1) {
        if (thumbnailsContainer) {
          thumbnailsContainer.style.display = 'grid';
          thumbnailsContainer.innerHTML = fotosList.map((url, index) => {
            if (isVideoUrl(url)) {
              return `
                <div class="thumbnail video-thumb ${index === 0 ? 'active' : ''}" onclick="selectThumbnail(this, '${url}')" style="position: relative; display: flex; align-items: center; justify-content: center; background: #000; overflow: hidden; height: 60px; border-radius: 4px; cursor: pointer;">
                  <video src="${url}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.7;"></video>
                  <span style="position: absolute; color: white; font-size: 1.2rem; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));">▶️</span>
                </div>
              `;
            } else {
              return `
                <img src="${url}" alt="Foto ${index + 1}" class="thumbnail ${index === 0 ? 'active' : ''}" onclick="selectThumbnail(this, '${url}')">
              `;
            }
          }).join('');
        }
      }
    } else {
      // Imagem padrão caso o evento não possua fotos
      mainImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400"><rect width="800" height="400" fill="%23f1f5f9"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="24" fill="%2394a3b8">Sem Imagem</text></svg>';
    }

  } catch (err) {
    showToast('Erro ao carregar detalhes do evento.', 'error');
    setTimeout(() => window.location.href = 'index.html', 3000);
  }
});

window.selectThumbnail = function(elem, url) {
  showMainMedia(url);

  // Toggle active class on siblings
  document.querySelectorAll('.thumbnail').forEach(t => t.classList.remove('active'));
  elem.classList.add('active');
}
