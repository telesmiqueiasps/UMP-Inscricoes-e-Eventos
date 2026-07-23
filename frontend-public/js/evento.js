document.addEventListener('DOMContentLoaded', async () => {
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
    document.getElementById('event-description').textContent = ev.descricao || 'Sem descrição detalhada disponível.';

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

    if (isSoldOut) {
      if (badgeContainer) {
        badgeContainer.innerHTML = `<span class="badge badge-danger" style="font-size: 0.9rem; padding: 0.5rem 1rem;">Vagas Esgotadas</span>`;
      }
      if (ctaContainer) {
        ctaContainer.innerHTML = `
          <button class="btn btn-outline" style="width: 100%; border-color: #EF4444; color: #EF4444; cursor: not-allowed; font-size: 1.1rem; padding: 0.9rem;" disabled>
            Vagas Esgotadas
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

    // 5. Galeria de Imagens
    const mainImg = document.getElementById('event-main-img');
    const thumbnailsContainer = document.getElementById('event-thumbnails');
    
    const fotosList = ev.fotos ? ev.fotos.split(',').filter(f => f.trim() !== '') : [];

    if (fotosList.length > 0) {
      mainImg.src = fotosList[0];
      
      if (fotosList.length > 1) {
        if (thumbnailsContainer) {
          thumbnailsContainer.style.display = 'grid';
          thumbnailsContainer.innerHTML = fotosList.map((url, index) => `
            <img src="${url}" alt="Foto ${index + 1}" class="thumbnail ${index === 0 ? 'active' : ''}" onclick="selectThumbnail(this, '${url}')">
          `).join('');
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

function selectThumbnail(elem, url) {
  const mainImg = document.getElementById('event-main-img');
  if (mainImg) mainImg.src = url;

  // Toggle active class on siblings
  document.querySelectorAll('.thumbnail').forEach(t => t.classList.remove('active'));
  elem.classList.add('active');
}
