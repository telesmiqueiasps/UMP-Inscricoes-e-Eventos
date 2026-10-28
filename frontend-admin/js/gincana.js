let gincanaAtual = null;
let adminPollingInterval = null;

// Inicialização automática ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
  // Garantir que admin está autenticado antes de iniciar
  const token = API.getToken();
  const user = API.getUser();
  if (token && user && user.is_admin) {
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
    if (lider1) lider1.style.display = data.lider === 1 ? 'inline' : 'none';
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
    if (lider2) lider2.style.display = data.lider === 2 ? 'inline' : 'none';
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
        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">
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

async function salvarPontuacao(e) {
  e.preventDefault();
  if (!gincanaAtual) return;

  const equipeRadio = document.querySelector('input[name="equipe_selecionada"]:checked');
  const equipe = equipeRadio ? parseInt(equipeRadio.value) : 1;
  const titulo = document.getElementById('ponto-titulo').value.trim();
  const pontos = parseInt(document.getElementById('ponto-valor').value);
  const descricao = document.getElementById('ponto-descricao').value.trim();

  if (!titulo) {
    showToast('Informe o nome da tarefa ou prova.', 'warning');
    return;
  }
  if (isNaN(pontos)) {
    showToast('Informe a quantidade de pontos.', 'warning');
    return;
  }

  const submitBtn = document.getElementById('btn-salvar-ponto');
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

    showToast(`Pontuação lançada com sucesso! (${pontos > 0 ? '+' : ''}${pontos} pts)`, 'success');
    
    // Limpar campos
    document.getElementById('ponto-titulo').value = '';
    document.getElementById('ponto-valor').value = '';
    document.getElementById('ponto-descricao').value = '';

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

// Helpers de Formulário
function preencherTarefa(nome, pts) {
  document.getElementById('ponto-titulo').value = nome;
  document.getElementById('ponto-valor').value = pts;
  document.getElementById('ponto-descricao').focus();
}

function definirPontos(pts) {
  document.getElementById('ponto-valor').value = pts;
}

function selecionarEquipeParaPontuar(num) {
  const radio = document.querySelector(`input[name="equipe_selecionada"][value="${num}"]`);
  if (radio) {
    radio.checked = true;
    atualizarEstiloRadiosEquipe();
  }
  document.getElementById('ponto-titulo').focus();
}

function atualizarEstiloRadiosEquipe() {
  const radio1 = document.querySelector('input[name="equipe_selecionada"][value="1"]');
  const radio2 = document.querySelector('input[name="equipe_selecionada"][value="2"]');
  const label1 = document.getElementById('label-radio-eq1');
  const label2 = document.getElementById('label-radio-eq2');

  const cor1 = (gincanaAtual && gincanaAtual.equipe_1) ? gincanaAtual.equipe_1.cor : '#2563EB';
  const cor2 = (gincanaAtual && gincanaAtual.equipe_2) ? gincanaAtual.equipe_2.cor : '#DC2626';

  if (label1 && radio1) {
    if (radio1.checked) {
      label1.style.borderColor = cor1;
      label1.style.background = `${cor1}15`;
      label1.style.color = cor1;
    } else {
      label1.style.borderColor = 'var(--border-color)';
      label1.style.background = 'transparent';
      label1.style.color = 'var(--text-main)';
    }
  }

  if (label2 && radio2) {
    if (radio2.checked) {
      label2.style.borderColor = cor2;
      label2.style.background = `${cor2}15`;
      label2.style.color = cor2;
    } else {
      label2.style.borderColor = 'var(--border-color)';
      label2.style.background = 'transparent';
      label2.style.color = 'var(--text-main)';
    }
  }
}

// Modal de Configuração das Equipes
function abrirModalConfigEquipes() {
  if (!gincanaAtual) return;

  document.getElementById('config-titulo-gincana').value = gincanaAtual.titulo || 'Gincana UMP';
  document.getElementById('config-nome-eq1').value = gincanaAtual.equipe_1.nome || 'Equipe 1';
  document.getElementById('config-cor-eq1').value = gincanaAtual.equipe_1.cor || '#2563EB';
  document.getElementById('config-nome-eq2').value = gincanaAtual.equipe_2.nome || 'Equipe 2';
  document.getElementById('config-cor-eq2').value = gincanaAtual.equipe_2.cor || '#DC2626';

  document.getElementById('modal-config-equipes').style.display = 'flex';
}

function fecharModalConfigEquipes() {
  document.getElementById('modal-config-equipes').style.display = 'none';
}

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
