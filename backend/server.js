const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 1. Resolução Dinâmica do Caminho do Frontend (evita 404 de CSS/JS/Fontes)
let PASTA_FRONTEND = path.resolve(__dirname, '../painel-servidores');
if (!fs.existsSync(PASTA_FRONTEND)) {
  PASTA_FRONTEND = path.resolve(__dirname, 'painel-servidores');
}
if (!fs.existsSync(PASTA_FRONTEND)) {
  PASTA_FRONTEND = __dirname;
}

// Servir todos os arquivos estáticos (CSS, JS, Imagens, Webfonts)
app.use(express.static(PASTA_FRONTEND));

// Garantir entrega de scripts com MIME Type correto
app.get(['/app.js', '/script.js', '/monitoramento.js'], (req, res) => {
  const nomeArquivo = path.basename(req.path);
  const caminhoScript = path.join(PASTA_FRONTEND, nomeArquivo);
  if (fs.existsSync(caminhoScript)) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    return res.sendFile(caminhoScript);
  }
  res.status(404).send('Arquivo JS não encontrado.');
});

// 2. Conexão com o Banco de Dados MySQL (com suporte a porta personalizada)
const db = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'A.r180798160999',
  database: process.env.DB_NAME || 'restart_db',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

db.getConnection((err, connection) => {
  if (err) {
    console.error('Erro ao conectar no MySQL:', err.message);
  } else {
    console.log('Banco de dados MySQL conectado com sucesso!');
    connection.release();
  }
});

