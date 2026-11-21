// ==========================================
// Cineflix - Concurso de Fantasias (Admin)
// ==========================================

let eventoIdSelecionado = null;
let configCache = null;
let fantasiasCache = [];
let rankingCache = [];
let abaAtiva = 'ranking';
let autoRefreshTimer = null;
let itensSequenciaModal = [];

// Ícones SVG Vetoriais (Zero Emojis - AGENTS.md)
const ICONS = {
  copy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  whatsapp: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.17 8.17 0 0 1-1.25-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.23 8.23zm4.51-6.17c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.98-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.39-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43s-.56-1.34-.76-1.84c-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.12.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.44.53.61.19 1.16.17 1.6.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.17-.48-.29z"/></svg>`,
  externalLink: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  trophy: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
  edit: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
  trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
  arrowUp: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`,
  arrowDown: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`,
  play: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  stop: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect width="14" height="14" x="5" y="5" rx="2"/></svg>`
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!API.getToken()) {
    window.location.href = 'index.html';
    return;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      fecharModalFantasia();
      fecharModalConfigJurados();
      fecharModalSequencia();
      fecharLightboxCineflixManual();
    }
  });

  await carregarEventosCineflix();

  // Polling em segundo plano para manter o status do palco sincronizado a cada 4 segundos
  autoRefreshTimer = setInterval(() => {
    if (eventoIdSelecionado) {
      carregarConfigJurados(true);
    }
  }, 4000);
});

window.logoutAdmin = function () {
  if (typeof API.removeToken === 'function') {
    API.removeToken();
  }
  window.location.href = 'index.html';
};

// --- Carregar Lista de Eventos ---
async function carregarEventosCineflix() {
  try {
    const eventos = await API.request('/admin/eventos');
    const select = document.getElementById('filtro-evento-cineflix');

    if (!eventos || eventos.length === 0) {
      select.innerHTML = '<option value="">Nenhum evento cadastrado</option>';
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const paramId = urlParams.get('evento_id') || urlParams.get('id');

    select.innerHTML = eventos.map(e => `<option value="${e.id}">${escapeHtml(e.titulo)}</option>`).join('');

    if (paramId && eventos.some(e => e.id == paramId)) {
      select.value = paramId;
      eventoIdSelecionado = parseInt(paramId, 10);
    } else {
      eventoIdSelecionado = eventos[0].id;
      select.value = eventos[0].id;
    }

    await carregarDadosCineflix();
  } catch (err) {
    console.error('Erro ao carregar eventos:', err);
  }
}

window.trocarEventoCineflix = async function () {
  const sel = document.getElementById('filtro-evento-cineflix');
  eventoIdSelecionado = parseInt(sel.value, 10);
  await carregarDadosCineflix();
};

window.trocarAbaCineflix = function (aba, btnEl) {
  abaAtiva = aba;
  document.querySelectorAll('.cineflix-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.cineflix-pane').forEach(p => p.classList.remove('active'));

  if (btnEl) btnEl.classList.add('active');
  const target = document.getElementById(`pane-cineflix-${aba}`);
  if (target) target.classList.add('active');

  if (aba === 'ranking') {
    carregarRankingCineflix();
  } else {
    renderizarFantasiasAdmin();
  }
};

// --- Carregar Todos os Dados ---
async function carregarDadosCineflix() {
  if (!eventoIdSelecionado) return;

  await Promise.all([
    carregarConfigJurados(),
    carregarListaFantasias(),
    carregarRankingCineflix()
  ]);
}

// --- Carregar Configuração e Links dos Jurados ---
async function carregarConfigJurados(silent = false) {
  try {
    const cfg = await API.request(`/admin/cineflix/config?evento_id=${eventoIdSelecionado}`);
    configCache = cfg;

    const badgeStatus = document.getElementById('badge-status-votacao-admin');
    const btnToggle = document.getElementById('btn-toggle-votacao');

    if (cfg.votacao_aberta) {
      if (badgeStatus) badgeStatus.innerHTML = `<span class="badge" style="background: #ECFDF5; color: #059669; border: 1px solid #A7F3D0; font-weight: 700; padding: 4px 10px;">Votação Aberta</span>`;
      if (btnToggle) {
        btnToggle.innerHTML = `<span>Encerrar Votação</span>`;
        btnToggle.style.color = '#EF4444';
        btnToggle.style.borderColor = '#FECDD3';
      }
    } else {
      if (badgeStatus) badgeStatus.innerHTML = `<span class="badge" style="background: #FEF2F2; color: #DC2626; border: 1px solid #FECDD3; font-weight: 700; padding: 4px 10px;">Votação Encerrada</span>`;
      if (btnToggle) {
        btnToggle.innerHTML = `<span>Abrir Votação</span>`;
        btnToggle.style.color = '#059669';
        btnToggle.style.borderColor = '#A7F3D0';
      }
    }

    renderizarCardsJurados(cfg);
    renderizarControlePalcoAdmin(cfg);
  } catch (err) {
    if (!silent) console.error('Erro ao carregar config dos jurados:', err);
  }
}

// --- Renderizar Card de Controle do Palco / Apresentação em Tempo Real ---
function renderizarControlePalcoAdmin(cfg) {
  const container = document.getElementById('palco-controle-section');
  if (!container) return;

  if (!cfg) cfg = configCache;
  if (!cfg) return;

  const fAtiva = cfg.fantasia_ativa;

  if (fAtiva) {
    container.className = 'palco-controle-card';
    const foto = fAtiva.foto_url || 'img/logo.png';

    const j1 = cfg.jurado_1;
    const j2 = cfg.jurado_2;
    const j3 = cfg.jurado_3;

    const votosRecebidos = (j1.votou_ativa ? 1 : 0) + (j2.votou_ativa ? 1 : 0) + (j3.votou_ativa ? 1 : 0);

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.85rem; border-bottom: 1px solid rgba(255, 255, 255, 0.15); padding-bottom: 0.65rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="live-pulse-dot"></span>
          <span style="font-weight: 800; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.06em; color: #00B894;">AO VIVO NA PASSARELA — VOTAÇÃO ABERTA PARA JURADOS</span>
        </div>
        <span class="badge" style="background: rgba(255, 183, 3, 0.2); color: #FFB703; border: 1px solid rgba(255, 183, 3, 0.4); font-weight: 800; font-size: 0.78rem;">
          Apresentação #${fAtiva.ordem_apresentacao || 1}
        </span>
      </div>

      <div style="display: flex; gap: 1.15rem; align-items: center; flex-wrap: wrap;">
        <img src="${escapeHtml(foto)}" alt="${escapeHtml(fAtiva.personagem)}" onclick="abrirLightboxCineflix('${escapeHtml(foto)}')" style="width: 72px; height: 72px; border-radius: 12px; object-fit: cover; border: 2px solid rgba(255, 255, 255, 0.25); cursor: pointer; flex-shrink: 0;">
        
        <div style="flex: 1; min-width: 220px;">
          <div style="font-size: 0.74rem; font-weight: 800; text-transform: uppercase; color: #FFB703; letter-spacing: 0.05em; margin-bottom: 2px;">
            ${escapeHtml(fAtiva.universo)}
          </div>
          <div style="font-family: 'Outfit', sans-serif; font-size: 1.4rem; font-weight: 900; color: #FFFFFF; line-height: 1.1;">
            ${escapeHtml(fAtiva.personagem)}
          </div>
          <div style="font-size: 0.85rem; color: #CBD5E1; margin-top: 2px;">
            Participante: <strong>${escapeHtml(fAtiva.nome_participante)}</strong>
          </div>
        </div>

        <!-- Status dos 3 Jurados em Tempo Real -->
        <div style="display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap;">
          <div style="background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 0.45rem 0.75rem; text-align: center;">
            <div style="font-size: 0.68rem; color: #94A3B8; text-transform: uppercase; font-weight: 700;">${escapeHtml(j1.nome)}</div>
            <div style="font-size: 0.82rem; font-weight: 800; color: ${j1.votou_ativa ? '#00B894' : '#F59E0B'};">
              ${j1.votou_ativa ? '✓ Votou' : 'Aguardando'}
            </div>
          </div>

          <div style="background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 0.45rem 0.75rem; text-align: center;">
            <div style="font-size: 0.68rem; color: #94A3B8; text-transform: uppercase; font-weight: 700;">${escapeHtml(j2.nome)}</div>
            <div style="font-size: 0.82rem; font-weight: 800; color: ${j2.votou_ativa ? '#00B894' : '#F59E0B'};">
              ${j2.votou_ativa ? '✓ Votou' : 'Aguardando'}
            </div>
          </div>

          <div style="background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 0.45rem 0.75rem; text-align: center;">
            <div style="font-size: 0.68rem; color: #94A3B8; text-transform: uppercase; font-weight: 700;">${escapeHtml(j3.nome)}</div>
            <div style="font-size: 0.82rem; font-weight: 800; color: ${j3.votou_ativa ? '#00B894' : '#F59E0B'};">
              ${j3.votou_ativa ? '✓ Votou' : 'Aguardando'}
            </div>
          </div>
        </div>

        <!-- Ações do Palco -->
        <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
          <button type="button" class="btn btn-sm" onclick="desativarPalcoAdmin()" style="background: rgba(239, 68, 68, 0.2); color: #FCA5A5; border: 1px solid rgba(239, 68, 68, 0.5); font-weight: 700; padding: 0.5rem 0.85rem; border-radius: 8px; cursor: pointer;">
            ${ICONS.stop}
            <span>Liberar Palco</span>
          </button>
          <button type="button" class="btn btn-sm" onclick="chamarProximaPalcoAdmin()" style="background: linear-gradient(135deg, #FF7900 0%, #E66A00 100%); color: #FFFFFF; border: none; font-weight: 800; padding: 0.5rem 0.95rem; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 12px rgba(255, 121, 0, 0.4);">
            ${ICONS.play}
            <span>Próxima Apresentação</span>
          </button>
        </div>
      </div>
    `;
  } else {
    container.className = 'palco-controle-card vazio';
    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.85rem;">
        <div style="display: flex; align-items: center; gap: 0.85rem;">
          <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(255, 255, 255, 0.08); display: flex; align-items: center; justify-content: center; color: #FFB703;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </div>
          <div>
            <div style="font-weight: 800; font-size: 1.05rem; color: #FFFFFF;">Nenhum participante no palco agora</div>
            <div style="font-size: 0.84rem; color: #94A3B8;">Os 3 jurados estão na tela de espera aguardando o próximo desfile entrar na passarela.</div>
          </div>
        </div>

        <div style="display: flex; gap: 0.65rem; align-items: center; flex-wrap: wrap;">
          <button type="button" class="btn btn-outline" onclick="abrirModalSequenciaDesfile()" style="font-size: 0.82rem; padding: 0.5rem 0.85rem; color: #CBD5E1; border-color: rgba(255, 255, 255, 0.2);">
            <span>Ver Sequência</span>
          </button>
          <button type="button" class="btn-cineflix-primary" onclick="chamarProximaPalcoAdmin()" style="font-size: 0.84rem; padding: 0.55rem 1.1rem;">
            ${ICONS.play}
            <span>Chamar Próxima da Fila</span>
          </button>
        </div>
      </div>
    `;
  }
}

// --- Colocar / Tirar Fantasia do Palco ---
window.ativarNoPalcoAdmin = async function (fantasiaId) {
  try {
    const res = await API.request('/admin/cineflix/ativar-palco', {
      method: 'PUT',
      body: JSON.stringify({
        evento_id: eventoIdSelecionado,
        fantasia_id: fantasiaId
      })
    });

    showToast(res.mensagem || 'Fantasia colocada no palco com sucesso!', 'success');
    await Promise.all([carregarConfigJurados(), carregarListaFantasias()]);
  } catch (err) {
    showToast(err.message || 'Erro ao colocar fantasia no palco.', 'error');
  }
};

window.desativarPalcoAdmin = async function () {
  try {
    const res = await API.request('/admin/cineflix/ativar-palco', {
      method: 'PUT',
      body: JSON.stringify({
        evento_id: eventoIdSelecionado,
        fantasia_id: null
      })
    });

    showToast(res.mensagem || 'Palco liberado com sucesso.', 'info');
    await Promise.all([carregarConfigJurados(), carregarListaFantasias()]);
  } catch (err) {
    showToast(err.message || 'Erro ao liberar palco.', 'error');
  }
};

window.chamarProximaPalcoAdmin = async function () {
  if (fantasiasCache.length === 0) {
    showToast('Nenhuma fantasia cadastrada neste evento.', 'error');
    return;
  }

  // Ordenar por ordem de apresentação
  const ordenadas = [...fantasiasCache].sort((a, b) => (a.ordem_apresentacao || 0) - (b.ordem_apresentacao || 0));

  let proxima = null;
  const ativaId = configCache ? configCache.fantasia_ativa_id : null;

  if (ativaId) {
    const idx = ordenadas.findIndex(f => f.id === ativaId);
    if (idx !== -1 && idx + 1 < ordenadas.length) {
      proxima = ordenadas[idx + 1];
    } else {
      proxima = ordenadas[0]; // Volta pro início se chegou no fim
    }
  } else {
    proxima = ordenadas[0];
  }

  if (proxima) {
    await ativarNoPalcoAdmin(proxima.id);
  }
};

function renderizarCardsJurados(cfg) {
  const container = document.getElementById('container-jurados-cards');
  if (!container) return;

  const jurados = [cfg.jurado_1, cfg.jurado_2, cfg.jurado_3];
  const baseUrl = window.location.origin;

  container.innerHTML = jurados.map(j => {
    const publicUrl = `${baseUrl}/cineflix-jurado.html?token=${j.token}`;
    const textoWhatsapp = encodeURIComponent(`Olá, ${j.nome}! Aqui está o seu link exclusivo como Jurado do Cineflix no evento "${cfg.evento_nome}": ${publicUrl}`);

    return `
      <div class="jurado-card">
        <div class="jurado-card-header">
          <div class="jurado-avatar-num">J${j.numero}</div>
          <div>
            <div class="jurado-name-label">${escapeHtml(j.nome)}</div>
            <div class="jurado-progress-tag">${j.votos_computados} de ${j.total_fantasias} avaliações</div>
          </div>
        </div>

        <div class="jurado-actions-row">
          <button type="button" class="btn-jurado-action btn-copiar-link" onclick="copiarLinkJurado('${escapeHtml(publicUrl)}', this)">
            ${ICONS.copy}
            <span>Copiar Link</span>
          </button>
          <a href="https://wa.me/?text=${textoWhatsapp}" target="_blank" class="btn-jurado-action btn-whatsapp-jurado">
            ${ICONS.whatsapp}
            <span>WhatsApp</span>
          </a>
          <a href="${escapeHtml(publicUrl)}" target="_blank" class="btn-jurado-action btn-copiar-link" title="Testar link em nova aba">
            ${ICONS.externalLink}
          </a>
        </div>
      </div>
    `;
  }).join('');
}

window.copiarLinkJurado = function (url, btnEl) {
  navigator.clipboard.writeText(url).then(() => {
    showToast('Link do jurado copiado com sucesso!', 'success');
    const span = btnEl.querySelector('span');
    const oldText = span.textContent;
    span.textContent = 'Copiado!';
    setTimeout(() => { span.textContent = oldText; }, 2000);
  }).catch(() => {
    prompt('Copie o link abaixo:', url);
  });
};

window.toggleVotacaoStatus = async function () {
  if (!configCache) return;
  const novoStatus = !configCache.votacao_aberta;
  const msgConfirm = novoStatus
    ? 'Deseja ABRIR a votação do Cineflix para os jurados?'
    : 'Deseja ENCERRAR a votação do Cineflix? Os jurados não poderão votar enquanto estiver fechada.';

  if (!confirm(msgConfirm)) return;

  try {
    await API.request(`/admin/cineflix/config?evento_id=${eventoIdSelecionado}`, {
      method: 'PUT',
      body: JSON.stringify({ votacao_aberta: novoStatus })
    });
    showToast(novoStatus ? 'Votação aberta com sucesso!' : 'Votação encerrada com sucesso!', 'success');
    await carregarConfigJurados();
  } catch (err) {
    showToast(err.message || 'Erro ao alterar status de votação.', 'error');
  }
};

// --- Carregar Ranking / Placar ---
async function carregarRankingCineflix() {
  if (!eventoIdSelecionado) return;
  const tbody = document.getElementById('tbody-ranking-cineflix');
  const podio = document.getElementById('podio-container');

  try {
    const list = await API.request(`/admin/cineflix/ranking?evento_id=${eventoIdSelecionado}`);
    rankingCache = list || [];

    // 1. Renderizar Pódio (Top 3)
    if (podio) {
      if (rankingCache.length === 0) {
        podio.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #94A3B8; background: #FFFFFF; border-radius: 14px; border: 1px dashed var(--border-color);">
            Ainda não há pontuações registradas para gerar o pódio.
          </div>
        `;
      } else {
        const top3 = rankingCache.slice(0, 3);
        const classes = ['ouro', 'prata', 'bronze'];
        const titulos = ['1º Lugar (Campeão)', '2º Lugar (Vice)', '3º Lugar'];

        podio.innerHTML = top3.map((item, idx) => {
          return `
            <div class="podio-card ${classes[idx]}">
              <div class="podio-rank-badge">
                ${ICONS.trophy}
                <span>${titulos[idx]}</span>
              </div>
              <div class="podio-personagem">${escapeHtml(item.personagem)}</div>
              <div style="font-size: 0.86rem; color: #64748B; font-weight: 600;">${escapeHtml(item.nome_participante)} &bull; <span style="color: #FF7900; font-weight: 700;">${escapeHtml(item.universo)}</span></div>
              
              <div style="margin-top: auto; padding-top: 0.75rem; border-top: 1px dashed rgba(0,0,0,0.08); display: flex; justify-content: space-between; align-items: baseline;">
                <span style="font-size: 0.78rem; text-transform: uppercase; color: #64748B; font-weight: 700;">Pontuação Total:</span>
                <span class="podio-total-score tabular-nums">${item.pontuacao_total.toFixed(0)} <small style="font-size: 0.9rem; color: #64748B;">/ 45 pts</small></span>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // 2. Renderizar Tabela Completa
    if (tbody) {
      if (rankingCache.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align: center; padding: 2.5rem; color: #94A3B8;">
              Nenhuma fantasia cadastrada ou sem avaliações registradas ainda.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = rankingCache.map(it => {
        const medalhas = { 1: '🥇', 2: '🥈', 3: '🥉' };
        const posBadge = medalhas[it.posicao]
          ? `<span style="font-size: 1.25rem;">${medalhas[it.posicao]}</span>`
          : `<span class="badge" style="background: #F1F5F9; color: #475569; font-weight: 800; font-size: 0.8rem;">${it.posicao}º</span>`;

        const renderNotaJ = (val, det, numJ) => {
          if (val === null || val === undefined) return '<span style="color: #CBD5E1;">—</span>';
          return `
            <span class="score-pill-jurado tabular-nums" onclick="verDetalhesNotas(${it.fantasia_id}, ${numJ})" title="Clique para ver detalhes das notas">
              ${val.toFixed(0)} <small style="font-size: 0.7rem; color: #64748B;">/ 15</small>
            </span>
          `;
        };

        return `
          <tr>
            <td style="text-align: center;">${posBadge}</td>
            <td>
              <div style="font-weight: 800; font-size: 0.95rem; color: #0F172A;">${escapeHtml(it.personagem)}</div>
              <span style="font-size: 0.72rem; font-weight: 700; color: #FF7900; text-transform: uppercase; letter-spacing: 0.05em;">${escapeHtml(it.universo)}</span>
            </td>
            <td style="font-weight: 600; color: #334155;">${escapeHtml(it.nome_participante)}</td>
            <td style="text-align: center;">${renderNotaJ(it.nota_j1, it.detalhes_j1, 1)}</td>
            <td style="text-align: center;">${renderNotaJ(it.nota_j2, it.detalhes_j2, 2)}</td>
            <td style="text-align: center;">${renderNotaJ(it.nota_j3, it.detalhes_j3, 3)}</td>
            <td style="text-align: center; font-weight: 700; color: #475569;" class="tabular-nums">${it.media_final.toFixed(1)}</td>
            <td style="text-align: right; padding-right: 1.5rem; font-family: 'Teko', sans-serif; font-size: 1.45rem; font-weight: 700; color: #00B894;" class="tabular-nums">
              ${it.pontuacao_total.toFixed(0)} <small style="font-size: 0.85rem; color: #64748B;">pts</small>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Erro ao carregar ranking:', err);
  }
}

// --- Detalhes das Notas de um Jurado ---
window.verDetalhesNotas = function (fantasiaId, numJ) {
  const item = rankingCache.find(r => r.fantasia_id === fantasiaId);
  if (!item) return;

  const det = numJ === 1 ? item.detalhes_j1 : (numJ === 2 ? item.detalhes_j2 : item.detalhes_j3);
  const nomeJ = configCache ? configCache[`jurado_${numJ}`].nome : `Jurado ${numJ}`;

  if (!det) {
    showToast(`O ${nomeJ} ainda não registrou notas para esta fantasia.`, 'info');
    return;
  }

  alert(`Notas de ${nomeJ} para "${item.personagem}":\n\n• Impacto Visual: ${det.impacto} pts (máx 5)\n• Performance: ${det.performance} pts (máx 5)\n• Dedicação: ${det.dedicacao} pts (máx 5)\n\nTotal do Jurado: ${det.impacto + det.performance + det.dedicacao} de 15 pts`);
};

// --- Carregar Lista de Fantasias ---
async function carregarListaFantasias() {
  if (!eventoIdSelecionado) return;
  try {
    const list = await API.request(`/admin/cineflix?evento_id=${eventoIdSelecionado}`);
    fantasiasCache = list || [];

    document.getElementById('cont-total-fantasias').textContent = fantasiasCache.length;
    renderizarFantasiasAdmin();
  } catch (err) {
    console.error('Erro ao carregar fantasias:', err);
  }
}

window.filtrarFantasiasLocal = function () {
  renderizarFantasiasAdmin();
};

function renderizarFantasiasAdmin() {
  const container = document.getElementById('container-fantasias-admin');
  if (!container) return;

  const termo = (document.getElementById('filtro-busca-fantasias')?.value || '').toLowerCase().trim();
  
  // Ordenar por ordem_apresentacao crescente
  let itens = [...fantasiasCache].sort((a, b) => (a.ordem_apresentacao || 0) - (b.ordem_apresentacao || 0));

  if (termo) {
    itens = itens.filter(f => {
      const p = (f.personagem || '').toLowerCase();
      const part = (f.nome_participante || '').toLowerCase();
      const u = (f.universo || '').toLowerCase();
      return p.includes(termo) || part.includes(termo) || u.includes(termo);
    });
  }

  if (itens.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3.5rem 1rem; background: #FFFFFF; border-radius: 16px; border: 1px dashed var(--border-color);">
        <h3 style="font-size: 1.15rem; font-weight: 800; color: #0F172A; margin-bottom: 0.35rem;">Nenhuma fantasia encontrada</h3>
        <p style="color: #64748B; font-size: 0.88rem; margin-bottom: 1rem;">Nenhum participante cadastrado ou termo não localizado.</p>
        <button type="button" class="btn-cineflix-primary" onclick="abrirModalNovaFantasia()">
          <span>+ Cadastrar Fantasia</span>
        </button>
      </div>
    `;
    return;
  }

  const ativaId = configCache ? configCache.fantasia_ativa_id : null;

  container.innerHTML = itens.map((f, idx) => {
    const fotoUrl = f.foto_url || 'img/logo.png';
    const estaNoPalco = (ativaId && ativaId === f.id);

    return `
      <div class="fantasia-admin-card" id="fantasia-card-${f.id}" style="${estaNoPalco ? 'border: 2px solid #00B894; box-shadow: 0 0 16px rgba(0, 184, 148, 0.25);' : ''}">
        <div class="fantasia-card-thumb" onclick="abrirLightboxCineflix('${escapeHtml(fotoUrl)}')">
          <img src="${escapeHtml(fotoUrl)}" alt="${escapeHtml(f.personagem)}" onerror="this.src='img/logo.png'">
          
          <span style="position: absolute; top: 10px; left: 10px; background: rgba(0, 20, 23, 0.85); color: #FFFFFF; border-radius: 6px; font-size: 0.74rem; font-weight: 800; padding: 3px 8px; border: 1px solid rgba(255, 255, 255, 0.2);">
            #${f.ordem_apresentacao || (idx + 1)}
          </span>

          <span style="position: absolute; top: 10px; right: 10px; background: rgba(0, 30, 33, 0.85); color: #FFB703; border: 1px solid rgba(255, 183, 3, 0.4); border-radius: 6px; font-size: 0.72rem; font-weight: 800; padding: 3px 8px; text-transform: uppercase;">
            ${escapeHtml(f.universo)}
          </span>
        </div>

        <div style="padding: 1.15rem; display: flex; flex-direction: column; flex: 1; gap: 0.65rem;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
            <h3 style="font-size: 1.15rem; font-weight: 800; font-family: 'Plus Jakarta Sans', sans-serif; color: #0F172A; margin: 0; line-height: 1.25;">
              ${escapeHtml(f.personagem)}
            </h3>
            
            ${estaNoPalco ? `
              <span class="badge" style="background: #ECFDF5; color: #059669; border: 1px solid #A7F3D0; font-weight: 800; font-size: 0.72rem; display: inline-flex; align-items: center; gap: 0.35rem;">
                <span class="live-pulse-dot"></span> No Palco
              </span>
            ` : ''}
          </div>

          <div style="font-size: 0.85rem; color: #475569; font-weight: 600;">
            Participante: <strong>${escapeHtml(f.nome_participante)}</strong>
          </div>

          ${f.descricao ? `
            <div style="font-size: 0.82rem; color: #64748B; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0.5rem 0.75rem; line-height: 1.4;">
              ${escapeHtml(f.descricao)}
            </div>
          ` : ''}

          <!-- Botão de Ação do Palco / Desfile -->
          <div style="margin-top: auto; padding-top: 0.65rem; border-top: 1px solid #F1F5F9; display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <div>
              ${estaNoPalco ? `
                <button type="button" class="btn btn-sm" onclick="desativarPalcoAdmin()" style="background: #00B894; color: #FFFFFF; font-weight: 800; border: none; padding: 0.4rem 0.75rem; border-radius: 8px; display: inline-flex; align-items: center; gap: 0.35rem; cursor: pointer;">
                  ${ICONS.stop}
                  <span>No Palco (Liberar)</span>
                </button>
              ` : `
                <button type="button" class="btn btn-sm" onclick="ativarNoPalcoAdmin(${f.id})" style="background: #FFF7ED; color: #EA580C; border: 1.5px solid #FDBA74; font-weight: 800; padding: 0.4rem 0.75rem; border-radius: 8px; display: inline-flex; align-items: center; gap: 0.35rem; cursor: pointer;">
                  ${ICONS.play}
                  <span>Chamar para Palco</span>
                </button>
              `}
            </div>

            <div style="display: flex; gap: 0.35rem;">
              <button type="button" class="btn btn-outline" style="padding: 0.4rem 0.65rem;" onclick="abrirModalEditarFantasia(${f.id})" title="Editar Fantasia">
                ${ICONS.edit}
              </button>
              <button type="button" class="btn btn-outline" style="padding: 0.4rem 0.65rem; color: #EF4444; border-color: #FECDD3;" onclick="excluirFantasiaAdmin(${f.id}, '${escapeHtml(f.personagem)}')" title="Excluir Fantasia">
                ${ICONS.trash}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// MODAL: DEFINIR SEQUÊNCIA DE DESFILE
// ==========================================
window.abrirModalSequenciaDesfile = function () {
  if (fantasiasCache.length === 0) {
    showToast('Nenhuma fantasia cadastrada neste evento para ordenar.', 'error');
    return;
  }

  // Clona e ordena pela ordem atual
  itensSequenciaModal = [...fantasiasCache].sort((a, b) => (a.ordem_apresentacao || 0) - (b.ordem_apresentacao || 0));

  renderizarItensSequenciaModal();

  const modal = document.getElementById('modal-sequencia-desfile');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
  }
};

window.fecharModalSequencia = function () {
  const modal = document.getElementById('modal-sequencia-desfile');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
};

window.fecharModalSequenciaBackdrop = function (e) {
  if (e.target.id === 'modal-sequencia-desfile') {
    fecharModalSequencia();
  }
};

function renderizarItensSequenciaModal() {
  const container = document.getElementById('lista-sequencia-desfile-itens');
  if (!container) return;

  container.innerHTML = itensSequenciaModal.map((item, idx) => {
    return `
      <div class="sequencia-item-row">
        <div style="font-weight: 800; font-size: 0.95rem; color: #FF7900; min-width: 40px;">
          ${idx + 1}º
        </div>

        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 800; font-size: 0.95rem; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${escapeHtml(item.personagem)}
          </div>
          <div style="font-size: 0.78rem; color: #64748B;">
            ${escapeHtml(item.nome_participante)} &bull; <span style="color: #FF7900; font-weight: 700;">${escapeHtml(item.universo)}</span>
          </div>
        </div>

        <div style="display: flex; gap: 0.35rem; align-items: center;">
          <button type="button" class="btn btn-outline" style="padding: 0.35rem 0.55rem;" ${idx === 0 ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''} onclick="moverSequenciaItem(${idx}, -1)" title="Subir na fila">
            ${ICONS.arrowUp}
          </button>
          <button type="button" class="btn btn-outline" style="padding: 0.35rem 0.55rem;" ${idx === itensSequenciaModal.length - 1 ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''} onclick="moverSequenciaItem(${idx}, 1)" title="Descer na fila">
            ${ICONS.arrowDown}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.moverSequenciaItem = function (idx, offset) {
  const targetIdx = idx + offset;
  if (targetIdx < 0 || targetIdx >= itensSequenciaModal.length) return;

  const temp = itensSequenciaModal[idx];
  itensSequenciaModal[idx] = itensSequenciaModal[targetIdx];
  itensSequenciaModal[targetIdx] = temp;

  renderizarItensSequenciaModal();
};

window.salvarSequenciaDesfile = async function () {
  const btn = document.getElementById('btn-salvar-sequencia');
  const txtAntigo = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span>Salvando sequência...</span>';

  try {
    const payload = {
      evento_id: eventoIdSelecionado,
      sequencia: itensSequenciaModal.map((it, idx) => ({
        id: it.id,
        ordem: idx + 1
      }))
    };

    await API.request('/admin/cineflix/sequencia', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    showToast('Sequência de desfile atualizada com sucesso!', 'success');
    fecharModalSequencia();
    await Promise.all([carregarListaFantasias(), carregarConfigJurados()]);
  } catch (err) {
    showToast(err.message || 'Erro ao salvar sequência de desfile.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = txtAntigo;
  }
};

// ==========================================
// UPLOAD DE FOTO E MODAL DE FANTASIA
// ==========================================
window.uploadFotoFantasia = async function (inputElement) {
  if (!inputElement.files || !inputElement.files[0]) return;
  const file = inputElement.files[0];

  if (!file.type.startsWith('image/')) {
    showToast('Por favor selecione um arquivo de imagem válido.', 'error');
    inputElement.value = '';
    return;
  }

  if (file.size > 15 * 1024 * 1024) {
    showToast('A imagem deve ter no máximo 15MB.', 'error');
    inputElement.value = '';
    return;
  }

  const placeholder = document.getElementById('uploader-placeholder-fantasia');
  const spinner = document.getElementById('uploader-spinner-fantasia');
  const preview = document.getElementById('preview-foto-fantasia');

  if (placeholder) placeholder.style.display = 'none';
  if (spinner) spinner.style.display = 'block';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await API.request('/admin/cineflix/upload', {
      method: 'POST',
      body: formData
    });

    document.getElementById('fantasia-foto-url').value = res.url;
    if (preview) {
      preview.src = res.url;
      preview.style.display = 'block';
    }
    showToast('Foto da fantasia enviada com sucesso!', 'success');
  } catch (err) {
    showToast(err.message || 'Erro ao enviar foto.', 'error');
    if (placeholder) placeholder.style.display = 'block';
    if (preview) preview.style.display = 'none';
  } finally {
    if (spinner) spinner.style.display = 'none';
    inputElement.value = '';
  }
};

window.abrirModalNovaFantasia = function () {
  document.getElementById('form-fantasia-admin').reset();
  document.getElementById('fantasia-id').value = '';
  document.getElementById('fantasia-foto-url').value = '';
  document.getElementById('modal-fantasia-titulo').innerHTML = `
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF7900" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/></svg>
    <span>Cadastrar Fantasia</span>
  `;

  const preview = document.getElementById('preview-foto-fantasia');
  const placeholder = document.getElementById('uploader-placeholder-fantasia');
  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
  if (placeholder) placeholder.style.display = 'block';

  const modal = document.getElementById('modal-fantasia-admin');
  modal.style.display = 'flex';
  modal.classList.add('active');
};

window.abrirModalEditarFantasia = function (id) {
  const item = fantasiasCache.find(f => f.id === id);
  if (!item) return;

  document.getElementById('fantasia-id').value = item.id;
  document.getElementById('fantasia-participante-nome').value = item.nome_participante || '';
  document.getElementById('fantasia-personagem').value = item.personagem || '';
  document.getElementById('fantasia-universo').value = item.universo || '';
  document.getElementById('fantasia-descricao').value = item.descricao || '';
  document.getElementById('fantasia-foto-url').value = item.foto_url || '';

  const preview = document.getElementById('preview-foto-fantasia');
  const placeholder = document.getElementById('uploader-placeholder-fantasia');
  if (item.foto_url) {
    if (preview) {
      preview.src = item.foto_url;
      preview.style.display = 'block';
    }
    if (placeholder) placeholder.style.display = 'none';
  } else {
    if (preview) preview.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
  }

  document.getElementById('modal-fantasia-titulo').innerHTML = `
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF7900" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
    <span>Editar Fantasia</span>
  `;

  const modal = document.getElementById('modal-fantasia-admin');
  modal.style.display = 'flex';
  modal.classList.add('active');
};

window.fecharModalFantasia = function () {
  const modal = document.getElementById('modal-fantasia-admin');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
};

window.fecharModalFantasiaBackdrop = function (e) {
  if (e.target.id === 'modal-fantasia-admin') {
    fecharModalFantasia();
  }
};

window.salvarFantasiaAdmin = async function (e) {
  e.preventDefault();

  const id = document.getElementById('fantasia-id').value;
  const nomePart = document.getElementById('fantasia-participante-nome').value.trim();
  const personagem = document.getElementById('fantasia-personagem').value.trim();
  const universo = document.getElementById('fantasia-universo').value.trim();
  const descricao = document.getElementById('fantasia-descricao').value.trim();
  const fotoUrl = document.getElementById('fantasia-foto-url').value.trim();

  const payload = {
    evento_id: eventoIdSelecionado,
    nome_participante: nomePart,
    personagem: personagem,
    universo: universo,
    descricao: descricao || null,
    foto_url: fotoUrl || null
  };

  const btn = document.getElementById('btn-salvar-fantasia');
  const txtAntigo = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span>Salvando...</span>';

  try {
    if (id) {
      await API.request(`/admin/cineflix/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast('Fantasia atualizada com sucesso!', 'success');
    } else {
      await API.request('/admin/cineflix', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('Fantasia cadastrada com sucesso!', 'success');
    }

    fecharModalFantasia();
    await carregarDadosCineflix();
  } catch (err) {
    showToast(err.message || 'Erro ao salvar fantasia.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = txtAntigo;
  }
};

window.excluirFantasiaAdmin = async function (id, personagem) {
  if (!confirm(`Tem certeza que deseja excluir a fantasia "${personagem}"? Todos os votos computados para ela serão removidos.`)) {
    return;
  }

  try {
    await API.request(`/admin/cineflix/${id}`, { method: 'DELETE' });
    showToast('Fantasia excluída com sucesso!', 'success');
    await carregarDadosCineflix();
  } catch (err) {
    showToast(err.message || 'Erro ao excluir fantasia.', 'error');
  }
};

// --- Modal Config Jurados ---
window.abrirModalConfigJurados = function () {
  if (!configCache) return;

  document.getElementById('cfg-nome-j1').value = configCache.jurado_1.nome || 'Jurado 1';
  document.getElementById('cfg-nome-j2').value = configCache.jurado_2.nome || 'Jurado 2';
  document.getElementById('cfg-nome-j3').value = configCache.jurado_3.nome || 'Jurado 3';
  document.getElementById('cfg-regenerar-tokens').checked = false;

  const modal = document.getElementById('modal-config-jurados');
  modal.style.display = 'flex';
  modal.classList.add('active');
};

window.fecharModalConfigJurados = function () {
  const modal = document.getElementById('modal-config-jurados');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
};

window.fecharModalConfigBackdrop = function (e) {
  if (e.target.id === 'modal-config-jurados') {
    fecharModalConfigJurados();
  }
};

window.salvarConfigJurados = async function (e) {
  e.preventDefault();

  const j1 = document.getElementById('cfg-nome-j1').value.trim();
  const j2 = document.getElementById('cfg-nome-j2').value.trim();
  const j3 = document.getElementById('cfg-nome-j3').value.trim();
  const regen = document.getElementById('cfg-regenerar-tokens').checked;

  try {
    await API.request(`/admin/cineflix/config?evento_id=${eventoIdSelecionado}`, {
      method: 'PUT',
      body: JSON.stringify({
        nome_jurado_1: j1,
        nome_jurado_2: j2,
        nome_jurado_3: j3,
        regenerar_tokens: regen
      })
    });

    showToast('Configurações dos jurados salvas com sucesso!', 'success');
    fecharModalConfigJurados();
    await carregarConfigJurados();
  } catch (err) {
    showToast(err.message || 'Erro ao salvar configuração dos jurados.', 'error');
  }
};

// --- Lightbox ---
window.abrirLightboxCineflix = function (url) {
  const lb = document.getElementById('modal-lightbox-cineflix');
  const img = document.getElementById('lightbox-cineflix-img');
  if (lb && img) {
    img.src = url;
    lb.style.display = 'flex';
    lb.classList.add('active');
  }
};

window.fecharLightboxCineflix = function (e) {
  if (e.target.id === 'modal-lightbox-cineflix') {
    fecharLightboxCineflixManual();
  }
};

window.fecharLightboxCineflixManual = function () {
  const lb = document.getElementById('modal-lightbox-cineflix');
  if (lb) {
    lb.style.display = 'none';
    lb.classList.remove('active');
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
