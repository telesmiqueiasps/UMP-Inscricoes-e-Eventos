let listaEventosAdmin = [];
let listaOficinasAdmin = [];
let oficinaSelecionadaModal = null;
let abaParticipanteVisivel = true;

const SVG_OFICINAS = {
  livro: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
  usuario: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  relogio: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  pin: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  usuarios: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  editar: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
  excluir: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`
};

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', async () => {
  const token = API.getToken();
  const user = API.getUser();
  if (!token || !user || !user.is_admin) return;

  await carregarOficinasAdmin();
});

function atualizarUIChaveAbaParticipante(visivel) {
  abaParticipanteVisivel = Boolean(visivel);
  const toggleEl = document.getElementById('toggle-aba-participante');
  const labelEl = document.getElementById('label-status-aba-participante');

  if (toggleEl) toggleEl.checked = abaParticipanteVisivel;
  if (labelEl) {
    if (abaParticipanteVisivel) {
      labelEl.textContent = 'Disponível para Inscritos';
      labelEl.style.color = '#00B894';
    } else {
      labelEl.textContent = 'Oculta no Painel';
      labelEl.style.color = '#F59E0B';
    }
  }
}

window.alternarVisibilidadeAbaParticipante = async function(visivel) {
  atualizarUIChaveAbaParticipante(visivel);
  try {
    const res = await API.request('/admin/oficinas/config', {
      method: 'PUT',
      body: JSON.stringify({ aba_participante_visivel: Boolean(visivel) })
    });
    atualizarUIChaveAbaParticipante(res.aba_participante_visivel);
    showToast(res.mensagem || 'Configuração da aba atualizada!', 'success');
  } catch (err) {
    atualizarUIChaveAbaParticipante(!visivel);
    showToast(err.message || 'Erro ao alterar disponibilidade da aba.', 'error');
  }
};

window.alternarDisponibilidadeOficina = async function(oficinaId, ativa) {
  try {
    const res = await API.request(`/admin/oficinas/${oficinaId}/disponibilidade`, {
      method: 'PATCH',
      body: JSON.stringify({ ativa: Boolean(ativa) })
    });
    showToast(res.mensagem || 'Disponibilidade da oficina atualizada!', 'success');
    await carregarOficinasAdmin();
  } catch (err) {
    showToast(err.message || 'Erro ao alterar disponibilidade da oficina.', 'error');
    await carregarOficinasAdmin();
  }
};

window.carregarOficinasAdmin = async function() {
  const selFiltro = document.getElementById('oficinas-filtro-evento');
  const eventoIdFiltro = selFiltro ? selFiltro.value : '';

  try {
    let url = '/admin/oficinas';
    if (eventoIdFiltro !== '') {
      url += `?evento_id=${encodeURIComponent(eventoIdFiltro)}`;
    }
    const res = await API.request(url);
    listaEventosAdmin = Array.isArray(res?.eventos) ? res.eventos : [];
    listaOficinasAdmin = Array.isArray(res?.oficinas) ? res.oficinas : [];

    if (res?.config && typeof res.config.aba_participante_visivel === 'boolean') {
      atualizarUIChaveAbaParticipante(res.config.aba_participante_visivel);
    }

    popularSelectEventos(eventoIdFiltro);
    atualizarKPIsOficinas(res?.resumo || {});
    renderizarCardsOficinasAdmin();

    // Se o modal de inscritos estiver aberto, atualizar a oficina em foco
    if (oficinaSelecionadaModal) {
      const atualizada = listaOficinasAdmin.find(o => o.id === oficinaSelecionadaModal.id);
      if (atualizada) {
        oficinaSelecionadaModal = atualizada;
        renderizarTabelaInscritosModal(atualizada);
      }
    }
  } catch (err) {
    console.error('Erro ao carregar oficinas:', err);
    showToast(err.message || 'Erro ao carregar oficinas.', 'error');
  }
};

function popularSelectEventos(valorSelecionado) {
  const selFiltro = document.getElementById('oficinas-filtro-evento');
  const selModal = document.getElementById('oficina-evento-id');

  if (selFiltro) {
    const opcoes = [`<option value="">Todos os Eventos (${listaEventosAdmin.length})</option>`];
    listaEventosAdmin.forEach(ev => {
      opcoes.push(`<option value="${ev.id}">${escapeHtml(ev.titulo)}${!ev.ativo ? ' (Inativo)' : ''}</option>`);
    });
    selFiltro.innerHTML = opcoes.join('');
    selFiltro.value = valorSelecionado !== undefined && valorSelecionado !== null ? String(valorSelecionado) : '';
  }

  if (selModal) {
    if (listaEventosAdmin.length === 0) {
      selModal.innerHTML = `<option value="">Nenhum evento cadastrado</option>`;
    } else {
      selModal.innerHTML = listaEventosAdmin.map(ev =>
        `<option value="${ev.id}">${escapeHtml(ev.titulo)}${!ev.ativo ? ' (Inativo)' : ''}</option>`
      ).join('');
    }
  }
}

function atualizarKPIsOficinas(resumo) {
  const elTotal = document.getElementById('of-kpi-total');
  const elVagas = document.getElementById('of-kpi-vagas');
  const elOcupadas = document.getElementById('of-kpi-ocupadas');
  const elDisponiveis = document.getElementById('of-kpi-disponiveis');

  if (elTotal) elTotal.textContent = resumo.total_oficinas || 0;
  if (elVagas) elVagas.textContent = resumo.total_vagas || 0;
  if (elOcupadas) elOcupadas.textContent = resumo.total_inscritos || 0;
  if (elDisponiveis) elDisponiveis.textContent = resumo.total_vagas_disponiveis || 0;
}

window.renderizarCardsOficinasAdmin = function() {
  const container = document.getElementById('oficinas-cards-container');
  if (!container) return;

  const busca = (document.getElementById('oficinas-busca-input')?.value || '').toLowerCase().trim();
  const filtradas = listaOficinasAdmin.filter(o => {
    if (!busca) return true;
    return (
      (o.titulo || '').toLowerCase().includes(busca) ||
      (o.ministrante || '').toLowerCase().includes(busca) ||
      (o.evento_titulo || '').toLowerCase().includes(busca) ||
      (o.local || '').toLowerCase().includes(busca)
    );
  });

  if (filtradas.length === 0) {
    container.innerHTML = `
      <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 3rem 1.5rem; border: 1px dashed var(--border-color);">
        <div style="color: #64748B; margin-bottom: 0.6rem; display: flex; justify-content: center;">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </div>
        <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--text-main); margin: 0 0 0.3rem 0;">Nenhuma oficina encontrada</h3>
        <p style="font-size: 0.86rem; color: var(--text-muted); margin: 0 0 1.1rem 0;">Cadastre oficinas vinculadas ao evento para que os participantes possam se inscrever.</p>
        <button type="button" class="btn btn-primary btn-sm" onclick="abrirModalNovaOficina()">+ Cadastrar Primeira Oficina</button>
      </div>
    `;
    return;
  }

  container.innerHTML = filtradas.map(of => {
    const pct = Math.min(100, Math.max(0, Number(of.percentual_ocupacao || 0)));
    const esgotada = of.esgotada;
    const barColor = esgotada
      ? 'linear-gradient(90deg, #DC2626 0%, #B91C1C 100%)'
      : pct >= 80
        ? 'linear-gradient(90deg, #F59E0B 0%, #EA580C 100%)'
        : 'linear-gradient(90deg, #00B894 0%, #059669 100%)';

    let badgeStatus = `<span class="badge badge-success">Disponível</span>`;
    if (!of.ativa) {
      badgeStatus = `<span class="badge" style="background:#F1F5F9; color:#475569;">Oculta para Participantes</span>`;
    } else if (esgotada) {
      badgeStatus = `<span class="badge badge-danger">Vagas Esgotadas</span>`;
    }

    return `
      <div class="oficina-admin-card" style="${!of.ativa ? 'opacity: 0.85;' : ''}">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.55rem;">
            <span class="badge" style="background: #EFF6FF; color: #1D4ED8; font-weight: 700; font-size: 0.72rem;">
              ${escapeHtml(of.evento_titulo)}
            </span>
            <div style="display: inline-flex; align-items: center; gap: 0.45rem;">
              ${badgeStatus}
              <label class="toggle-switch toggle-switch-sm" title="Disponibilizar ou ocultar esta oficina na aba do participante">
                <input type="checkbox" ${of.ativa ? 'checked' : ''} onchange="alternarDisponibilidadeOficina(${of.id}, this.checked)">
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <h3 style="font-size: 1.12rem; font-weight: 800; color: var(--text-main); margin: 0 0 0.35rem 0; line-height: 1.3;">
            ${escapeHtml(of.titulo)}
          </h3>

          ${of.descricao ? `<p style="font-size: 0.84rem; color: var(--text-muted); margin: 0 0 0.5rem 0; line-height: 1.45;">${escapeHtml(of.descricao)}</p>` : ''}

          ${(of.ministrante || of.foto_ministrante) ? `
            <div class="oficina-admin-ministrante-card">
              <div class="oficina-admin-ministrante-avatar">
                ${of.foto_ministrante 
                  ? `<img src="${escapeHtml(of.foto_ministrante)}" alt="${escapeHtml(of.ministrante || 'Ministrante')}" loading="lazy">` 
                  : SVG_OFICINAS.usuario
                }
              </div>
              <div class="oficina-admin-ministrante-info">
                <span class="oficina-admin-ministrante-label">Ministrante</span>
                <strong class="oficina-admin-ministrante-name">${escapeHtml(of.ministrante || 'Não informado')}</strong>
              </div>
            </div>
          ` : ''}

          <div class="oficina-meta-list" style="margin-top: 0.55rem;">
            ${of.horario ? `<div class="oficina-meta-item">${SVG_OFICINAS.relogio}<span><strong>Horário:</strong> ${escapeHtml(of.horario)}</span></div>` : ''}
            ${of.local ? `<div class="oficina-meta-item">${SVG_OFICINAS.pin}<span><strong>Local:</strong> ${escapeHtml(of.local)}</span></div>` : ''}
          </div>
        </div>

        <div>
          <!-- Controle de Vagas -->
          <div style="background: #F8FAFC; border: 1px solid var(--border-color); border-radius: 12px; padding: 0.85rem; margin-bottom: 0.9rem;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 0.82rem;">
              <span style="font-weight: 700; color: var(--text-main);" class="tabular-nums">
                <strong>${of.vagas_ocupadas}</strong> / ${of.capacidade} vagas ocupadas
              </span>
              <span class="tabular-nums" style="font-weight: 800; color: ${esgotada ? '#DC2626' : '#059669'};">
                ${esgotada ? '0 vagas restantes' : `${of.vagas_disponiveis} disponíveis`}
              </span>
            </div>
            <div class="oficina-vagas-track">
              <div class="oficina-vagas-fill" style="width: ${pct}%; background: ${barColor};"></div>
            </div>
          </div>

          <!-- Botões de Ação -->
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <button type="button" class="btn btn-primary btn-sm" style="flex: 1; justify-content: center; display: inline-flex; align-items: center; gap: 0.4rem; background: #004C50; border-color: #004C50;" onclick="abrirModalInscritosOficina(${of.id})">
              ${SVG_OFICINAS.usuarios}
              <span>Inscritos (${of.vagas_ocupadas})</span>
            </button>
            <button type="button" class="btn btn-outline btn-sm" style="display: inline-flex; align-items: center; gap: 0.3rem;" onclick="abrirModalEditarOficina(${of.id})">
              ${SVG_OFICINAS.editar}
              <span>Editar</span>
            </button>
            <button type="button" class="btn btn-danger btn-sm" style="display: inline-flex; align-items: center;" title="Excluir oficina" onclick="excluirOficinaAdmin(${of.id})">
              ${SVG_OFICINAS.excluir}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
};

