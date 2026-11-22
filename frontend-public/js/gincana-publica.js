let ultimaGincanaId = null;
let pontosAnterioresEq1 = null;
let pontosAnterioresEq2 = null;
let totalTarefasAnteriores = null;
let pollingInterval = null;
let estadoOcultoAnterior = null;

document.addEventListener('DOMContentLoaded', () => {
  carregarDadosGincana();
  // Polling em tempo real a cada 3.5 segundos
  pollingInterval = setInterval(carregarDadosGincana, 3500);

  // Sincronizar ícones de tela cheia
  document.addEventListener('fullscreenchange', () => {
    const enterIcon = document.getElementById('icon-fs-enter');
    const exitIcon = document.getElementById('icon-fs-exit');
    if (enterIcon && exitIcon) {
      if (document.fullscreenElement) {
        enterIcon.style.display = 'none';
        exitIcon.style.display = 'block';
      } else {
        enterIcon.style.display = 'block';
        exitIcon.style.display = 'none';
      }
    }
  });
});

async function carregarDadosGincana() {
  try {
    const params = new URLSearchParams(window.location.search);
    const gincanaId = params.get('id');
    const eventoId = params.get('evento_id');

    let endpoint = '/gincana/ativa';
    if (gincanaId) {
      endpoint = `/gincana/${gincanaId}`;
    } else if (eventoId) {
      endpoint = `/gincana/ativa?evento_id=${eventoId}`;
    }

    const data = await API.request(endpoint);
    if (!data) return;

    atualizarInterface(data);
  } catch (error) {
    console.error('Erro ao atualizar placar da gincana:', error);
  }
}

