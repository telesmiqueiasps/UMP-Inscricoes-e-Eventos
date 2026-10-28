let gincanaAtual = null;
let adminPollingInterval = null;

// Inicialização automática ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
  // Garantir que admin está autenticado antes de iniciar
  const token = API.getToken();
  const user = API.getUser();
  if (token && user && user.is_admin) {
    if (typeof window.aplicarRestricoesPerfilAdmin === 'function') {
      window.aplicarRestricoesPerfilAdmin(user);
    }
    inicializarGincanaAdmin();
  }
});

async function inicializarGincanaAdmin() {
  await carregarGincanaAdmin();
  atualizarEstiloRadiosEquipe();

  // Polling para sincronizar pontuações caso múltiplos administradores lancem pontos
  if (adminPollingInterval) clearInterval(adminPollingInterval);
  adminPollingInterval = setInterval(() => {
    carregarGincanaAdmin(true);
  }, 4000);
}

async function carregarGincanaAdmin(silencioso = false) {
  try {
    const data = await API.request('/gincana/ativa');
    if (!data) return;

    gincanaAtual = data;
    renderizarPainelAdmin(data);
  } catch (err) {
    if (!silencioso) {
      console.error('Erro ao carregar dados da gincana:', err);
      showToast('Erro ao sincronizar dados da gincana.', 'error');
    }
  }
}

function renderizarPainelAdmin(data) {
  // 1. Título
  const pageTitulo = document.getElementById('page-gincana-titulo');
  if (pageTitulo && data.titulo) {
    pageTitulo.textContent = data.titulo;
  }

  // 2. Link Público
  const linkPublicoEl = document.getElementById('link-abrir-placar');
  if (linkPublicoEl) {
    const urlPublica = obterUrlPublicaPlacar(data.id);
    linkPublicoEl.href = urlPublica;
  }

  // 3. Equipe 1
  const eq1 = data.equipe_1;
  const box1 = document.getElementById('box-admin-eq1');
  const badge1 = document.getElementById('badge-admin-eq1');
  const titulo1 = document.getElementById('titulo-admin-eq1');
  const score1 = document.getElementById('score-admin-eq1');
  const pct1 = document.getElementById('pct-admin-eq1');
  const radio1 = document.getElementById('radio-nome-eq1');
  const lider1 = document.getElementById('status-lider-eq1');

  if (eq1) {
    if (badge1) {
      badge1.textContent = eq1.nome;
      badge1.style.background = `${eq1.cor}18`;
      badge1.style.color = eq1.cor;
      badge1.style.border = `1px solid ${eq1.cor}40`;
    }
    if (titulo1) titulo1.textContent = eq1.nome;
    if (score1) {
      score1.textContent = eq1.pontos;
      score1.style.color = eq1.cor;
    }
    if (pct1) pct1.textContent = `${data.porcentagem_eq1}% do total`;
    if (radio1) radio1.textContent = eq1.nome;
    if (lider1) lider1.style.display = data.lider === 1 ? 'inline-flex' : 'none';
    if (box1) {
      box1.style.borderColor = data.lider === 1 ? '#F59E0B' : `${eq1.cor}50`;
    }
  }

  // 4. Equipe 2
  const eq2 = data.equipe_2;
  const box2 = document.getElementById('box-admin-eq2');
  const badge2 = document.getElementById('badge-admin-eq2');
  const titulo2 = document.getElementById('titulo-admin-eq2');
  const score2 = document.getElementById('score-admin-eq2');
  const pct2 = document.getElementById('pct-admin-eq2');
  const radio2 = document.getElementById('radio-nome-eq2');
  const lider2 = document.getElementById('status-lider-eq2');

  if (eq2) {
    if (badge2) {
      badge2.textContent = eq2.nome;
      badge2.style.background = `${eq2.cor}18`;
      badge2.style.color = eq2.cor;
      badge2.style.border = `1px solid ${eq2.cor}40`;
    }
    if (titulo2) titulo2.textContent = eq2.nome;
    if (score2) {
      score2.textContent = eq2.pontos;
      score2.style.color = eq2.cor;
    }
    if (pct2) pct2.textContent = `${data.porcentagem_eq2}% do total`;
    if (radio2) radio2.textContent = eq2.nome;
    if (lider2) lider2.style.display = data.lider === 2 ? 'inline-flex' : 'none';
    if (box2) {
      box2.style.borderColor = data.lider === 2 ? '#F59E0B' : `${eq2.cor}50`;
    }
  }

  // 5. Histórico de Tarefas
  renderizarTabelaPontos(data.historico);
}