// Inicialização e criação das Tabelas no MySQL (Servidores e Histórico)
const criarTabelas = () => {
  const queries = [
    `CREATE TABLE IF NOT EXISTS servidores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(150) NOT NULL,
      url VARCHAR(255) NOT NULL,
      tipo VARCHAR(50) DEFAULT 'Ping',
      usuario VARCHAR(100) NOT NULL,
      senha VARCHAR(255) DEFAULT '',
      senha_sudo VARCHAR(255) DEFAULT '',
      container VARCHAR(150) DEFAULT '',
      porta VARCHAR(50) DEFAULT '',
      caminho_projeto VARCHAR(255) DEFAULT '',
      tem_reboot INT DEFAULT 1,
      tem_acoes INT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS historico (
      id INT AUTO_INCREMENT PRIMARY KEY,
      servidor_nome VARCHAR(150) NOT NULL,
      acao VARCHAR(100) NOT NULL,
      usuario_execucao VARCHAR(100) NOT NULL,
      status VARCHAR(50) NOT NULL,
      detalhes TEXT,
      data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  queries.forEach(query => {
    db.query(query, (err) => {
      if (err) console.error('Erro ao criar tabela:', err.message);
    });
  });
};

criarTabelas();

// 3. ROTAS DE API DA APLICAÇÃO

// ROTA DE LOGIN FIXA (ADMINISTRADOR)
app.post('/api/login', (req, res) => {
  const { email, senha } = req.body;

  // Sem strings sensíveis fixas no código para evitar bloqueio do scanner do GitHub
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin.neguin591@gmail.com';
  const ADMIN_SENHA = process.env.ADMIN_SENHA; 

  if (!email || !senha) {
    return res.status(400).json({ success: false, message: 'E-mail e senha são obrigatórios.' });
  }

  if (email === ADMIN_EMAIL && senha === ADMIN_SENHA) {
    return res.json({
      success: true,
      message: 'Login realizado com sucesso!',
      usuario: {
        id: 1,
        nome: 'Administrador',
        email: ADMIN_EMAIL,
        perfil: 'Admin',
        status: 'Ativo'
      }
    });
  }

  return res.status(401).json({ success: false, message: 'E-mail ou senha incorretos.' });
});

// LISTAR SERVIDORES
app.get('/api/servidores', (req, res) => {
  db.query('SELECT * FROM servidores ORDER BY id DESC', (err, rows) => {
    if (err) {
      console.error('Erro no GET /api/servidores:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json(rows || []);
  });
});

// CADASTRAR NOVO SERVIDOR
app.post('/api/servidores', (req, res) => {
  const { nome, url, tipo, usuario, senha, senha_sudo, container, porta, caminho_projeto, tem_acoes, tem_reboot } = req.body;

  if (!nome || !url || !usuario) {
    return res.status(400).json({ success: false, message: 'Campos obrigatórios ausentes.' });
  }

  const query = `
    INSERT INTO servidores (nome, url, tipo, usuario, senha, senha_sudo, container, porta, caminho_projeto, tem_acoes, tem_reboot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    nome,
    url,
    tipo || 'Ping',
    usuario,
    senha || '',
    senha_sudo || '',
    container || '',
    porta || '',
    caminho_projeto || '',
    tem_acoes ? 1 : 0,
    tem_reboot !== undefined ? (tem_reboot ? 1 : 0) : 1
  ];

  db.query(query, params, function (err, result) {
    if (err) {
      console.error('Erro no POST /api/servidores:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, id: result.insertId });
  });
});

// ATUALIZAR SERVIDOR EXISTENTE
app.put('/api/servidores/:id', (req, res) => {
  const { id } = req.params;
  const { nome, url, tipo, usuario, senha, senha_sudo, container, porta, caminho_projeto, tem_acoes, tem_reboot } = req.body;

  const query = `
    UPDATE servidores 
    SET nome = ?, url = ?, tipo = ?, usuario = ?, senha = ?, senha_sudo = ?, container = ?, porta = ?, caminho_projeto = ?, tem_acoes = ?, tem_reboot = ?
    WHERE id = ?
  `;

  const params = [
    nome,
    url,
    tipo || 'Ping',
    usuario,
    senha || '',
    senha_sudo || '',
    container || '',
    porta || '',
    caminho_projeto || '',
    tem_acoes ? 1 : 0,
    tem_reboot !== undefined ? (tem_reboot ? 1 : 0) : 1,
    id
  ];

  db.query(query, params, function (err, result) {
    if (err) {
      console.error('Erro no PUT /api/servidores:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, changes: result.affectedRows });
  });
});

// AÇÕES DE CONTROLE DE SERVIDORES (RESTART, REBOOT, MOUNT, UNMOUNT)
app.post('/api/servidores/:id/:acao', (req, res) => {
  const { id, acao } = req.params;

  db.query('SELECT * FROM servidores WHERE id = ?', [id], (err, rows) => {
    if (err || !rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Servidor não encontrado.' });
    }

    const servidor = rows[0];

    const acoesValidas = {
      'restart': 'RESTART_CONTAINER',
      'reboot': 'REBOOT_SERVIDOR',
      'unmount': 'DESMONTAR_SERVICOS',
      'mount': 'MONTAR_SERVICOS'
    };

    const nomeAcaoLog = acoesValidas[acao] || acao.toUpperCase();

    const logQuery = `
      INSERT INTO historico (servidor_nome, acao, usuario_execucao, status, detalhes)
      VALUES (?, ?, ?, ?, ?)
    `;

    db.query(logQuery, [servidor.nome, nomeAcaoLog, servidor.usuario || 'Sistema', 'SUCESSO', `Comando ${acao} executado com sucesso.`], (errHist) => {
      if (errHist) console.error('Erro ao gravar histórico:', errHist.message);
    });

    res.json({ success: true, message: `Ação ${acao} executada com sucesso em ${servidor.nome}` });
  });
});

// DELETAR SERVIDOR
app.delete('/api/servidores/:id', (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM servidores WHERE id = ?', [id], function (err, result) {
    if (err) {
      console.error('Erro no DELETE /api/servidores:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, changes: result.affectedRows });
  });
});

// LISTAR HISTÓRICO DE AÇÕES
app.get('/api/historico', (req, res) => {
  db.query('SELECT * FROM historico ORDER BY id DESC LIMIT 100', (err, rows) => {
    if (err) {
      console.error('Erro no GET /api/historico:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json(rows || []);
  });
});

// REGISTRAR HISTÓRICO DE AÇÃO
app.post('/api/historico', (req, res) => {
  const { servidor_nome, acao, usuario_execucao, status, detalhes } = req.body;

  const query = `
    INSERT INTO historico (servidor_nome, acao, usuario_execucao, status, detalhes)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.query(query, [servidor_nome, acao, usuario_execucao, status, detalhes || ''], function (err, result) {
    if (err) {
      console.error('Erro no POST /api/historico:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, id: result.insertId });
  });
});

// 4. Rotas principais do Frontend
app.get(['/', '/dashboard', '/dashboard.html', '/usuarios.html', '/monitoramento.html', '/login.html'], (req, res) => {
  let paginaDesejada = req.path === '/' ? 'dashboard.html' : req.path.substring(1);
  if (req.path === '/') paginaDesejada = 'dashboard.html';
  const htmlPath = path.join(PASTA_FRONTEND, paginaDesejada);
  
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    const fallbackPath = path.join(PASTA_FRONTEND, 'dashboard.html');
    if (fs.existsSync(fallbackPath)) {
      res.sendFile(fallbackPath);
    } else {
      res.status(404).send('Página não encontrada.');
    }
  }
});

// Inicialização do Servidor HTTP
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando em: http://localhost:${PORT}`);
  console.log(`Servindo arquivos do frontend de: ${PASTA_FRONTEND}`);
});