function atualizarInterface(data) {
  // 1. Título e Subtítulo
  const tituloEl = document.getElementById('gincana-titulo');
  if (tituloEl && data.titulo) {
    tituloEl.textContent = data.titulo;
  }

  const subEl = document.getElementById('gincana-evento-sub');
  if (subEl) {
    if (data.evento_titulo) {
      subEl.textContent = `${data.evento_titulo} • Placar Oficial em Tempo Real`;
    } else {
      subEl.textContent = 'Placar Oficial em Tempo Real';
    }
  }

  // 2. Cores das equipes (CSS Variables)
  const root = document.documentElement;
  if (data.equipe_1 && data.equipe_1.cor) {
    root.style.setProperty('--eq1-color', data.equipe_1.cor);
  }
  if (data.equipe_2 && data.equipe_2.cor) {
    root.style.setProperty('--eq2-color', data.equipe_2.cor);
  }

  // 3. Nomes das equipes
  const nomeEq1 = document.getElementById('nome-eq1');
  const nomeEq2 = document.getElementById('nome-eq2');
  if (nomeEq1 && data.equipe_1) nomeEq1.textContent = data.equipe_1.nome;
  if (nomeEq2 && data.equipe_2) nomeEq2.textContent = data.equipe_2.nome;

  const estaOculto = Boolean(data.placar_oculto);

  // Notificar quando o placar for revelado após ter estado oculto
  if (estadoOcultoAnterior === true && !estaOculto) {
    dispararNotificacao('O Placar Oficial foi REVELADO!');
  }
  estadoOcultoAnterior = estaOculto;

  // Banner de Sigilo
  const bannerSigilo = document.getElementById('banner-sigilo-publico');
  if (bannerSigilo) {
    bannerSigilo.style.display = estaOculto ? 'flex' : 'none';
  }

  // 4. Pontuações e Animação de Contador
  const elScore1 = document.getElementById('pontos-eq1');
  const elScore2 = document.getElementById('pontos-eq2');
  const box1 = document.querySelector('#card-eq1 .score-display-box');
  const box2 = document.querySelector('#card-eq2 .score-display-box');

  if (estaOculto) {
    if (box1) {
      box1.classList.add('score-oculto-blur');
      if (!box1.querySelector('.score-sigilo-overlay')) {
        const ov1 = document.createElement('div');
        ov1.className = 'score-sigilo-overlay';
        ov1.innerHTML = `<span class="score-sigilo-chip"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Em Sigilo</span>`;
        box1.appendChild(ov1);
      }
    }
    if (box2) {
      box2.classList.add('score-oculto-blur');
      if (!box2.querySelector('.score-sigilo-overlay')) {
        const ov2 = document.createElement('div');
        ov2.className = 'score-sigilo-overlay';
        ov2.innerHTML = `<span class="score-sigilo-chip"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Em Sigilo</span>`;
        box2.appendChild(ov2);
      }
    }
    if (elScore1) elScore1.textContent = '8888';
    if (elScore2) elScore2.textContent = '8888';
  } else {
    if (box1) {
      box1.classList.remove('score-oculto-blur');
      const ov1 = box1.querySelector('.score-sigilo-overlay');
      if (ov1) ov1.remove();
    }
    if (box2) {
      box2.classList.remove('score-oculto-blur');
      const ov2 = box2.querySelector('.score-sigilo-overlay');
      if (ov2) ov2.remove();
    }

    const novoP1 = data.equipe_1 ? data.equipe_1.pontos : 0;
    const novoP2 = data.equipe_2 ? data.equipe_2.pontos : 0;

    if (pontosAnterioresEq1 === null) {
      // Primeira carga
      if (elScore1) elScore1.textContent = novoP1;
      if (elScore2) elScore2.textContent = novoP2;
    } else {
      // Detectar alteração na equipe 1
      if (novoP1 !== pontosAnterioresEq1 && elScore1) {
        animarNumero(elScore1, pontosAnterioresEq1, novoP1, 800);
        destacarCard('card-eq1', elScore1);
        if (novoP1 > pontosAnterioresEq1) {
          dispararNotificacao(`${data.equipe_1.nome} marcou +${novoP1 - pontosAnterioresEq1} pts!`);
        }
      }
      // Detectar alteração na equipe 2
      if (novoP2 !== pontosAnterioresEq2 && elScore2) {
        animarNumero(elScore2, pontosAnterioresEq2, novoP2, 800);
        destacarCard('card-eq2', elScore2);
        if (novoP2 > pontosAnterioresEq2) {
          dispararNotificacao(`${data.equipe_2.nome} marcou +${novoP2 - pontosAnterioresEq2} pts!`);
        }
      }
    }

    pontosAnterioresEq1 = novoP1;
    pontosAnterioresEq2 = novoP2;
  }

  // 5. Líder & Versus
  const card1 = document.getElementById('card-eq1');
  const card2 = document.getElementById('card-eq2');
  const badgeLider1 = document.getElementById('badge-lider-eq1');
  const badgeLider2 = document.getElementById('badge-lider-eq2');
  const diffBadge = document.getElementById('diff-badge');

  if (card1 && card2 && badgeLider1 && badgeLider2 && diffBadge) {
    card1.classList.remove('is-winner');
    card2.classList.remove('is-winner');
    badgeLider1.classList.remove('show');
    badgeLider2.classList.remove('show');

    if (estaOculto) {
      diffBadge.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB703" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><span>Apuração em Sigilo &bull; Disputa Ponto a Ponto</span>`;
      diffBadge.style.color = '#FFD166';
    } else {
      const svgThunder = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF7900" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;

      if (data.lider === 1) {
        card1.classList.add('is-winner');
        badgeLider1.classList.add('show');
        diffBadge.innerHTML = `${svgThunder}<span>${data.equipe_1.nome} (+${data.diferenca_pontos} pts)</span>`;
        diffBadge.style.color = '#F8FAFC';
      } else if (data.lider === 2) {
        card2.classList.add('is-winner');
        badgeLider2.classList.add('show');
        diffBadge.innerHTML = `${svgThunder}<span>${data.equipe_2.nome} (+${data.diferenca_pontos} pts)</span>`;
        diffBadge.style.color = '#F8FAFC';
      } else {
        diffBadge.innerHTML = `${svgThunder}<span>Empate Técnico</span>`;
        diffBadge.style.color = '#F8FAFC';
      }
    }
  }

  // 6. Barra de Disputa
  const barTrack = document.querySelector('.dispute-bar-section .bar-track');
  const fill1 = document.getElementById('bar-fill-1');
  const fill2 = document.getElementById('bar-fill-2');
  const label1 = document.getElementById('bar-label-eq1');
  const label2 = document.getElementById('bar-label-eq2');

  if (fill1 && fill2 && label1 && label2 && data.equipe_1 && data.equipe_2) {
    if (estaOculto) {
      if (barTrack) barTrack.classList.add('modo-sigilo-bar');
      fill1.style.width = '50%';
      fill2.style.width = '50%';
      label1.textContent = `${data.equipe_1.nome} (Em Apuração)`;
      label2.textContent = `${data.equipe_2.nome} (Em Apuração)`;
    } else {
      if (barTrack) barTrack.classList.remove('modo-sigilo-bar');
      fill1.style.width = `${data.porcentagem_eq1}%`;
      fill2.style.width = `${data.porcentagem_eq2}%`;
      label1.textContent = `${data.equipe_1.nome} (${data.porcentagem_eq1}%)`;
      label2.textContent = `${data.equipe_2.nome} (${data.porcentagem_eq2}%)`;
    }
  }

  // 7. Histórico de Tarefas
  renderizarHistorico(data.historico, estaOculto);
}