window.uploadFotoMinistrante = async function(event) {
  const file = event.target?.files?.[0];
  if (!file) return;

  const btnUpload = document.getElementById('btn-upload-foto-ministrante');
  const originalBtnText = btnUpload ? btnUpload.innerHTML : '';
  const hintEl = document.getElementById('oficina-foto-hint');

  if (btnUpload) {
    btnUpload.innerHTML = `<span>Enviando para o Supabase...</span>`;
    btnUpload.style.pointerEvents = 'none';
  }
  if (hintEl) hintEl.textContent = 'Enviando imagem para o Supabase Storage...';

  try {
    const formData = new FormData();
    formData.append('file', file);

    let res;
    try {
      res = await API.request('/admin/oficinas/upload', {
        method: 'POST',
        body: formData
      });
    } catch (e) {
      // Fallback para endpoint de upload geral caso necessário
      res = await API.request('/admin/eventos/upload', {
        method: 'POST',
        body: formData
      });
    }

    if (res?.url) {
      document.getElementById('oficina-foto-ministrante').value = res.url;
      const imgEl = document.getElementById('oficina-foto-img');
      const svgEl = document.getElementById('oficina-foto-placeholder-svg');
      const btnRemover = document.getElementById('btn-remover-foto-ministrante');

      if (imgEl) {
        imgEl.src = res.url;
        imgEl.style.display = 'block';
      }
      if (svgEl) svgEl.style.display = 'none';
      if (btnRemover) btnRemover.style.display = 'inline-block';
      if (hintEl) hintEl.textContent = 'Foto enviada com sucesso para o Supabase Storage!';

      showToast('Foto do ministrante enviada com sucesso!', 'success');
    }
  } catch (err) {
    console.error('Erro no upload de foto:', err);
    showToast(err.message || 'Erro ao enviar foto para o Supabase Storage.', 'error');
    if (hintEl) hintEl.textContent = 'Erro no envio da foto. Tente novamente.';
  } finally {
    if (btnUpload) {
      btnUpload.innerHTML = originalBtnText;
      btnUpload.style.pointerEvents = 'auto';
    }
    event.target.value = '';
  }
};

