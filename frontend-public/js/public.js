document.addEventListener('DOMContentLoaded', async () => {
  const eventsContainer = document.getElementById('events-container');
  if (!eventsContainer) return;

  try {
    const eventos = await API.request('/eventos/publico');

    if (!eventos || eventos.length === 0) {
      eventsContainer.innerHTML = `
        <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
          <h3 class="card-title">Nenhum evento com inscrições abertas no momento.</h3>
          <p class="card-desc">Fique atento para as próximas novidades e novos eventos cadastrados!</p>
        </div>
      `;
      return;
    }

    eventsContainer.innerHTML = eventos.map(ev => {
      const dataInicio = new Date(ev.data_inicio).toLocaleDateString('pt-BR');
      const dataFim = new Date(ev.data_fim).toLocaleDateString('pt-BR');
      const valorFmt = parseFloat(ev.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      
      const isSoldOut = ev.max_participantes && ev.vagas_restantes === 0;
      const badgeHTML = isSoldOut ? 
        `<div class="badge badge-danger" style="margin-bottom: 1rem;">Vagas Esgotadas</div>` : 
        `<div class="badge badge-success" style="margin-bottom: 1rem;">Inscrições Abertas</div>`;

      const buttonHTML = `<a href="evento.html?id=${ev.id}" class="btn btn-primary" style="width: 100%; text-align: center;">Garantir Minha Vaga</a>`;

      const fotosList = ev.fotos ? ev.fotos.split(',').filter(f => f.trim() !== '') : [];
      const imageHTML = fotosList.length > 0 ? 
        `<img src="${fotosList[0]}" alt="${ev.titulo}" style="width: calc(100% + 3rem); height: 180px; object-fit: cover; border-radius: var(--radius-md) var(--radius-md) 0 0; margin: -1.5rem -1.5rem 1rem -1.5rem; display: block;" />` : 
        '';

      return `
        <div class="card" style="display: flex; flex-direction: column;">
          ${imageHTML}
          <div style="flex-grow: 1;">
            ${badgeHTML}
            <h3 class="card-title">${ev.titulo}</h3>
            <p class="card-desc">${ev.descricao || 'Sem descrição cadastrada.'}</p>
            
            <div style="margin-bottom: 1.5rem; font-size: 0.9rem; color: var(--text-muted);">
              <div><strong>📅 Data:</strong> ${dataInicio} até ${dataFim}</div>
              <div><strong>📍 Local:</strong> ${ev.local || 'A definir'}</div>
              <div><strong>👥 Vagas:</strong> ${ev.max_participantes ? `${ev.vagas_restantes !== null ? ev.vagas_restantes : ev.max_participantes} restantes` : 'Ilimitadas'}</div>
            </div>
          </div>

          <div class="price-tag">${valorFmt}</div>

          ${buttonHTML}
        </div>
      `;
    }).join('');

  } catch (error) {
    eventsContainer.innerHTML = `
      <div class="card" style="grid-column: 1 / -1; text-align: center; color: #DC2626;">
        Erro ao carregar lista de eventos públicos.
      </div>
    `;
  }
});