function renderizarHistorico(historico, estaOculto = false) {
  const container = document.getElementById('history-list');
  if (!container) return;

  if (!historico || historico.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon-circle">!</div>
        <p class="empty-state-title">Nenhuma pontuação foi registrada ainda.</p>
        <p class="empty-state-sub">As provas começarão em breve!</p>
      </div>
    `;
    return;
  }

  // Evitar re-renderização desnecessária do DOM se a quantidade, primeiro item e estado oculto forem idênticos
  const hashAtual = `${historico.length}-${historico[0].id}-${historico[0].pontos}-${estaOculto}`;
  if (container.dataset.lastHash === hashAtual) {
    return;
  }
  container.dataset.lastHash = hashAtual;

  let html = '';
  historico.forEach(item => {
    const dataObj = new Date(item.created_at);
    const horaFormatada = dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const ptsTexto = item.pontos > 0 ? `+${item.pontos}` : `${item.pontos}`;
    const ptsCor = item.pontos >= 0 ? '#10B981' : '#EF4444';

    const ptsHtml = estaOculto
      ? `<div class="task-points sigilo-blur" style="color: #FFB703;">🔒 ??? pts</div>`
      : `<div class="task-points" style="color: ${ptsCor};">${ptsTexto} pts</div>`;

    html += `
      <div class="task-item">
        <div class="task-left">
          <span class="task-team-pill" style="background: ${item.equipe_cor}18; color: ${item.equipe_cor}; border: 1px solid ${item.equipe_cor}45;">
            ${escapeHTML(item.equipe_nome)}
          </span>
          <div class="task-info">
            <h4>${escapeHTML(item.titulo)}</h4>
            <p>
              ${item.descricao ? `<span>${escapeHTML(item.descricao)}</span> &bull; ` : ''}
              <span style="display: inline-flex; align-items: center; gap: 0.25rem;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                ${horaFormatada}
              </span>
            </p>
          </div>
        </div>
        ${ptsHtml}
      </div>
    `;
  });

  container.innerHTML = html;
}

function animarNumero(elemento, inicio, fim, duracao) {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duracao, 1);
    const valorAtual = Math.floor(progress * (fim - inicio) + inicio);
    elemento.textContent = valorAtual;
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      elemento.textContent = fim;
    }
  };
  window.requestAnimationFrame(step);
}

function destacarCard(cardId, scoreEl) {
  scoreEl.classList.add('bump');
  setTimeout(() => {
    scoreEl.classList.remove('bump');
  }, 400);
}

function dispararNotificacao(texto) {
  const toast = document.getElementById('toast-live');
  const msg = document.getElementById('toast-msg');
  if (!toast || !msg) return;

  msg.textContent = texto;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

function alternarTelaCheia() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.warn(`Erro ao entrar em tela cheia: ${err.message}`);
    });
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

function compartilharPlacar() {
  const url = window.location.href;
  if (navigator.share) {
    navigator.share({
      title: 'Placar ao Vivo - Gincana UMP',
      text: 'Acompanhe o placar da gincana em tempo real!',
      url: url
    }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url).then(() => {
      dispararNotificacao('Link do placar copiado para a área de transferência!');
    }).catch(() => {
      prompt('Copie o link do placar:', url);
    });
  }
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