window.removerFotoMinistrante = function() {
  const inputHidden = document.getElementById('oficina-foto-ministrante');
  const imgEl = document.getElementById('oficina-foto-img');
  const svgEl = document.getElementById('oficina-foto-placeholder-svg');
  const btnRemover = document.getElementById('btn-remover-foto-ministrante');
  const hintEl = document.getElementById('oficina-foto-hint');
  const inputFile = document.getElementById('oficina-foto-input');

  if (inputHidden) inputHidden.value = '';
  if (inputFile) inputFile.value = '';
  if (imgEl) {
    imgEl.src = '';
    imgEl.style.display = 'none';
  }
  if (svgEl) svgEl.style.display = 'block';
  if (btnRemover) btnRemover.style.display = 'none';
  if (hintEl) hintEl.textContent = 'Formatos: JPG, PNG, WEBP. Enviada para o Supabase Storage.';
};

window.abrirModalNovaOficina = function() {
  if (listaEventosAdmin.length === 0) {
    showToast('Cadastre um evento primeiro antes de criar oficinas.', 'warning');
    return;
  }

  document.getElementById('form-oficina')?.reset();
  document.getElementById('oficina-id').value = '';
  document.getElementById('modal-oficina-titulo').textContent = 'Nova Oficina do Evento';
  document.getElementById('oficina-capacidade').value = '30';
  document.getElementById('oficina-ativa').checked = true;
  removerFotoMinistrante();

  const filtroEv = document.getElementById('oficinas-filtro-evento')?.value;
  const selEv = document.getElementById('oficina-evento-id');
  if (selEv) {
    if (filtroEv) {
      selEv.value = filtroEv;
    } else if (listaEventosAdmin.length > 0) {
      const evAtivo = listaEventosAdmin.find(e => e.ativo) || listaEventosAdmin[0];
      selEv.value = evAtivo.id;
    }
  }

  document.getElementById('modal-oficina').style.display = 'flex';
};

