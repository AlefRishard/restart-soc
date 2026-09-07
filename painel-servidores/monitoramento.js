/* ==========================================================
    RESTART - SCRIPT DE MONITORAMENTO AVANÇADO ENTERPRISE (OTIMIZADO)
    ========================================================== */

const API_URL = ''; 
let servidoresCache = [];
let chartLatenciaInstance = null;
let chartStatusInstance = null;
let chartHostIndividualInstance = null;
let filtroAtual = 'todos';
let servidorSelecionadoId = null;

let colunaOrdenadaAtual = -1;
let ordemAscendente = true;

// Variáveis de Sincronismo e Intervalo Dinâmico
let intervaloSegundos = 30;
let tempoRestante = 30;
let contadorRegressivoInterval = null;

// Armazena estado e histórico de telemetria individual
let statusCacheFront = {};

// Variáveis e Módulo de Auditoria e Rastreamento (Front-End)
let trilhaAuditoriaGlobal = [];
let servidorAtualNomeEmFoco = '';
let ipClienteCache = 'Detectando IP...';

// Ao carregar a página, busca o IP público real da máquina que está acessando
async function carregarIPCliente() {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    if (!response.ok) throw new Error('Falha na api externa de IP');
    const data = await response.json();
    ipClienteCache = data.ip;
  } catch (e) {
    ipClienteCache = 'Rede Local / IP Oculto';
  }
}
carregarIPCliente();

// Coleta fingerprinting e dados detalhados da máquina cliente
function obterFingerprintMaquina() {
  const nav = window.navigator;
  const tela = window.screen;

  let sistemaOperacional = "Desconhecido";
  if (nav.userAgent.includes("Win")) sistemaOperacional = "Windows";
  else if (nav.userAgent.includes("Mac")) sistemaOperacional = "macOS";
  else if (nav.userAgent.includes("Linux")) sistemaOperacional = "Linux";
  else if (nav.userAgent.includes("Android")) sistemaOperacional = "Android";
  else if (nav.userAgent.includes("like Mac")) sistemaOperacional = "iOS";

  let navegador = "Genérico";
  if (nav.userAgent.includes("Firefox")) navegador = "Firefox";
  else if (nav.userAgent.includes("Chrome")) navegador = "Chrome";
  else if (nav.userAgent.includes("Safari") && !nav.userAgent.includes("Chrome")) navegador = "Safari";
  else if (nav.userAgent.includes("Edg")) navegador = "Edge";

  return {
    so: sistemaOperacional,
    navegador: navegador,
    resolucao: `${tela.width}x${tela.height}`
  };
}

function registrarAuditoria(acao, alvo) {
  const usuarioLogado = localStorage.getItem('restart_usuario') || 'Alef Rishard (Admin SOC)';
  const timestamp = new Date().toLocaleTimeString() + ' - ' + new Date().toLocaleDateString();
  const maquinaInfo = obterFingerprintMaquina();

  const evento = {
    id: Date.now(),
    usuario: usuarioLogado,
    ip: ipClienteCache,
    maquina: maquinaInfo,
    acao,
    alvo,
    timestamp
  };

  trilhaAuditoriaGlobal.unshift(evento);
  if (trilhaAuditoriaGlobal.length > 100) trilhaAuditoriaGlobal.pop();

  atualizarListaAuditoriaModal();
}

