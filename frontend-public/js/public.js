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

      return `
        <div class="card">
          <div class="badge badge-success" style="margin-bottom: 1rem;">Inscrições Abertas</div>
          <h3 class="card-title">${ev.titulo}</h3>
          <p class="card-desc">${ev.descricao || 'Sem descrição cadastrada.'}</p>
          
          <div style="margin-bottom: 1.5rem; font-size: 0.9rem; color: var(--text-muted);">
            <div><strong>📅 Data:</strong> ${dataInicio} até ${dataFim}</div>
            <div><strong>📍 Local:</strong> ${ev.local || 'A definir'}</div>
            <div><strong>💳 Parcelamento:</strong> Até ${ev.max_parcelas}x no PIX / Boleto</div>
          </div>

          <div class="price-tag">${valorFmt}</div>

          <a href="inscricao.html?evento_id=${ev.id}" class="btn btn-primary" style="width: 100%;">
            Garantir Minha Vaga
          </a>
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
