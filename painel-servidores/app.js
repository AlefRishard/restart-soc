/* =================================================_
   RESTART - SOC Enterprise | Core app.js (Atualizado)
   ================================================= */

// Removida a re-declaração global conflitante de API_URL para evitar
// Uncaught SyntaxError caso seja carregado junto com outros scripts.
if (typeof window.API_URL === 'undefined') {
  window.API_URL = '/api';
}

document.addEventListener('DOMContentLoaded', () => {
  inicializarDadosLocais();
  carregarServidores();
  configurarFormulario();
  configurarTogglesDocker();
  configurarSeletorPortas();
  
  // Inicialização segura com verificação de elementos na página atual
  carregarUsuarios();
  carregarHistorico();
  configurarFormularioUsuario();
  configurarToggleSenhaUsuario();
});

// Inicializa massa de dados padrão se o localStorage estiver vazio
function inicializarDadosLocais() {
  if (!localStorage.getItem("restart_servidores")) {
    const servidoresIniciais = [
      { id: 1, nome: "srv-prod-01", url: "192.168.1.10", tipo: "Docker", container: "api-web-prod", porta: "8080", caminho_projeto: "/opt/web", usuario: "root", tem_acoes: 1 },
      { id: 2, nome: "srv-auth-02", url: "192.168.1.15", tipo: "Docker", container: "keycloak-auth", porta: "8443", caminho_projeto: "/opt/auth", usuario: "admin", tem_acoes: 1 },
      { id: 3, nome: "srv-db-oracle", url: "192.168.1.50", tipo: "Ping", container: "", porta: "1521", caminho_projeto: "", usuario: "oracle", tem_acoes: 0 },
      { id: 4, nome: "srv-legacy-03", url: "192.168.1.99", tipo: "SSH", container: "", porta: "22", caminho_projeto: "", usuario: "ubuntu", tem_acoes: 1 }
    ];
    localStorage.setItem("restart_servidores", JSON.stringify(servidoresIniciais));
  }

  if (!localStorage.getItem("restart_usuarios")) {
    const usuariosIniciais = [
      { id: 1, nome: "Alef Rishard", email: "alef@restart.local", perfil: "Administrador" },
      { id: 2, nome: "Eduardo SOC", email: "eduardo@restart.local", perfil: "Operador" }
    ];
    localStorage.setItem("restart_usuarios", JSON.stringify(usuariosIniciais));
  }

  if (!localStorage.getItem("restart_historico")) {
    const historicoInicial = [
      { id: 1, data_hora: new Date().toLocaleString(), servidor_nome: "srv-prod-01", acao: "Inicialização do Sistema", status: "Sucesso", usuario: "Sistema" }
    ];
    localStorage.setItem("restart_historico", JSON.stringify(historicoInicial));
  }
}

// Funções utilitárias para registrar logs e histórico locais
function registrarHistoricoLocal(servidorNome, acao, status = "Sucesso") {
  try {
    const historico = JSON.parse(localStorage.getItem("restart_historico") || "[]");
    historico.unshift({
      id: Date.now(),
      data_hora: new Date().toLocaleString(),
      servidor_nome: servidorNome,
      acao: acao,
      status: status,
      usuario: "Alef"
    });
    localStorage.setItem("restart_historico", JSON.stringify(historico.slice(0, 50)));
  } catch (e) {
    console.error("Erro ao registrar histórico local:", e);
  }
}

// Controla a ativação/desativação dos campos Docker e Caminho Compose em tempo real
function configurarTogglesDocker() {
  const form = document.getElementById('form-servidor') || document.querySelector('form');
  if (!form) return;

  const inputContainer = document.getElementById('srv-container') || 
                         document.getElementById('container') || 
                         Array.from(form.querySelectorAll('input[type="text"]')).find(i => i.placeholder?.includes('api-web-prod'));

  const inputCompose = document.getElementById('srv-caminho-projeto') || 
                       document.getElementById('caminho_projeto') || 
                       Array.from(form.querySelectorAll('input[type="text"]')).find(i => i.placeholder?.includes('meu-projeto'));

  const checkboxes = Array.from(form.querySelectorAll('input[type="checkbox"]'));

  const chkDocker = document.getElementById('chk-docker') || 
                    document.getElementById('usar_docker') || 
                    checkboxes.find(c => c.parentElement?.textContent?.includes('Usar Docker'));

  const chkCompose = document.getElementById('chk-compose') || 
                     document.getElementById('usar_compose') || 
                     checkboxes.find(c => c.parentElement?.textContent?.includes('Usar Compose'));

  if (chkDocker && inputContainer) {
    inputContainer.disabled = !chkDocker.checked;
    inputContainer.style.opacity = chkDocker.checked ? '1' : '0.5';

    chkDocker.onchange = () => {
      inputContainer.disabled = !chkDocker.checked;
      inputContainer.style.opacity = chkDocker.checked ? '1' : '0.5';

      if (chkDocker.checked) {
        inputContainer.focus();
      } else {
        inputContainer.value = '';
      }
    };
  }

  if (chkCompose && inputCompose) {
    inputCompose.disabled = !chkCompose.checked;
    inputCompose.style.opacity = chkCompose.checked ? '1' : '0.5';

    chkCompose.onchange = () => {
      inputCompose.disabled = !chkCompose.checked;
      inputCompose.style.opacity = chkCompose.checked ? '1' : '0.5';

      if (chkCompose.checked) {
        inputCompose.focus();
      } else {
        inputCompose.value = '';
      }
    };
  }
}