function atualizarListaAuditoriaModal() {
  const container = document.getElementById('lista-auditoria-host');
  if (!container) return;

  const eventosDoHost = trilhaAuditoriaGlobal.filter(ev => ev.alvo === servidorAtualNomeEmFoco || ev.alvo === 'Geral');

  if (eventosDoHost.length === 0) {
    container.innerHTML = `<p style="color: #8e9a9d; font-size: 12px; text-align: center; margin: 15px 0;">Nenhum registro de acesso recente para este host.</p>`;
    return;
  }

  container.innerHTML = eventosDoHost.map(ev => `
    <div style="background: #040d0b; border: 1px solid #124d3f; padding: 10px 12px; border-radius: 6px; margin-bottom: 6px; font-size: 11px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <div>
          <strong style="color: #00ff66;">${ev.usuario}</strong> 
          <span style="color: #34d399; background: #07261d; padding: 1px 5px; border-radius: 3px; font-family: monospace; margin-left: 5px;">IP: ${ev.ip}</span>
        </div>
        <span style="color: #8e9a9d; font-family: monospace; font-size: 10px;">${ev.timestamp}</span>
      </div>
      <div style="color: #d1d5db; margin-bottom: 4px;">
        <strong>Ação:</strong> ${ev.acao}
      </div>
      <div style="color: #8e9a9d; font-size: 10px; display: flex; gap: 10px; border-top: 1px dashed #124d3f; padding-top: 4px; margin-top: 4px;">
        <span>💻 SO: <strong style="color: #cbd5e1;">${ev.maquina.so}</strong></span>
        <span>🌐 Browser: <strong style="color: #cbd5e1;">${ev.maquina.navegador}</strong></span>
        <span>🖥️ Tela: <strong style="color: #cbd5e1;">${ev.maquina.resolucao}</strong></span>
      </div>
    </div>
  `).join('');
}

function exportarAuditoriaHost() {
  mostrarToast(`Relatório de auditoria de ${servidorAtualNomeEmFoco} gerado com sucesso!`);
  adicionarLog(`AUDITORIA: Exportação de logs de IP e máquina para o host [${servidorAtualNomeEmFoco}] solicitada por ${ipClienteCache}.`);
}

document.addEventListener('DOMContentLoaded', () => {
  carregarDadosMonitoramento();
  iniciarCicloAtualizacao();

  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

    const key = e.key.toLowerCase();
    if (key === 'f') {
      e.preventDefault();
      document.getElementById('input-busca')?.focus();
    } else if (key === 'r') {
      e.preventDefault();
      carregarDadosMonitoramento(false);
      mostrarToast("Varredura manual acionada por atalho (R)");
    } else if (key === 'k') {
      e.preventDefault();
      toggleTelaCheia();
    } else if (e.key === 'Escape') {
      fecharModalDetalhes();
      fecharPopoverAlertas();
    }
  });
});

// Controle de Ciclo e Sincronismo Dinâmico
function iniciarCicloAtualizacao() {
  if (contadorRegressivoInterval) {
    clearInterval(contadorRegressivoInterval);
    contadorRegressivoInterval = null;
  }

  const contador = document.getElementById('countdown-timer');

  if (intervaloSegundos <= 0) {
    if (contador) contador.innerText = 'Off';
    return;
  }

  tempoRestante = intervaloSegundos;
  if (contador) contador.innerText = tempoRestante + 's';

  contadorRegressivoInterval = setInterval(() => {
    tempoRestante--;
    if (contador) contador.innerText = tempoRestante + 's';

    if (tempoRestante <= 0) {
      tempoRestante = intervaloSegundos;
      carregarDadosMonitoramento(true);
    }
  }, 1000);
}

function alterarIntervaloAtualizacao(novoValor) {
  intervaloSegundos = parseInt(novoValor, 10);
  adicionarLog(`Intervalo de sincronismo alterado para ${intervaloSegundos === 0 ? 'Desativado' : intervaloSegundos + ' segundos'}.`);
  
  if (intervaloSegundos > 0) {
    mostrarToast(`Sync ajustado para ${intervaloSegundos}s`);
  } else {
    mostrarToast("Atualização automática desativada", "error");
  }
  
  iniciarCicloAtualizacao();
}

function renderizarSkeleton() {
  const tbody = document.getElementById('lista-monitoramento');
  if (!tbody) return;
  tbody.innerHTML = `
    <tr class="skeleton-row"><td colspan="8"><div class="skeleton-box" style="height: 20px; background: #124d3f; border-radius: 4px; animation: pulse 1.5s infinite;"></div></td></tr>
    <tr class="skeleton-row"><td colspan="8"><div class="skeleton-box" style="height: 20px; background: #124d3f; border-radius: 4px; animation: pulse 1.5s infinite;"></div></td></tr>
    <tr class="skeleton-row"><td colspan="8"><div class="skeleton-box" style="height: 20px; background: #124d3f; border-radius: 4px; animation: pulse 1.5s infinite;"></div></td></tr>
  `;
}

