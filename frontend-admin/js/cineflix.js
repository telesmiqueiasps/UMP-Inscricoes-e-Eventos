// ==========================================
// Cineflix - Concurso de Fantasias (Admin)
// ==========================================

let eventoIdSelecionado = null;
let configCache = null;
let fantasiasCache = [];
let rankingCache = [];
let abaAtiva = 'ranking';

// Ícones SVG Vetoriais (Zero Emojis - AGENTS.md)
const ICONS = {
  copy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  whatsapp: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.17 8.17 0 0 1-1.25-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.23 8.23zm4.51-6.17c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.98-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.39-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43s-.56-1.34-.76-1.84c-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.12.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.44.53.61.19 1.16.17 1.6.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.17-.48-.29z"/></svg>`,
  externalLink: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  trophy: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
  edit: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
  trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`
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
      fecharLightboxCineflixManual();
    }
  });

  await carregarEventosCineflix();
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
async function carregarConfigJurados() {
  try {
    const cfg = await API.request(`/admin/cineflix/config?evento_id=${eventoIdSelecionado}`);
    configCache = cfg;

    const badgeStatus = document.getElementById('badge-status-votacao-admin');
    const btnToggle = document.getElementById('btn-toggle-votacao');

    if (cfg.votacao_aberta) {
      badgeStatus.innerHTML = `<span class="badge" style="background: #ECFDF5; color: #059669; border: 1px solid #A7F3D0; font-weight: 700; padding: 4px 10px;">Votação Aberta</span>`;
      btnToggle.innerHTML = `<span>Encerrar Votação</span>`;
      btnToggle.style.color = '#EF4444';
      btnToggle.style.borderColor = '#FECDD3';
    } else {
      badgeStatus.innerHTML = `<span class="badge" style="background: #FEF2F2; color: #DC2626; border: 1px solid #FECDD3; font-weight: 700; padding: 4px 10px;">Votação Encerrada</span>`;
      btnToggle.innerHTML = `<span>Abrir Votação</span>`;
      btnToggle.style.color = '#059669';
      btnToggle.style.borderColor = '#A7F3D0';
    }

    renderizarCardsJurados(cfg);
  } catch (err) {
    console.error('Erro ao carregar config dos jurados:', err);
  }
}

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
    showToast('Não foi possível copiar automaticamente.', 'warning');
  });
};

window.toggleVotacaoStatus = async function () {
  if (!configCache) return;
  const novoStatus = !configCache.votacao_aberta;
  const msgConfirm = novoStatus ? 'Deseja abrir a votação do Cineflix para os jurados?' : 'Deseja encerrar a votação do Cineflix? Os jurados não poderão mais alterar notas.';

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
                <span class="podio-total-score tabular-nums">${item.pontuacao_total.toFixed(1)} <small style="font-size: 0.9rem; color: #64748B;">pts</small></span>
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
              Nenhuma fantasia cadastrada neste evento.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = rankingCache.map(r => {
        const j1 = r.nota_j1 !== null ? `${r.nota_j1.toFixed(1)}` : '<span style="color: #CBD5E1;">-</span>';
        const j2 = r.nota_j2 !== null ? `${r.nota_j2.toFixed(1)}` : '<span style="color: #CBD5E1;">-</span>';
        const j3 = r.nota_j3 !== null ? `${r.nota_j3.toFixed(1)}` : '<span style="color: #CBD5E1;">-</span>';

        let badgePos = `<span style="font-weight: 800; font-size: 0.95rem; color: #64748B;">#${r.posicao}</span>`;
        if (r.posicao === 1) badgePos = `<span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: #FEF3C7; color: #B45309; font-weight: 800;">1º</span>`;
        if (r.posicao === 2) badgePos = `<span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: #F1F5F9; color: #475569; font-weight: 800;">2º</span>`;
        if (r.posicao === 3) badgePos = `<span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: #FFEDD5; color: #C2410C; font-weight: 800;">3º</span>`;

        return `
          <tr>
            <td style="text-align: center;">${badgePos}</td>
            <td>
              <strong style="color: #0F172A; font-size: 0.95rem; font-family: 'Plus Jakarta Sans', sans-serif;">${escapeHtml(r.personagem)}</strong>
              <div style="font-size: 0.76rem; color: #FF7900; font-weight: 700; text-transform: uppercase;">${escapeHtml(r.universo)}</div>
            </td>
            <td>
              <span style="font-weight: 600; color: #334155;">${escapeHtml(r.nome_participante)}</span>
            </td>
            <td style="text-align: center; font-weight: 700;" class="tabular-nums">${j1}</td>
            <td style="text-align: center; font-weight: 700;" class="tabular-nums">${j2}</td>
            <td style="text-align: center; font-weight: 700;" class="tabular-nums">${j3}</td>
            <td style="text-align: center; font-weight: 800; color: #00363A;" class="tabular-nums">${r.media_final.toFixed(1)}</td>
            <td style="text-align: right; padding-right: 1.5rem;">
              <strong style="font-size: 1.15rem; color: #00B894; font-family: 'Teko', sans-serif;" class="tabular-nums">${r.pontuacao_total.toFixed(1)}</strong>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:#EF4444;">Erro ao carregar ranking.</td></tr>`;
    }
  }
}

// --- Carregar Lista de Fantasias Cadastradas ---
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
  let itens = fantasiasCache;

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

  container.innerHTML = itens.map(f => {
    const fotoUrl = f.foto_url || 'img/logo.png';

    return `
      <div class="fantasia-admin-card" id="fantasia-card-${f.id}">
        <div class="fantasia-card-thumb" onclick="abrirLightboxCineflix('${escapeHtml(fotoUrl)}')">
          <img src="${escapeHtml(fotoUrl)}" alt="${escapeHtml(f.personagem)}" onerror="this.src='img/logo.png'">
          <span style="position: absolute; top: 10px; right: 10px; background: rgba(0, 30, 33, 0.85); color: #FFB703; border: 1px solid rgba(255, 183, 3, 0.4); border-radius: 6px; font-size: 0.72rem; font-weight: 800; padding: 3px 8px; text-transform: uppercase;">
            ${escapeHtml(f.universo)}
          </span>
        </div>

        <div style="padding: 1.15rem; display: flex; flex-direction: column; flex: 1; gap: 0.65rem;">
          <h3 style="font-size: 1.1rem; font-weight: 800; font-family: 'Plus Jakarta Sans', sans-serif; color: #0F172A; margin: 0; line-height: 1.3;">
            ${escapeHtml(f.personagem)}
          </h3>

          <div style="font-size: 0.85rem; color: #475569; font-weight: 600;">
            Participante: <strong>${escapeHtml(f.nome_participante)}</strong>
          </div>

          ${f.descricao ? `
            <div style="font-size: 0.82rem; color: #64748B; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0.5rem 0.75rem; line-height: 1.4;">
              ${escapeHtml(f.descricao)}
            </div>
          ` : ''}

          <div style="margin-top: auto; padding-top: 0.5rem; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #F1F5F9;">
            <span style="font-size: 0.8rem; color: #64748B; font-weight: 700;">
              Total: <strong style="color: #00B894; font-size: 1rem;" class="tabular-nums">${f.total_pontos.toFixed(1)} pts</strong>
            </span>

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

// --- Upload de Foto da Fantasia ---
window.processarUploadFotoFantasia = async function (inputElement) {
  const file = inputElement.files[0];
  if (!file) return;

  const spinner = document.getElementById('upload-spinner-fantasia');
  const placeholder = document.getElementById('uploader-placeholder-fantasia');
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

// --- Modal de Fantasia (Admin) ---
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