window.abrirModalEditarOficina = function(oficinaId) {
  const of = listaOficinasAdmin.find(x => x.id === oficinaId);
  if (!of) return;

  document.getElementById('oficina-id').value = of.id;
  document.getElementById('oficina-evento-id').value = of.evento_id;
  document.getElementById('oficina-titulo').value = of.titulo || '';
  document.getElementById('oficina-ministrante').value = of.ministrante || '';
  document.getElementById('oficina-capacidade').value = of.capacidade || 30;
  document.getElementById('oficina-horario').value = of.horario || '';
  document.getElementById('oficina-local').value = of.local || '';
  document.getElementById('oficina-descricao').value = of.descricao || '';
  document.getElementById('oficina-ativa').checked = Boolean(of.ativa);

  // Configura visual da foto
  const inputHidden = document.getElementById('oficina-foto-ministrante');
  const imgEl = document.getElementById('oficina-foto-img');
  const svgEl = document.getElementById('oficina-foto-placeholder-svg');
  const btnRemover = document.getElementById('btn-remover-foto-ministrante');
  const hintEl = document.getElementById('oficina-foto-hint');

  if (of.foto_ministrante) {
    if (inputHidden) inputHidden.value = of.foto_ministrante;
    if (imgEl) {
      imgEl.src = of.foto_ministrante;
      imgEl.style.display = 'block';
    }
    if (svgEl) svgEl.style.display = 'none';
    if (btnRemover) btnRemover.style.display = 'inline-block';
    if (hintEl) hintEl.textContent = 'Foto cadastrada no Supabase Storage.';
  } else {
    removerFotoMinistrante();
  }

  document.getElementById('modal-oficina-titulo').textContent = 'Editar Oficina';
  document.getElementById('modal-oficina').style.display = 'flex';
};