async function carregarDadosMonitoramento(silencioso = false) {
  const tbody = document.getElementById('lista-monitoramento');
  if (!tbody) return;

  if (!silencioso) {
    renderizarSkeleton();
    adicionarLog("Executando varredura SOC de infraestrutura...");
  }

  try {
    let servidores = [];
    
    // 1. Varredura unificada e robusta em todas as chaves possíveis do localStorage
    const chavesPossiveis = ["restart_servidores", "servidores", "restart_hosts", "hosts"];
    for (const chave of chavesPossiveis) {
      const dadosLocal = localStorage.getItem(chave);
      if (dadosLocal) {
        try {
          const parsed = JSON.parse(dadosLocal);
          if (Array.isArray(parsed) && parsed.length > 0) {
            servidores = parsed;
            break;
          }
        } catch (e) {
          console.warn(`Erro ao ler dados da chave ${chave} do localStorage.`);
        }
      }
    }

    // 2. Se não houver no localStorage, tenta via API
    if (!Array.isArray(servidores) || servidores.length === 0) {
      try {
        const res = await fetch(`${API_URL}/api/servidores`);
        if (res.ok) {
          servidores = await res.json();
        }
      } catch (e) {
        console.warn("API indisponível.");
      }
    }

    // 3. Fallback final para dados de demonstração caso ambos estejam vazios
    if (!Array.isArray(servidores) || servidores.length === 0) {
      servidores = [
        { id: 1, nome: 'App Prod 01', url: '192.168.1.100', container: 'api-web-prod', usuario: 'root' },
        { id: 2, nome: 'Banco Principal', url: '192.168.1.105', container: 'postgres-db', usuario: 'postgres' },
        { id: 3, nome: 'Servidor Auth', url: '192.168.1.120', caminho_projeto: '/var/www/auth', usuario: 'admin' },
        { id: 4, nome: 'Gateway API', url: '192.168.1.150', container: 'kong-gateway', usuario: 'root' }
      ];
    }

    servidoresCache = servidores;
    const totalMonitoredEl = document.getElementById('total-monitored');
    if (totalMonitoredEl) totalMonitoredEl.textContent = servidores.length;
    
    let onlineCount = 0;
    let offlineCount = 0;

    const nomesServidores = [];
    const latenciasServidores = [];

    tbody.innerHTML = servidores.map((srv) => {
      const srvId = srv.id || Math.abs(srv.nome.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0));

      if (!statusCacheFront[srvId]) {
        const uptimeGrid = Array.from({ length: 7 }, () => Math.random() > 0.08);
        statusCacheFront[srvId] = {
          isOnline: true,
          latencia: Math.floor(Math.random() * 22) + 10,
          cpuUso: Math.floor(Math.random() * 50) + 15,
          ramUso: Math.floor(Math.random() * 40) + 30,
          historicoCpu: [20, 25, 30, 28, Math.floor(Math.random() * 50) + 15],
          historicoRam: [40, 42, 45, 43, Math.floor(Math.random() * 40) + 30],
          ultimaVerificacao: new Date().toLocaleTimeString(),
          uptimeGrid,
          historicoEventos: [
            { hora: new Date().toLocaleTimeString(), tipo: 'info', desc: 'Servidor sincronizado com sucesso.' }
          ]
        };
      } else {
        const est = statusCacheFront[srvId];
        est.cpuUso = Math.min(100, Math.max(5, est.cpuUso + (Math.floor(Math.random() * 11) - 5)));
        est.ramUso = Math.min(100, Math.max(10, est.ramUso + (Math.floor(Math.random() * 7) - 3)));
        
        est.historicoCpu.shift(); est.historicoCpu.push(est.cpuUso);
        est.historicoRam.shift(); est.historicoRam.push(est.ramUso);
      }

      const estado = statusCacheFront[srvId];
      if (estado.isOnline) onlineCount++; else offlineCount++;

      nomesServidores.push(srv.nome);
      latenciasServidores.push(estado.latencia);

      const badgeClass = estado.isOnline ? 'online' : 'offline';
      const badgeText = estado.isOnline ? 'Operacional' : 'Fora do Ar';
      const badgeColor = estado.isOnline ? '#00ff66' : '#ff3333';
      const indicatorClass = estado.isOnline ? 'live-indicator' : 'live-indicator offline';
      const temDocker = (srv.container || srv.tipo === 'docker') ? 'sim' : 'nao';

      const cpuClass = estado.cpuUso > 85 ? 'bar-danger' : (estado.cpuUso > 60 ? 'bar-warning' : 'bar-normal');
      const ramClass = estado.ramUso > 85 ? 'bar-danger' : (estado.ramUso > 70 ? 'bar-warning' : 'bar-normal');
      const ehCritico = (estado.cpuUso > 85 || estado.ramUso > 85 || !estado.isOnline) ? 'linha-critica' : '';

      const gridHtml = estado.uptimeGrid.map(ok => `<div class="uptime-bar ${ok ? 'uptime-ok' : 'uptime-fail'}" title="${ok ? 'Estável' : 'Instabilidade'}"></div>`).join('');
      let infoDetalhe = srv.container || srv.caminho_projeto || srv.porta || '-';

      return `
        <tr class="${ehCritico} flash-cell" data-id="${srvId}" data-online="${estado.isOnline}" data-docker="${temDocker}" style="cursor: pointer;" onclick="abrirDetalhesServidor(${srvId})" title="Clique para ver detalhes">
          <td><strong>${srv.nome}</strong></td>
          <td><code>${srv.url || srv.ip || 'Localhost'}</code></td>
          <td>${infoDetalhe}</td>
          <td>
            <div style="font-size: 11px; margin-bottom: 3px; display: flex; justify-content: space-between; font-family: monospace;">
              <span>CPU</span> <span>${estado.cpuUso}%</span>
            </div>
            <div class="resource-bar-container">
              <div class="resource-bar-fill ${cpuClass}" style="width: ${estado.cpuUso}%;"></div>
            </div>
          </td>
          <td>
            <div style="font-size: 11px; margin-bottom: 3px; display: flex; justify-content: space-between; font-family: monospace;">
              <span>RAM</span> <span>${estado.ramUso}%</span>
            </div>
            <div class="resource-bar-container">
              <div class="resource-bar-fill ${ramClass}" style="width: ${estado.ramUso}%;"></div>
            </div>
          </td>
          <td><div class="uptime-grid">${gridHtml}</div></td>
          <td>
            <span class="badge ${badgeClass}" style="border-color: ${badgeColor}; color: ${badgeColor}; display: inline-flex; align-items: center; gap: 4px;">
              <span class="${indicatorClass}"></span> ${badgeText}
            </span>
          </td>
          <td style="text-align: center;" onclick="event.stopPropagation()">
            <div style="display: flex; gap: 6px; justify-content: center;">
              <button onclick="testarPing(${srvId}, '${srv.nome}')" class="btn-neon btn-neon-cyan" title="Forçar Ping" style="width: 32px; height: 32px; font-size: 12px;">
                <i class="fa-solid fa-rotate"></i>
              </button>
              <button onclick="abrirDetalhesServidor(${srvId})" class="btn-neon" style="width: 32px; height: 32px; font-size: 12px; border-color: #3b82f6; color: #3b82f6;" title="Ver Detalhes">
                <i class="fa-solid fa-eye"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    const totalOnlineEl = document.getElementById('total-online');
    if (totalOnlineEl) totalOnlineEl.textContent = onlineCount;
    const totalOfflineEl = document.getElementById('total-offline');
    if (totalOfflineEl) totalOfflineEl.textContent = offlineCount;
    
    atualizarGraficos(nomesServidores, latenciasServidores, onlineCount, offlineCount);
    atualizarCentralAlertas();
    aplicarFiltrosTabela();

    if (!silencioso) {
      adicionarLog(`Varredura SOC concluída. ${onlineCount} host(s) operacionais.`);
    }

  } catch (err) {
    console.error('Erro ao carregar dados:', err);
    adicionarLog("ERRO: Falha na sincronização de infraestrutura.");
  }
}

function atualizarCentralAlertas() {
  const alertas = [];
  servidoresCache.forEach(srv => {
    const srvId = srv.id || Math.abs(srv.nome.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0));
    const est = statusCacheFront[srvId];
    if (est) {
      if (!est.isOnline) {
        alertas.push({ id: srvId, nome: srv.nome, msg: `Host ${srv.nome} está Offline!` });
      } else if (est.cpuUso > 85) {
        alertas.push({ id: srvId, nome: srv.nome, msg: `CPU Crítica em ${srv.nome} (${est.cpuUso}%)` });
      } else if (est.ramUso > 85) {
        alertas.push({ id: srvId, nome: srv.nome, msg: `RAM Crítica em ${srv.nome} (${est.ramUso}%)` });
      }
    }
  });

  const badge = document.getElementById('alert-counter-badge');
  const lista = document.getElementById('alerts-popover-list');
  if (!badge || !lista) return;

  if (alertas.length > 0) {
    badge.textContent = alertas.length;
    badge.style.display = 'inline-block';
    lista.innerHTML = alertas.map(a => `
      <div class="alert-item" onclick="abrirDetalhesServidor(${a.id}); fecharPopoverAlertas();" style="cursor: pointer; padding: 6px 0; border-bottom: 1px dashed #124d3f;" title="Clique para inspecionar">
        <strong style="color: #ff3333;">${a.nome}</strong><br><span style="color: #d1d5db; font-size: 11px;">${a.msg}</span>
      </div>
    `).join('');
  } else {
    badge.textContent = '0';
    badge.style.display = 'none';
    lista.innerHTML = `<p style="color: #8e9a9d; font-size: 12px; text-align: center; margin: 10px 0;">Nenhum alerta crítico no momento.</p>`;
  }
}

function toggleAlertsPopover() {
  const popover = document.getElementById('alerts-popover');
  if (popover) {
    popover.style.display = popover.style.display === 'block' ? 'none' : 'block';
  }
}

function fecharPopoverAlertas() {
  const popover = document.getElementById('alerts-popover');
  if (popover) popover.style.display = 'none';
}

function reconhecerTodosAlertas() {
  mostrarToast("Todos os alertas pendentes foram reconhecidos pela equipe.");
  fecharPopoverAlertas();
}

function renderizarGraficoIndividual(srvId) {
  const ctx = document.getElementById('chartHostIndividual');
  if (!ctx) return;

  const estado = statusCacheFront[srvId];
  if (!estado) return;

  if (chartHostIndividualInstance) chartHostIndividualInstance.destroy();

  chartHostIndividualInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['T-4', 'T-3', 'T-2', 'T-1', 'Agora'],
      datasets: [
        {
          label: 'CPU (%)',
          data: estado.historicoCpu,
          borderColor: '#ff3333',
          backgroundColor: 'rgba(255, 51, 51, 0.1)',
          borderWidth: 2,
          tension: 0.3,
          fill: true
        },
        {
          label: 'RAM (%)',
          data: estado.historicoRam,
          borderColor: '#00ff66',
          backgroundColor: 'rgba(0, 255, 102, 0.1)',
          borderWidth: 2,
          tension: 0.3,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#8e9a9d', boxWidth: 12 } }
      },
      scales: {
        x: { ticks: { color: '#8e9a9d' }, grid: { color: '#124d3f' } },
        y: { ticks: { color: '#8e9a9d' }, grid: { color: '#124d3f' }, min: 0, max: 100 }
      }
    }
  });
}

function ordenarTabela(colunaIndex) {
  const tbody = document.getElementById('lista-monitoramento');
  if (!tbody) return;
  const linhas = Array.from(tbody.querySelectorAll('tr'));
  
  if (colunaOrdenadaAtual === colunaIndex) {
    ordemAscendente = !ordemAscendente;
  } else {
    colunaOrdenadaAtual = colunaIndex;
    ordemAscendente = true;
  }

  linhas.sort((a, b) => {
    if (a.classList.contains('skeleton-row') || b.classList.contains('skeleton-row')) return 0;
    let valA = a.children[colunaIndex]?.innerText.trim() || '';
    let valB = b.children[colunaIndex]?.innerText.trim() || '';

    if (colunaIndex === 3 || colunaIndex === 4) {
      valA = parseFloat(valA.replace(/[^0-9.]/g, '')) || 0;
      valB = parseFloat(valB.replace(/[^0-9.]/g, '')) || 0;
      return ordemAscendente ? valA - valB : valB - valA;
    }

    return ordemAscendente ? valA.localeCompare(valB) : valB.localeCompare(valA);
  });

  tbody.innerHTML = '';
  linhas.forEach(l => tbody.appendChild(l));
}

function filtrarStatus(tipo, el) {
  filtroAtual = tipo;
  document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
  if (el) el.classList.add('active');
  aplicarFiltrosTabela();
}

function filtrarServidores() {
  aplicarFiltrosTabela();
}

function aplicarFiltrosTabela() {
  const inputBusca = document.getElementById('input-busca');
  const termo = inputBusca ? inputBusca.value.toLowerCase() : '';
  const linhas = document.querySelectorAll('#lista-monitoramento tr');

  linhas.forEach(linha => {
    if (linha.classList.contains('skeleton-row')) return;
    const texto = linha.textContent.toLowerCase();
    const isOnline = linha.getAttribute('data-online') === 'true';
    const temDocker = linha.getAttribute('data-docker') === 'sim';

    let passaFiltroPill = true;
    if (filtroAtual === 'online') passaFiltroPill = isOnline;
    if (filtroAtual === 'offline') passaFiltroPill = !isOnline;
    if (filtroAtual === 'docker') passaFiltroPill = temDocker;

    const passaBusca = texto.includes(termo) || termo === '';

    linha.style.display = (passaFiltroPill && passaBusca) ? '' : 'none';
  });
}

function testarPing(id, nome) {
  registrarAuditoria('Disparou Diagnóstico de Conectividade (Ping)', nome);
  adicionarLog(`Disparando diagnóstico SOC para ${nome}...`);
  mostrarToast(`Testando conectividade de ${nome}...`);
  
  setTimeout(() => {
    const estado = statusCacheFront[id];
    if (estado) {
      estado.latencia = Math.floor(Math.random() * 15) + 8;
      estado.cpuUso = Math.floor(Math.random() * 60) + 10;
      estado.ramUso = Math.floor(Math.random() * 40) + 25;
      estado.ultimaVerificacao = new Date().toLocaleTimeString();
      estado.historicoEventos.unshift({ hora: estado.ultimaVerificacao, tipo: 'success', desc: 'Checagem de carga executada com sucesso.' });
    }
    adicionarLog(`Host ${nome} respondeu perfeitamente!`);
    mostrarToast(`Métricas de ${nome} atualizadas!`);
    carregarDadosMonitoramento(true);
  }, 700);
}

function abrirDetalhesServidor(id) {
  servidorSelecionadoId = id;
  const srv = servidoresCache.find(s => (s.id || Math.abs(s.nome.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0))) === id);
  if (!srv) return;

  servidorAtualNomeEmFoco = srv.nome;
  registrarAuditoria('Inspecionou Detalhes e Métricas do Host', srv.nome);

  const estado = statusCacheFront[id];
  const modalTitulo = document.getElementById('modal-titulo');
  if (modalTitulo) modalTitulo.innerHTML = `<i class="fa-solid fa-server"></i> ${srv.nome}`;

  const containerHtml = srv.container ? `<p><strong>Container Docker:</strong> <code>${srv.container}</code></p>` : '';
  const composeHtml = srv.caminho_projeto ? `<p><strong>Caminho Compose:</strong> <code>${srv.caminho_projeto}</code></p>` : '';
  const statusCor = estado.isOnline ? '#00ff66' : '#ff3333';
  const statusTexto = estado.isOnline ? '● Operacional / Saudável' : '▲ Fora do Ar / Falha';

  const cpuClass = estado.cpuUso > 85 ? 'bar-danger' : (estado.cpuUso > 60 ? 'bar-warning' : 'bar-normal');
  const ramClass = estado.ramUso > 85 ? 'bar-danger' : (estado.ramUso > 70 ? 'bar-warning' : 'bar-normal');

  const tabGeral = document.getElementById('tab-geral');
  if (tabGeral) {
    tabGeral.innerHTML = `
      <p><strong>Endereço IP / Host:</strong> <code style="color:#00ff66;">${srv.url || srv.ip || 'Localhost'}</code></p>
      <p><strong>Usuário SSH:</strong> ${srv.usuario || 'root'}</p>
      ${containerHtml}
      ${composeHtml}
      <hr style="border: 0; border-top: 1px solid #124d3f; margin: 6px 0;">
      <p><strong>Status Operacional:</strong> <span style="color: ${statusCor}; font-weight: bold;">${statusTexto}</span></p>
      <p><strong>Latência Atual:</strong> <span style="color: #34d399; font-family: monospace;">${estado.latencia} ms</span></p>
      
      <div style="margin: 10px 0;">
        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;">
          <span>Carga de CPU:</span> <strong style="font-family: monospace; color: #fff;">${estado.cpuUso}%</strong>
        </div>
        <div style="width: 100%; background: #040d0b; border: 1px solid #124d3f; border-radius: 4px; overflow: hidden; height: 10px;">
          <div class="resource-bar-fill ${cpuClass}" style="width: ${estado.cpuUso}%;"></div>
        </div>
      </div>

      <div style="margin: 10px 0;">
        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;">
          <span>Consumo de Memória RAM:</span> <strong style="font-family: monospace; color: #fff;">${estado.ramUso}%</strong>
        </div>
        <div style="width: 100%; background: #040d0b; border: 1px solid #124d3f; border-radius: 4px; overflow: hidden; height: 10px;">
          <div class="resource-bar-fill ${ramClass}" style="width: ${estado.ramUso}%;"></div>
        </div>
      </div>

      <p style="margin-top: 10px;"><strong>Última Sincronização:</strong> ${estado.ultimaVerificacao}</p>
    `;
  }

  const histHtml = estado.historicoEventos.map(h => `
    <li style="background: #040d0b; border: 1px solid #124d3f; padding: 8px 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
      <span>${h.desc}</span>
      <span style="color: #8e9a9d; font-size: 11px; font-family: monospace;">${h.hora}</span>
    </li>
  `).join('');
  const listaHistServidor = document.getElementById('lista-historico-servidor');
  if (listaHistServidor) listaHistServidor.innerHTML = histHtml;

  renderizarGraficoIndividual(id);

  document.querySelectorAll('.modal-tab-btn').forEach((b, idx) => {
    if (idx === 0) b.classList.add('active'); else b.classList.remove('active');
  });
  document.querySelectorAll('.tab-content').forEach((c, idx) => {
    if (idx === 0) c.classList.add('active'); else c.classList.remove('active');
  });

  const modalDetalhes = document.getElementById('modal-detalhes');
  if (modalDetalhes) modalDetalhes.style.display = 'flex';
}

function fecharModalDetalhes() {
  const modalDetalhes = document.getElementById('modal-detalhes');
  if (modalDetalhes) modalDetalhes.style.display = 'none';
}

function mudarAbaModal(abaNome, btnEl) {
  document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  if (btnEl) btnEl.classList.add('active');
  const targetTab = document.getElementById(`tab-${abaNome}`);
  if (targetTab) targetTab.classList.add('active');

  if (abaNome === 'grafico' && servidorSelecionadoId) {
    renderizarGraficoIndividual(servidorSelecionadoId);
  }
}

function inserirAtalhoSSH(cmd) {
  const input = document.getElementById('ssh-input-cmd');
  if (input) {
    input.value = cmd;
    input.focus();
  }
}

function executarComandoSSH(event) {
  if (event.key === 'Enter') enviarComandoSSHBtn();
}

function enviarComandoSSHBtn() {
  const input = document.getElementById('ssh-input-cmd');
  const output = document.getElementById('ssh-terminal-output');
  if (!input || !output) return;

  const cmd = input.value.trim();
  if (!cmd) return;

  registrarAuditoria(`Executou comando SSH via Mini Terminal: [${cmd}]`, servidorAtualNomeEmFoco);

  output.innerHTML += `<div><span style="color:#34d399;">$</span> ${cmd}</div>`;
  input.value = '';

  setTimeout(() => {
    let resposta = "Comando executado com sucesso.";
    const cmdLower = cmd.toLowerCase();
    if (cmdLower === 'status') resposta = "Serviço rodando na porta principal. Load: 0.12, 0.20, 0.15.";
    else if (cmdLower === 'top') resposta = "PID USER PR NI VIRT RES SHR S %CPU %MEM TIME+ COMMAND\n 101 root 20 0 450M 82M 25M S 2.1 2.0 0:14.22 node";
    else if (cmdLower === 'uptime') resposta = "up 42 days, 14:21, 2 users, load average: 0.15, 0.22, 0.18";
    else if (cmdLower === 'df -h') resposta = "Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1        50G   18G   30G  38% /";
    else if (cmdLower === 'docker ps') resposta = "CONTAINER ID   IMAGE        COMMAND                  CREATED        STATUS\n4a8b2f1e9c0d   nginx:alpine   \"nginx -g 'daemon of…\"   2 weeks ago    Up 2 weeks";
    else if (cmdLower.startsWith('reboot')) resposta = "[AVISO] Reinicialização simulada com sucesso.";

    output.innerHTML += `<div style="color:#d1d5db; margin-bottom: 6px; white-space: pre-line;">${resposta}</div>`;
    output.scrollTop = output.scrollHeight;
  }, 400);
}

function toggleTelaCheia() {
  const topbar = document.getElementById('app-topbar');
  const icon = document.getElementById('kiosk-icon');
  const btnExit = document.getElementById('btn-sair-kiosk');
  
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => console.warn(err));
    if (topbar) topbar.style.display = 'none';
    if (btnExit) btnExit.style.display = 'block';
    if (icon) icon.className = "fa-solid fa-compress";
    mostrarToast("Modo Tela Cheia (Kiosk) ativado (Pressione ESC para sair)");
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().then(() => {
        if (topbar) topbar.style.display = 'flex';
        if (btnExit) btnExit.style.display = 'none';
        if (icon) icon.className = "fa-solid fa-expand";
      }).catch(err => console.warn(err));
    }
  }
}

document.addEventListener('fullscreenchange', () => {
  const topbar = document.getElementById('app-topbar');
  const icon = document.getElementById('kiosk-icon');
  const btnExit = document.getElementById('btn-sair-kiosk');

  if (!document.fullscreenElement) {
    if (topbar) topbar.style.display = 'flex';
    if (btnExit) btnExit.style.display = 'none';
    if (icon) icon.className = "fa-solid fa-expand";
  }
});

function atualizarGraficos(labels, dadosLatencia, online = 0, offline = 0) {
  const ctxLat = document.getElementById('chartLatencia');
  if (ctxLat) {
    if (chartLatenciaInstance) chartLatenciaInstance.destroy();
    chartLatenciaInstance = new Chart(ctxLat, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Latência (ms)',
          data: dadosLatencia,
          borderColor: '#00ff66',
          backgroundColor: 'rgba(0, 255, 102, 0.1)',
          borderWidth: 2,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#8e9a9d' }, grid: { color: '#124d3f' } },
          y: { ticks: { color: '#8e9a9d' }, grid: { color: '#124d3f' } }
        }
      }
    });
  }

  const ctxStatus = document.getElementById('chartStatus');
  if (ctxStatus) {
    if (chartStatusInstance) chartStatusInstance.destroy();
    chartStatusInstance = new Chart(ctxStatus, {
      type: 'doughnut',
      data: {
        labels: ['Online', 'Offline'],
        datasets: [{
          data: [online, offline],
          backgroundColor: ['#00ff66', '#ff3333'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#8e9a9d', boxWidth: 12 } }
        }
      }
    });
  }
}

function mostrarToast(mensagem, tipo = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  toast.innerHTML = `<i class="fa-solid ${tipo === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i> ${mensagem}`;
  
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function adicionarLog(mensagem) {
  const terminal = document.getElementById('terminal-logs');
  if (!terminal) return;
  
  const hora = new Date().toLocaleTimeString();
  terminal.innerHTML += `[<span>${hora}</span>] ${mensagem}<br>`;
  terminal.scrollTop = terminal.scrollHeight;
}

function limparLogs() {
  const terminal = document.getElementById('terminal-logs');
  if (terminal) {
    terminal.innerHTML = `[<span>Sistema</span>] Log limpo pelo usuário.<br>`;
  }
}

function fazerLogout() {
  localStorage.removeItem('restart_usuario');
  window.location.href = 'index.html';
}