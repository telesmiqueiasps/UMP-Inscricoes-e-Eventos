let ultimaGincanaId = null;
let pontosAnterioresEq1 = null;
let pontosAnterioresEq2 = null;
let totalTarefasAnteriores = null;
let pollingInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  carregarDadosGincana();
  // Polling em tempo real a cada 3.5 segundos
  pollingInterval = setInterval(carregarDadosGincana, 3500);
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

  // 4. Pontuações e Animação de Contador
  const elScore1 = document.getElementById('pontos-eq1');
  const elScore2 = document.getElementById('pontos-eq2');

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
        dispararNotificacao(`${data.equipe_1.nome} marcou pontos! (+${novoP1 - pontosAnterioresEq1} pts)`);
      }
    }
    // Detectar alteração na equipe 2
    if (novoP2 !== pontosAnterioresEq2 && elScore2) {
      animarNumero(elScore2, pontosAnterioresEq2, novoP2, 800);
      destacarCard('card-eq2', elScore2);
      if (novoP2 > pontosAnterioresEq2) {
        dispararNotificacao(`${data.equipe_2.nome} marcou pontos! (+${novoP2 - pontosAnterioresEq2} pts)`);
      }
    }
  }

  pontosAnterioresEq1 = novoP1;
  pontosAnterioresEq2 = novoP2;

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

    if (data.lider === 1) {
      card1.classList.add('is-winner');
      badgeLider1.classList.add('show');
      diffBadge.textContent = `Vantagem: +${data.diferenca_pontos} pts`;
      diffBadge.style.color = data.equipe_1.cor;
    } else if (data.lider === 2) {
      card2.classList.add('is-winner');
      badgeLider2.classList.add('show');
      diffBadge.textContent = `Vantagem: +${data.diferenca_pontos} pts`;
      diffBadge.style.color = data.equipe_2.cor;
    } else {
      diffBadge.textContent = 'Empate Técnico';
      diffBadge.style.color = '#CBD5E1';
    }
  }

  // 6. Barra de Disputa
  const fill1 = document.getElementById('bar-fill-1');
  const fill2 = document.getElementById('bar-fill-2');
  const label1 = document.getElementById('bar-label-eq1');
  const label2 = document.getElementById('bar-label-eq2');

  if (fill1 && fill2 && label1 && label2 && data.equipe_1 && data.equipe_2) {
    fill1.style.width = `${data.porcentagem_eq1}%`;
    fill2.style.width = `${data.porcentagem_eq2}%`;
    label1.textContent = `${data.equipe_1.nome} (${data.porcentagem_eq1}%)`;
    label2.textContent = `${data.equipe_2.nome} (${data.porcentagem_eq2}%)`;
  }

  // 7. Histórico de Tarefas
  renderizarHistorico(data.historico);
}

function renderizarHistorico(historico) {
  const container = document.getElementById('history-list');
  if (!container) return;

  if (!historico || historico.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <p>Nenhuma pontuação foi registrada ainda. As provas começarão em breve!</p>
      </div>
    `;
    return;
  }

  // Evitar re-renderização desnecessária do DOM se a quantidade e primeiro item forem idênticos
  const hashAtual = `${historico.length}-${historico[0].id}-${historico[0].pontos}`;
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

    html += `
      <div class="task-item">
        <div class="task-left">
          <span class="task-team-pill" style="background: ${item.equipe_cor}20; color: ${item.equipe_cor}; border: 1px solid ${item.equipe_cor}50;">
            ${item.equipe_nome}
          </span>
          <div class="task-info">
            <h4>${escapeHTML(item.titulo)}</h4>
            <p>${item.descricao ? escapeHTML(item.descricao) + ' &bull; ' : ''}<span>${horaFormatada}</span></p>
          </div>
        </div>
        <div class="task-points" style="color: ${ptsCor};">
          ${ptsTexto} pts
        </div>
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

  msg.textContent = `🎉 ${texto}`;
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
      text: 'Acompanhe a pontuação da Gincana em tempo real!',
      url: url
    }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url).then(() => {
      dispararNotificacao('Link do placar copiado para a área de transferência!');
    }).catch(() => {
      alert('Link do placar: ' + url);
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