window.fecharModalOficina = function() {
  document.getElementById('modal-oficina').style.display = 'none';
};

window.salvarOficinaAdmin = async function(e) {
  e.preventDefault();
  const id = document.getElementById('oficina-id').value;
  const eventoId = parseInt(document.getElementById('oficina-evento-id').value, 10);

  if (!eventoId || isNaN(eventoId)) {
    showToast('Selecione o evento vinculado à oficina.', 'warning');
    return;
  }

  const payload = {
    evento_id: eventoId,
    titulo: document.getElementById('oficina-titulo').value.trim(),
    ministrante: document.getElementById('oficina-ministrante').value.trim() || null,
    foto_ministrante: document.getElementById('oficina-foto-ministrante')?.value.trim() || null,
    capacidade: parseInt(document.getElementById('oficina-capacidade').value || '30', 10),
    horario: document.getElementById('oficina-horario').value.trim() || null,
    local: document.getElementById('oficina-local').value.trim() || null,
    descricao: document.getElementById('oficina-descricao').value.trim() || null,
    ativa: document.getElementById('oficina-ativa').checked
  };

  try {
    if (id) {
      await API.request(`/admin/oficinas/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast('Oficina atualizada com sucesso!', 'success');
    } else {
      await API.request('/admin/oficinas', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('Oficina criada com sucesso!', 'success');
    }
    fecharModalOficina();
    await carregarOficinasAdmin();
  } catch (err) {
    showToast(err.message || 'Erro ao salvar oficina.', 'error');
  }
};

window.excluirOficinaAdmin = async function(oficinaId) {
  const of = listaOficinasAdmin.find(x => x.id === oficinaId);
  if (!of) return;

  if (!confirm(`Deseja realmente excluir a oficina "${of.titulo}"? As inscrições vinculadas a ela também serão removidas.`)) {
    return;
  }

  try {
    await API.request(`/admin/oficinas/${oficinaId}`, { method: 'DELETE' });
    showToast('Oficina excluída.', 'success');
    await carregarOficinasAdmin();
  } catch (err) {
    showToast(err.message || 'Erro ao excluir oficina.', 'error');
  }
};

// ==============================================================
// Modal de Lista de Inscritos & Vinculação Manual
// ==============================================================
window.abrirModalInscritosOficina = async function(oficinaId) {
  const of = listaOficinasAdmin.find(x => x.id === oficinaId);
  if (!of) return;

  oficinaSelecionadaModal = of;
  renderizarTabelaInscritosModal(of);
  document.getElementById('modal-inscritos-oficina').style.display = 'flex';

  await carregarParticipantesElegiveisSelect(of.evento_id, of.id);
};

window.fecharModalInscritosOficina = function() {
  oficinaSelecionadaModal = null;
  document.getElementById('modal-inscritos-oficina').style.display = 'none';
};

async function carregarParticipantesElegiveisSelect(eventoId, oficinaId) {
  const sel = document.getElementById('select-adicionar-participante-oficina');
  if (!sel) return;
  sel.innerHTML = `<option value="">Carregando participantes inscritos no evento...</option>`;

  try {
    const res = await API.request(`/admin/oficinas/evento/${eventoId}/participantes-elegiveis`);
    const parts = Array.isArray(res?.participantes) ? res.participantes : [];

    if (parts.length === 0) {
      sel.innerHTML = `<option value="">Nenhum participante inscrito neste evento</option>`;
      return;
    }

    const opcoes = [`<option value="">Selecione um participante inscrito no evento...</option>`];
    parts.forEach(p => {
      const jaNesta = p.oficina_atual && p.oficina_atual.oficina_id === oficinaId;
      if (jaNesta) return;
      const infoOficina = p.oficina_atual
        ? ` [Atual: ${p.oficina_atual.oficina_titulo}]`
        : ' [Sem oficina]';
      opcoes.push(
        `<option value="${p.usuario_id}">${escapeHtml(p.nome)} (${escapeHtml(p.cpf || p.email || '')})${escapeHtml(infoOficina)}</option>`
      );
    });
    sel.innerHTML = opcoes.join('');
  } catch (err) {
    sel.innerHTML = `<option value="">Erro ao carregar participantes do evento</option>`;
  }
}

function renderizarTabelaInscritosModal(of) {
  document.getElementById('modal-insc-evento-badge').textContent = of.evento_titulo;
  document.getElementById('modal-insc-titulo').textContent = of.titulo;
  document.getElementById('modal-insc-subtitulo').textContent = `${of.vagas_ocupadas} de ${of.capacidade} vagas ocupadas (${of.vagas_disponiveis} disponíveis)`;

  const tbody = document.getElementById('modal-inscritos-tbody');
  if (!tbody) return;

  const inscritos = of.inscritos || [];
  if (inscritos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 1.75rem; color: var(--text-muted);">Nenhum participante inscrito nesta oficina até o momento.</td></tr>`;
    return;
  }

  tbody.innerHTML = inscritos.map((ins, idx) => {
    const dt = ins.created_at ? new Date(ins.created_at).toLocaleString('pt-BR') : '-';
    return `
      <tr>
        <td class="tabular-nums" style="font-weight: 700; color: var(--text-muted);">${idx + 1}</td>
        <td>
          <strong>${escapeHtml(ins.nome)}</strong>
          <div style="font-size: 0.76rem; color: var(--text-muted);">${escapeHtml(ins.email)}</div>
        </td>
        <td class="tabular-nums" style="font-size: 0.82rem;">
          ${escapeHtml(ins.cpf || '-')}
          ${ins.telefone ? `<div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(ins.telefone)}</div>` : ''}
        </td>
        <td class="tabular-nums" style="font-size: 0.8rem; color: var(--text-muted);">${dt}</td>
        <td style="text-align: right;">
          <button type="button" class="btn btn-outline btn-sm" style="color: #DC2626; border-color: #FCA5A5; font-size: 0.74rem; padding: 0.2rem 0.55rem;" onclick="removerInscritoOficinaAdmin(${of.id}, ${ins.usuario_id}, '${escapeHtml(ins.nome).replace(/'/g, "\\'")}')">
            Liberar Vaga
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.vincularParticipanteOficinaManual = async function() {
  if (!oficinaSelecionadaModal) return;
  const sel = document.getElementById('select-adicionar-participante-oficina');
  const usuarioId = parseInt(sel?.value || '0', 10);

  if (!usuarioId) {
    showToast('Selecione um participante da lista para adicionar.', 'warning');
    return;
  }

  try {
    const res = await API.request(`/admin/oficinas/${oficinaSelecionadaModal.id}/inscritos`, {
      method: 'POST',
      body: JSON.stringify({ usuario_id: usuarioId })
    });
    showToast(res.mensagem || 'Participante inscrito na oficina!', 'success');
    await carregarOficinasAdmin();
    await carregarParticipantesElegiveisSelect(oficinaSelecionadaModal.evento_id, oficinaSelecionadaModal.id);
  } catch (err) {
    showToast(err.message || 'Erro ao adicionar participante na oficina.', 'error');
  }
};

window.removerInscritoOficinaAdmin = async function(oficinaId, usuarioId, nome) {
  if (!confirm(`Deseja remover "${nome}" desta oficina e liberar a vaga?`)) return;

  try {
    const res = await API.request(`/admin/oficinas/${oficinaId}/inscritos/${usuarioId}`, {
      method: 'DELETE'
    });
    showToast(res.mensagem || 'Vaga liberada com sucesso!', 'success');
    await carregarOficinasAdmin();
    if (oficinaSelecionadaModal) {
      await carregarParticipantesElegiveisSelect(oficinaSelecionadaModal.evento_id, oficinaSelecionadaModal.id);
    }
  } catch (err) {
    showToast(err.message || 'Erro ao remover participante da oficina.', 'error');
  }
};

window.exportarInscritosOficinaCSV = function() {
  if (!oficinaSelecionadaModal) return;
  const inscritos = oficinaSelecionadaModal.inscritos || [];
  if (inscritos.length === 0) {
    showToast('Nenhum inscrito para exportar.', 'warning');
    return;
  }

  const headers = [' Ordem', 'Nome Completo', 'CPF', 'E-mail', 'Telefone', 'Oficina', 'Evento', 'Data Inscricao'];
  const rows = inscritos.map((i, idx) => [
    idx + 1,
    i.nome || '',
    i.cpf || '',
    i.email || '',
    i.telefone || '',
    oficinaSelecionadaModal.titulo,
    oficinaSelecionadaModal.evento_titulo,
    i.created_at ? new Date(i.created_at).toLocaleString('pt-BR') : ''
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'));

  const csvContent = '\ufeff' + [headers.join(';'), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `inscritos_oficina_${oficinaSelecionadaModal.id}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

window.imprimirListaPresencaOficina = function() {
  if (!oficinaSelecionadaModal) return;
  const of = oficinaSelecionadaModal;
  const inscritos = of.inscritos || [];

  const win = window.open('', '_blank');
  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Lista de Presença - ${escapeHtml(of.titulo)}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #0f172a; padding: 24px; }
        h1 { margin: 0 0 4px 0; font-size: 20px; color: #00363A; }
        p.sub { margin: 0 0 16px 0; font-size: 12px; color: #475569; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
        th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
        th { background: #f1f5f9; font-weight: bold; }
      </style>
    </head>
    <body>
      <h1>Lista de Inscritos — ${escapeHtml(of.titulo)}</h1>
      <p class="sub">
        <strong>Evento:</strong> ${escapeHtml(of.evento_titulo)}
        ${of.ministrante ? ` | <strong>Ministrante:</strong> ${escapeHtml(of.ministrante)}` : ''}
        ${of.horario ? ` | <strong>Horário:</strong> ${escapeHtml(of.horario)}` : ''}
        ${of.local ? ` | <strong>Local:</strong> ${escapeHtml(of.local)}` : ''}
        | <strong>Ocupação:</strong> ${of.vagas_ocupadas}/${of.capacidade} vagas
      </p>
      <table>
        <thead>
          <tr>
            <th style="width: 36px;">#</th>
            <th>Nome do Participante</th>
            <th>CPF</th>
            <th>Telefone</th>
            <th style="width: 180px;">Assinatura / Presença</th>
          </tr>
        </thead>
        <tbody>
          ${inscritos.map((i, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td><strong>${escapeHtml(i.nome)}</strong></td>
              <td>${escapeHtml(i.cpf || '-')}</td>
              <td>${escapeHtml(i.telefone || '-')}</td>
              <td></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </body>
    </html>
  `;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
};