// Configura o comportamento unificado do seletor de portas e exibição da porta customizada
function configurarSeletorPortas() {
  const selectPorta = document.getElementById('srv-porta-popular') || document.getElementById('porta_popular');
  const inputPortaCustom = document.getElementById('srv-porta') || document.getElementById('porta');

  if (selectPorta && inputPortaCustom) {
    selectPorta.addEventListener('change', (e) => {
      const valor = e.target.value;
      if (valor === 'custom') {
        inputPortaCustom.style.display = 'block';
        inputPortaCustom.value = '';
        inputPortaCustom.focus();
      } else if (valor !== '') {
        inputPortaCustom.style.display = 'none';
        inputPortaCustom.value = valor;
      } else {
        inputPortaCustom.style.display = 'none';
        inputPortaCustom.value = '';
      }
    });
  }
}

function carregarServidores() {
  const tbody = document.getElementById('lista-servidores');
  if (!tbody) return;

  try {
    const servidores = JSON.parse(localStorage.getItem("restart_servidores") || "[]");

    if (!Array.isArray(servidores) || servidores.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: #8e9a9d; padding: 20px;">
            Nenhum servidor cadastrado.
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = servidores.map(srv => {
      const temAcoesAvancadas = srv.tem_acoes === 1 || srv.tem_acoes === true;

      let targetDisplay = '-';
      if (srv.container) {
        targetDisplay = srv.porta ? `${srv.container}:${srv.porta}` : srv.container;
      } else if (srv.caminho_projeto) {
        targetDisplay = srv.caminho_projeto;
      } else if (srv.porta) {
        targetDisplay = `Porta: ${srv.porta}`;
      }

      return `
        <tr>
          <td><strong>${srv.nome}</strong></td>
          <td><code>${srv.url}</code></td>
          <td><code>${targetDisplay}</code></td>
          <td>${srv.usuario || '-'}</td>
          <td><span class="badge online"><i class="fa-solid fa-circle" style="font-size: 8px;"></i> Online</span></td>
          <td class="actions-cell">
            <div class="actions-container">
              
              <button onclick="rebootServidor(${srv.id}, '${srv.nome}')" class="btn-neon btn-neon-green" title="Reboot do Servidor">
                <i class="fa-solid fa-power-off"></i>
              </button>

              <button onclick="reiniciarServidor(${srv.id}, '${srv.nome}')" class="btn-neon btn-neon-cyan" title="Reiniciar Container / Serviço">
                <i class="fa-solid fa-rotate-right"></i>
              </button>

              ${temAcoesAvancadas ? `
                <button onclick="desmontarServidor(${srv.id}, '${srv.nome}')" class="btn-neon" style="border-color: #6b7280; color: #6b7280; box-shadow: 0 0 8px rgba(107, 114, 128, 0.4);" title="Desmontar">
                  <i class="fa-solid fa-eject"></i>
                </button>
                <button onclick="montarSubirServidor(${srv.id}, '${srv.nome}')" class="btn-neon" style="border-color: #2563eb; color: #2563eb; box-shadow: 0 0 8px rgba(37, 99, 235, 0.4);" title="Montar e Subir Serviços">
                  <i class="fa-solid fa-play"></i>
                </button>
              ` : ''}

              <button onclick="deletarServidor(${srv.id})" class="btn-neon btn-neon-red" title="Excluir Servidor">
                <i class="fa-solid fa-trash"></i>
              </button>

            </div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Erro ao carregar servidores:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: #ef4444; padding: 20px;">
          Erro ao carregar servidores locais.
        </td>
      </tr>`;
  }
}

function configurarFormulario() {
  const form = document.getElementById('form-servidor');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const checkboxes = Array.from(form.querySelectorAll('input[type="checkbox"]'));

    const chkDocker = document.getElementById('chk-docker') || 
                      document.getElementById('usar_docker') || 
                      checkboxes.find(c => c.parentElement?.textContent?.includes('Usar Docker'));

    const chkCompose = document.getElementById('chk-compose') || 
                       document.getElementById('usar_compose') || 
                       checkboxes.find(c => c.parentElement?.textContent?.includes('Usar Compose'));

    const nome = document.getElementById('srv-nome')?.value || document.getElementById('nome')?.value || '';
    const url = document.getElementById('srv-url')?.value || document.getElementById('url')?.value || '';
    const tipo = document.getElementById('srv-tipo')?.value || document.getElementById('tipo')?.value || 'Ping';
    const usuario = document.getElementById('srv-user')?.value || document.getElementById('usuario')?.value || '';
    
    const selectPortaVal = document.getElementById('srv-porta-popular')?.value || '';
    const inputPortaCustomVal = document.getElementById('srv-porta')?.value || '';
    
    let porta = '';
    if (selectPortaVal === 'custom') {
      porta = inputPortaCustomVal;
    } else {
      porta = selectPortaVal;
    }

    const inputContainerVal = document.getElementById('srv-container')?.value || document.getElementById('container')?.value || '';
    const inputComposeVal = document.getElementById('srv-caminho-projeto')?.value || document.getElementById('caminho_projeto')?.value || '';

    const container = (chkDocker && chkDocker.checked) ? inputContainerVal : '';
    const caminho_projeto = (chkCompose && chkCompose.checked) ? inputComposeVal : '';

    const tem_acoes = (document.getElementById('chk-has-actions')?.checked || document.getElementById('tem_acoes')?.checked) ? 1 : 0;

    const novoServidor = {
      id: Date.now(),
      nome,
      url,
      tipo,
      usuario,
      container,
      porta,
      caminho_projeto,
      tem_acoes
    };

    try {
      const servidores = JSON.parse(localStorage.getItem("restart_servidores") || "[]");
      servidores.push(novoServidor);
      localStorage.setItem("restart_servidores", JSON.stringify(servidores));

      registrarHistoricoLocal(nome, "Cadastro de Servidor", "Sucesso");

      form.reset();
      const selectPortaPopular = document.getElementById('srv-porta-popular');
      const inputPortaCustom = document.getElementById('srv-porta');
      if (selectPortaPopular) selectPortaPopular.value = '';
      if (inputPortaCustom) {
        inputPortaCustom.style.display = 'none';
        inputPortaCustom.value = '';
      }

      configurarTogglesDocker();
      carregarServidores();
      alert('Servidor cadastrado com sucesso!');
    } catch (err) {
      alert('Erro ao salvar o servidor localmente.');
    }
  });
}

// Funções de Gerenciamento de Usuários
function configurarToggleSenhaUsuario() {
  const btnToggle = document.getElementById('toggle-senha-usr');
  const inputPass = document.getElementById('usr-pass');

  if (btnToggle && inputPass) {
    btnToggle.addEventListener('click', () => {
      const tipoAtual = inputPass.getAttribute('type');
      if (tipoAtual === 'password') {
        inputPass.setAttribute('type', 'text');
        btnToggle.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
      } else {
        inputPass.setAttribute('type', 'password');
        btnToggle.innerHTML = '<i class="fa-solid fa-eye"></i>';
      }
    });
  }
}

async function carregarUsuarios() {
  const tbody = document.getElementById('lista-usuarios');
  if (!tbody) return;

  try {
    const usuarios = JSON.parse(localStorage.getItem("restart_usuarios") || "[]");

    if (!Array.isArray(usuarios) || usuarios.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: #8e9a9d; padding: 20px;">
            Nenhum usuário cadastrado.
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = usuarios.map(usr => `
      <tr>
        <td><strong>${usr.nome}</strong></td>
        <td><code>${usr.email}</code></td>
        <td>${usr.perfil || 'Operador'}</td>
        <td><span class="badge online"><i class="fa-solid fa-circle" style="font-size: 8px;"></i> Ativo</span></td>
        <td class="actions-cell" style="text-align: center;">
          <button onclick="deletarUsuario(${usr.id})" class="btn-neon btn-neon-red" title="Excluir Usuário" style="margin: 0 auto;">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Erro ao carregar usuários:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: #ef4444; padding: 20px;">
          Erro ao carregar usuários.
        </td>
      </tr>`;
  }
}

function configurarFormularioUsuario() {
  const form = document.getElementById('form-usuario');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nome = document.getElementById('usr-nome')?.value || '';
    const email = document.getElementById('usr-email')?.value || '';
    const perfil = document.getElementById('usr-perfil')?.value || 'Operador';

    const novoUsuario = { id: Date.now(), nome, email, perfil };

    try {
      const usuarios = JSON.parse(localStorage.getItem("restart_usuarios") || "[]");
      usuarios.push(novoUsuario);
      localStorage.setItem("restart_usuarios", JSON.stringify(usuarios));

      form.reset();
      carregarUsuarios();
      alert('Usuário cadastrado com sucesso!');
    } catch (err) {
      alert('Erro ao salvar usuário localmente.');
    }
  });
}

async function deletarUsuario(id) {
  if (!confirm('Deseja realmente excluir este usuário?')) return;

  try {
    let usuarios = JSON.parse(localStorage.getItem("restart_usuarios") || "[]");
    usuarios = usuarios.filter(u => u.id !== id);
    localStorage.setItem("restart_usuarios", JSON.stringify(usuarios));
    carregarUsuarios();
  } catch (err) {
    alert('Erro ao excluir usuário.');
  }
}

async function reiniciarServidor(id, nome) {
  if (!confirm(`Deseja REINICIAR O CONTAINER / SERVIÇO de "${nome}"?`)) return;
  registrarHistoricoLocal(nome, "Reiniciar Container / Serviço", "Sucesso");
  alert(`Comando de restart executado com sucesso para ${nome}.`);
  carregarServidores();
}

async function rebootServidor(id, nome) {
  if (!confirm(`ATENÇÃO: Deseja REALIZAR REBOOT no servidor "${nome}"?`)) return;
  registrarHistoricoLocal(nome, "Reboot do Servidor", "Sucesso");
  alert(`Comando de reboot executado com sucesso para ${nome}.`);
  carregarServidores();
}

async function desmontarServidor(id, nome) {
  if (!confirm(`Deseja DESMONTAR os serviços de "${nome}"?`)) return;
  registrarHistoricoLocal(nome, "Desmontar Serviços", "Sucesso");
  alert(`Comando de desmontagem executado para ${nome}.`);
  carregarServidores();
}

async function montarSubirServidor(id, nome) {
  if (!confirm(`Deseja MONTAR E SUBIR os serviços de "${nome}"?`)) return;
  registrarHistoricoLocal(nome, "Montar e Subir Serviços", "Sucesso");
  alert(`Comando de montagem executado para ${nome}.`);
  carregarServidores();
}

async function deletarServidor(id) {
  if (!confirm('Deseja remover este servidor?')) return;
  try {
    let servidores = JSON.parse(localStorage.getItem("restart_servidores") || "[]");
    const srvRemovido = servidores.find(s => s.id === id);
    servidores = servidores.filter(s => s.id !== id);
    localStorage.setItem("restart_servidores", JSON.stringify(servidores));
    
    if (srvRemovido) {
      registrarHistoricoLocal(srvRemovido.nome, "Exclusão de Servidor", "Sucesso");
    }
    carregarServidores();
  } catch (err) {
    alert('Erro ao excluir servidor.');
  }
}

// Função global para carregar histórico (chamada pelo modal no HTML)
async function carregarHistorico() {
  const tbody = document.getElementById('lista-historico');
  if (!tbody) return;

  try {
    const historico = JSON.parse(localStorage.getItem("restart_historico") || "[]");

    if (!Array.isArray(historico) || historico.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: #8e9a9d; padding: 15px;">
            Nenhum registro de histórico encontrado.
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = historico.map(h => `
      <tr>
        <td>${h.data_hora || '-'}</td>
        <td><strong>${h.servidor_nome || '-'}</strong></td>
        <td>${h.acao || '-'}</td>
        <td><span class="badge ${h.status === 'Sucesso' ? 'online' : 'offline'}">${h.status || 'Registrado'}</span></td>
        <td>${h.usuario || 'Alef'}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Erro ao carregar histórico:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: #ef4444; padding: 15px;">
          Erro ao carregar o histórico de execuções.
        </td>
      </tr>`;
  }
}

function fazerLogout() {
  if (confirm('Deseja realmente encerrar a sessão?')) {
    window.location.href = 'index.html';
  }
}

// Aliases para compatibilidade com o modo Kiosk / Tela Cheia
function toggleKiosk() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.error(`Erro ao tentar entrar em tela cheia: ${err.message}`);
    });
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

function toggleTelaCheia() {
  toggleKiosk();
}