function renderizarTabelaPontos(historico) {
  const tbody = document.getElementById('tabela-pontos-body');
  if (!tbody) return;

  if (!historico || historico.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          Nenhuma tarefa ou pontuação foi lançada nesta gincana ainda.
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  historico.forEach(p => {
    const dataObj = new Date(p.created_at);
    const hora = dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const dataStr = dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const ptsTexto = p.pontos > 0 ? `+${p.pontos}` : `${p.pontos}`;
    const ptsCor = p.pontos >= 0 ? '#10B981' : '#EF4444';
    const autorNome = p.usuario_nome || 'Admin';

    html += `
      <tr>
        <td style="white-space: nowrap; font-size: 0.85rem; color: var(--text-muted);">
          ${dataStr} às ${hora}
        </td>
        <td>
          <span style="display: inline-block; padding: 0.25rem 0.65rem; border-radius: 6px; font-size: 0.8rem; font-weight: 700; background: ${p.equipe_cor}15; color: ${p.equipe_cor}; border: 1px solid ${p.equipe_cor}40;">
            ${escapeHTML(p.equipe_nome)}
          </span>
        </td>
        <td style="font-weight: 600;">
          ${escapeHTML(p.titulo)}
        </td>
        <td style="color: var(--text-muted); font-size: 0.85rem;">
          ${p.descricao ? escapeHTML(p.descricao) : '<span style="opacity: 0.5;">-</span>'}
        </td>
        <td>
          <span style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; font-weight: 600; color: #475569; background: #F1F5F9; padding: 0.2rem 0.6rem; border-radius: 9999px; border: 1px solid #E2E8F0;" title="Lançado por ${escapeHTML(autorNome)}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>${escapeHTML(autorNome)}</span>
          </span>
        </td>
        <td style="text-align: right; font-weight: 800; font-size: 1rem; color: ${ptsCor};">
          ${ptsTexto} pts
        </td>
        <td style="text-align: center;">
          <button class="btn btn-outline btn-sm" onclick="deletarPonto(${p.id})" title="Excluir lançamento" style="color: #DC2626; border-color: #FECACA; padding: 0.3rem 0.5rem;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// Modal de Lançamento de Pontos por Equipe
function abrirModalPontuarEquipe(equipeNum) {
  if (!gincanaAtual) return;

  const equipe = equipeNum === 2 ? gincanaAtual.equipe_2 : gincanaAtual.equipe_1;
  const nomeEq = equipe ? equipe.nome : (equipeNum === 2 ? 'Equipe 2' : 'Equipe 1');
  const corEq = equipe ? equipe.cor : (equipeNum === 2 ? '#DC2626' : '#2563EB');

  const inputEquipe = document.getElementById('modal-ponto-equipe');
  if (inputEquipe) inputEquipe.value = equipeNum;

  const badge = document.getElementById('modal-pontuar-badge');
  if (badge) {
    badge.textContent = nomeEq;
    badge.style.background = `${corEq}18`;
    badge.style.color = corEq;
    badge.style.border = `1px solid ${corEq}40`;
  }

  // Nome do usuário logado que está realizando o lançamento
  const user = API.getUser();
  const autorEl = document.getElementById('modal-pontuar-autor-nome');
  if (autorEl) {
    autorEl.textContent = user ? (user.nome || user.email || 'Admin') : 'Admin';
  }

  // Limpar campos anteriores
  const inputTitulo = document.getElementById('modal-ponto-titulo');
  const inputValor = document.getElementById('modal-ponto-valor');
  const inputDesc = document.getElementById('modal-ponto-descricao');
  if (inputTitulo) inputTitulo.value = '';
  if (inputValor) inputValor.value = '';
  if (inputDesc) inputDesc.value = '';

  const modal = document.getElementById('modal-lancar-pontos');
  if (modal) {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    if (inputTitulo) {
      setTimeout(() => inputTitulo.focus(), 100);
    }
  }
}

function fecharModalPontuarEquipe() {
  const modal = document.getElementById('modal-lancar-pontos');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
}

function fecharModalPontuarBackdrop(e) {
  if (e && e.target && e.target.id === 'modal-lancar-pontos') {
    fecharModalPontuarEquipe();
  }
}

function preencherTarefaModal(nome, pts) {
  const t = document.getElementById('modal-ponto-titulo');
  const v = document.getElementById('modal-ponto-valor');
  const d = document.getElementById('modal-ponto-descricao');
  if (t) t.value = nome;
  if (v) v.value = pts;
  if (d) d.focus();
}

function definirPontosModal(pts) {
  const v = document.getElementById('modal-ponto-valor');
  if (v) {
    v.value = pts;
    v.focus();
  }
}

async function salvarPontuacaoModal(e) {
  e.preventDefault();
  if (!gincanaAtual) return;

  const equipeInput = document.getElementById('modal-ponto-equipe');
  const equipe = equipeInput ? parseInt(equipeInput.value) : 1;
  const titulo = document.getElementById('modal-ponto-titulo').value.trim();
  const pontos = parseInt(document.getElementById('modal-ponto-valor').value);
  const descricao = document.getElementById('modal-ponto-descricao').value.trim();

  if (!titulo) {
    showToast('Informe o nome da tarefa ou prova.', 'warning');
    return;
  }
  if (isNaN(pontos)) {
    showToast('Informe a quantidade de pontos.', 'warning');
    return;
  }

  const submitBtn = document.getElementById('btn-modal-salvar-ponto');
  const originalHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = 'Gravando...';

  try {
    const updated = await API.request(`/admin/gincana/${gincanaAtual.id}/pontos`, {
      method: 'POST',
      body: JSON.stringify({
        equipe,
        titulo,
        pontos,
        descricao: descricao || null
      })
    });

    const nomeEquipe = (equipe === 2 ? gincanaAtual.equipe_2 : gincanaAtual.equipe_1)?.nome || `Equipe ${equipe}`;
    showToast(`Pontuação lançada para ${nomeEquipe}! (${pontos > 0 ? '+' : ''}${pontos} pts)`, 'success');
    
    fecharModalPontuarEquipe();

    if (updated) {
      gincanaAtual = updated;
      renderizarPainelAdmin(updated);
    } else {
      carregarGincanaAdmin();
    }
  } catch (err) {
    showToast(err.message || 'Erro ao lançar pontuação.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalHtml;
  }
}

async function deletarPonto(id) {
  if (!confirm('Deseja realmente remover este lançamento de pontos? O placar será recalculado.')) {
    return;
  }

  try {
    await API.request(`/admin/gincana/pontos/${id}`, {
      method: 'DELETE'
    });

    showToast('Lançamento removido com sucesso!', 'success');
    carregarGincanaAdmin();
  } catch (err) {
    showToast(err.message || 'Erro ao remover pontuação.', 'error');
  }
}

async function zerarGincanaComConfirmacao() {
  if (!gincanaAtual) return;
  const confirmacao = prompt('ATENÇÃO: Isso irá apagar TODAS as tarefas e pontuações registradas nesta gincana.\n\nDigite ZERAR para confirmar:');
  if (confirmacao !== 'ZERAR') {
    return;
  }

  try {
    const updated = await API.request(`/admin/gincana/${gincanaAtual.id}/zerar`, {
      method: 'POST'
    });

    showToast('O placar da gincana foi zerado com sucesso!', 'success');
    if (updated) {
      gincanaAtual = updated;
      renderizarPainelAdmin(updated);
    } else {
      carregarGincanaAdmin();
    }
  } catch (err) {
    showToast(err.message || 'Erro ao zerar gincana.', 'error');
  }
}

// Aliases para compatibilidade retroativa
function preencherTarefa(nome, pts) { preencherTarefaModal(nome, pts); }
function definirPontos(pts) { definirPontosModal(pts); }
function selecionarEquipeParaPontuar(num) { abrirModalPontuarEquipe(num); }
function salvarPontuacao(e) { salvarPontuacaoModal(e); }
function atualizarEstiloRadiosEquipe() {}

// Modal de Configuração das Equipes
function abrirModalConfigEquipes() {
  if (!gincanaAtual) return;

  const tituloEl = document.getElementById('config-titulo-gincana');
  if (tituloEl) tituloEl.value = gincanaAtual.titulo || 'Gincana UMP';

  const n1 = gincanaAtual.equipe_1 ? gincanaAtual.equipe_1.nome : 'Equipe 1';
  const c1 = gincanaAtual.equipe_1 ? gincanaAtual.equipe_1.cor : '#2563EB';
  const nome1El = document.getElementById('config-nome-eq1');
  const cor1El = document.getElementById('config-cor-eq1');
  if (nome1El) nome1El.value = n1;
  if (cor1El) cor1El.value = c1;
  atualizarPreviewCorEq(1, c1);
  const b1 = document.getElementById('preview-badge-eq1');
  if (b1) b1.textContent = n1;

  const n2 = gincanaAtual.equipe_2 ? gincanaAtual.equipe_2.nome : 'Equipe 2';
  const c2 = gincanaAtual.equipe_2 ? gincanaAtual.equipe_2.cor : '#DC2626';
  const nome2El = document.getElementById('config-nome-eq2');
  const cor2El = document.getElementById('config-cor-eq2');
  if (nome2El) nome2El.value = n2;
  if (cor2El) cor2El.value = c2;
  atualizarPreviewCorEq(2, c2);
  const b2 = document.getElementById('preview-badge-eq2');
  if (b2) b2.textContent = n2;

  const modal = document.getElementById('modal-config-equipes');
  if (modal) {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
}

function fecharModalConfigEquipes() {
  const modal = document.getElementById('modal-config-equipes');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
}

function fecharModalConfigBackdrop(e) {
  if (e && e.target && e.target.id === 'modal-config-equipes') {
    fecharModalConfigEquipes();
  }
}

function atualizarPreviewCorEq(num, cor) {
  const badge = document.getElementById(`preview-badge-eq${num}`);
  if (badge) {
    badge.style.background = `${cor}18`;
    badge.style.color = cor;
    badge.style.border = `1px solid ${cor}40`;
  }
}

function definirCorPreset(num, cor) {
  const input = document.getElementById(`config-cor-eq${num}`);
  if (input) {
    input.value = cor;
    atualizarPreviewCorEq(num, cor);
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    fecharModalConfigEquipes();
    fecharModalPontuarEquipe();
  }
});

async function salvarConfiguracaoEquipes(e) {
  e.preventDefault();
  if (!gincanaAtual) return;

  const titulo = document.getElementById('config-titulo-gincana').value.trim();
  const nome1 = document.getElementById('config-nome-eq1').value.trim();
  const cor1 = document.getElementById('config-cor-eq1').value;
  const nome2 = document.getElementById('config-nome-eq2').value.trim();
  const cor2 = document.getElementById('config-cor-eq2').value;

  const btnSalvar = document.getElementById('btn-salvar-config');
  btnSalvar.disabled = true;
  btnSalvar.textContent = 'Salvando...';

  try {
    const updated = await API.request(`/admin/gincana/${gincanaAtual.id}/equipes`, {
      method: 'PUT',
      body: JSON.stringify({
        titulo,
        nome_equipe_1: nome1,
        cor_equipe_1: cor1,
        nome_equipe_2: nome2,
        cor_equipe_2: cor2
      })
    });

    showToast('Configurações das equipes salvas com sucesso!', 'success');
    fecharModalConfigEquipes();

    if (updated) {
      gincanaAtual = updated;
      renderizarPainelAdmin(updated);
      atualizarEstiloRadiosEquipe();
    } else {
      carregarGincanaAdmin();
    }
  } catch (err) {
    showToast(err.message || 'Erro ao salvar configuração das equipes.', 'error');
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.textContent = 'Salvar Alterações';
  }
}

// Helpers de Link Público
function obterUrlPublicaPlacar(gincanaId) {
  // Constrói URL pública apontando para /gincana.html
  const origin = window.location.origin;
  const pathname = window.location.pathname;

  // Se estiver em ambiente local com subpastas (ex: /frontend-admin/gincana.html)
  if (pathname.includes('/frontend-admin/')) {
    return `${origin}${pathname.replace('/frontend-admin/gincana.html', '/frontend-public/gincana.html')}`;
  }

  // Em produção no Netlify: a raiz / distribui o frontend-public
  return `${origin}/gincana.html`;
}

function copiarLinkPublico() {
  if (!gincanaAtual) return;
  const url = obterUrlPublicaPlacar(gincanaAtual.id);

  navigator.clipboard.writeText(url).then(() => {
    const label = document.getElementById('btn-copy-label');
    if (label) {
      label.textContent = 'Copiado!';
      setTimeout(() => {
        label.textContent = 'Copiar Link';
      }, 2500);
    }
    showToast('Link do placar público copiado para a área de transferência!', 'success');
  }).catch(() => {
    prompt('Copie o link público do placar:', url);
  });
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}
