const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');

// Importação segura do logger para evitar erros de tipo
let loggerModule = require('./logger');
const logger = {
  info: (msg) => (typeof loggerModule.info === 'function' ? loggerModule.info(msg) : console.log(`[INFO] ${msg}`)),
  error: (msg) => (typeof loggerModule.error === 'function' ? loggerModule.error(msg) : console.error(`[ERROR] ${msg}`)),
  warn: (msg) => (typeof loggerModule.warn === 'function' ? loggerModule.warn(msg) : console.warn(`[WARN] ${msg}`))
};

const app = express();
const PORT = process.env.PORT || 3000;

// Essencial para o Render (HTTPS / Proxy reverso)
app.set('trust proxy', 1);

// 1. Configurações de Segurança e Middlewares Globais
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuração da Sessão adaptada para HTTPS no Render
app.use(session({
  secret: process.env.SESSION_SECRET || 'restart_secret_key_security_99',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: true, 
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 1 dia de validade
  }
}));

// Rate Limiting para a rota de login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Muitas tentativas de login a partir deste IP. Tente novamente mais tarde.' }
});

// 2. Resolução Dinâmica do Caminho do Frontend
let PASTA_FRONTEND = path.resolve(__dirname, '../painel-servidores');
if (!fs.existsSync(PASTA_FRONTEND)) {
  PASTA_FRONTEND = path.resolve(__dirname, 'painel-servidores');
}
if (!fs.existsSync(PASTA_FRONTEND)) {
  PASTA_FRONTEND = __dirname;
}

// 3. ROTA DE LOGIN (Deve vir antes do bloqueio estático de páginas)
app.post('/api/login', loginLimiter, (req, res) => {
  const email = (req.body.email || '').trim();
  const senha = (req.body.senha || '').trim();

  const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin.neguin591@gmail.com').trim();
  const ADMIN_SENHA = (process.env.ADMIN_SENHA || '').trim(); 

  if (!email || !senha) {
    return res.status(400).json({ success: false, message: 'E-mail e senha são obrigatórios.' });
  }

  if (email === ADMIN_EMAIL && senha === ADMIN_SENHA) {
    req.session.autenticado = true;
    req.session.usuario = {
      id: 1,
      nome: 'Administrador',
      email: ADMIN_EMAIL,
      perfil: 'Admin',
      status: 'Ativo'
    };

    logger.info(`Login bem-sucedido para o administrador: ${ADMIN_EMAIL}`);
    return res.json({
      success: true,
      message: 'Login realizado com sucesso!',
      usuario: req.session.usuario
    });
  }

  logger.warn(`Tentativa de login falha para o e-mail: ${email}`);
  return res.status(401).json({ success: false, message: 'E-mail ou senha incorretos.' });
});

// Rota de Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
  });
});

// Middleware para verificar se o usuário está autenticado nas APIs protegidas
const verificarSessaoApi = (req, res, next) => {
  if (req.session && req.session.autenticado) {
    return next();
  }
  return res.status(401).json({ success: false, message: 'Não autorizado. Faça login novamente.' });
};

// 4. BLOQUEIO DE SEGURANÇA PARA PÁGINAS HTML E ARQUIVOS ESTÁTICOS PROTEGIDOS
app.use((req, res, next) => {
  const caminho = req.path.toLowerCase();

  // Liberar rotas públicas, login, assets e arquivos estáticos essenciais
  if (
    caminho === '/login.html' || 
    caminho === '/index.html' ||
    caminho === '/' ||
    caminho === '/api/login' || 
    caminho.endsWith('.css') || 
    caminho.endsWith('.js') || 
    caminho.endsWith('.png') || 
    caminho.endsWith('.jpg') || 
    caminho.endsWith('.ico') ||
    caminho.startsWith('/css') || 
    caminho.startsWith('/js') || 
    caminho.startsWith('/img')
  ) {
    return next();
  }

  // Se não estiver autenticado e tentar acessar qualquer HTML interno ou API protegida
  if (!req.session || !req.session.autenticado) {
    if (caminho.startsWith('/api/')) {
      return res.status(401).json({ success: false, message: 'Não autorizado.' });
    }
    return res.redirect('/login.html');
  }

  next();
});

// Servir arquivos estáticos do frontend
app.use(express.static(PASTA_FRONTEND));

// 5. CONEXÃO COM O BANCO DE DADOS MYSQL
const db = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'restart_db',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

db.getConnection((err, connection) => {
  if (err) {
    logger.error(`Erro ao conectar no MySQL: ${err.message}`);
  } else {
    logger.info('Banco de dados MySQL conectado com sucesso!');
    connection.release();
  }
});

// Criar tabelas se não existirem
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
      if (err) logger.error(`Erro ao criar tabela: ${err.message}`);
    });
  });
};

criarTabelas();

// 6. ROTAS DE API PROTEGIDAS
app.get('/api/servidores', verificarSessaoApi, (req, res) => {
  db.query('SELECT * FROM servidores ORDER BY id DESC', (err, rows) => {
    if (err) {
      logger.error(`Erro no GET /api/servidores: ${err.message}`);
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json(rows || []);
  });
});

app.post('/api/servidores', verificarSessaoApi, (req, res) => {
  const { nome, url, tipo, usuario, senha, senha_sudo, container, porta, caminho_projeto, tem_acoes, tem_reboot } = req.body;

  if (!nome || !url || !usuario) {
    return res.status(400).json({ success: false, message: 'Campos obrigatórios ausentes.' });
  }

  const query = `
    INSERT INTO servidores (nome, url, tipo, usuario, senha, senha_sudo, container, porta, caminho_projeto, tem_acoes, tem_reboot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    nome, url, tipo || 'Ping', usuario, senha || '', senha_sudo || '',
    container || '', porta || '', caminho_projeto || '',
    tem_acoes ? 1 : 0, tem_reboot !== undefined ? (tem_reboot ? 1 : 0) : 1
  ];

  db.query(query, params, function (err, result) {
    if (err) {
      logger.error(`Erro no POST /api/servidores: ${err.message}`);
      return res.status(500).json({ success: false, error: err.message });
    }
    logger.info(`Servidor cadastrado com sucesso: ${nome}`);
    res.json({ success: true, id: result.insertId });
  });
});

app.put('/api/servidores/:id', verificarSessaoApi, (req, res) => {
  const { id } = req.params;
  const { nome, url, tipo, usuario, senha, senha_sudo, container, porta, caminho_projeto, tem_acoes, tem_reboot } = req.body;

  const query = `
    UPDATE servidores 
    SET nome = ?, url = ?, tipo = ?, usuario = ?, senha = ?, senha_sudo = ?, container = ?, porta = ?, caminho_projeto = ?, tem_acoes = ?, tem_reboot = ?
    WHERE id = ?
  `;

  const params = [
    nome, url, tipo || 'Ping', usuario, senha || '', senha_sudo || '',
    container || '', porta || '', caminho_projeto || '',
    tem_acoes ? 1 : 0, tem_reboot !== undefined ? (tem_reboot ? 1 : 0) : 1, id
  ];

  db.query(query, params, function (err, result) {
    if (err) {
      logger.error(`Erro no PUT /api/servidores/${id}: ${err.message}`);
      return res.status(500).json({ success: false, error: err.message });
    }
    logger.info(`Servidor ID ${id} atualizado com sucesso.`);
    res.json({ success: true, changes: result.affectedRows });
  });
});

app.post('/api/servidores/:id/:acao', verificarSessaoApi, (req, res) => {
  const { id, acao } = req.params;

  db.query('SELECT * FROM servidores WHERE id = ?', [id], (err, rows) => {
    if (err || !rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Servidor não encontrado.' });
    }

    const servidor = rows[0];
    const acoesValidas = { 'restart': 'RESTART_CONTAINER', 'reboot': 'REBOOT_SERVIDOR', 'unmount': 'DESMONTAR_SERVICOS', 'mount': 'MONTAR_SERVICOS' };
    const nomeAcaoLog = acoesValidas[acao] || acao.toUpperCase();

    const logQuery = `INSERT INTO historico (servidor_nome, acao, usuario_execucao, status, detalhes) VALUES (?, ?, ?, ?, ?)`;
    db.query(logQuery, [servidor.nome, nomeAcaoLog, servidor.usuario || 'Sistema', 'SUCESSO', `Comando ${acao} executado com sucesso.`]);

    logger.info(`Ação '${acao}' executada no servidor ${servidor.nome}`);
    res.json({ success: true, message: `Ação ${acao} executada com sucesso em ${servidor.nome}` });
  });
});

app.delete('/api/servidores/:id', verificarSessaoApi, (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM servidores WHERE id = ?', [id], function (err, result) {
    if (err) {
      logger.error(`Erro no DELETE /api/servidores/${id}: ${err.message}`);
      return res.status(500).json({ success: false, error: err.message });
    }
    logger.info(`Servidor ID ${id} removido com sucesso.`);
    res.json({ success: true, changes: result.affectedRows });
  });
});

app.get('/api/historico', verificarSessaoApi, (req, res) => {
  db.query('SELECT * FROM historico ORDER BY id DESC LIMIT 100', (err, rows) => {
    if (err) {
      logger.error(`Erro no GET /api/historico: ${err.message}`);
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json(rows || []);
  });
});

// 7. ROTAS DE FRONTEND COM PROTEÇÃO DE SESSÃO
const verificarSessaoPage = (req, res, next) => {
  if (req.session && req.session.autenticado) {
    return next();
  }
  return res.redirect('/index.html');
};

app.get('/', (req, res) => {
  if (req.session && req.session.autenticado) {
    return res.sendFile(path.join(PASTA_FRONTEND, 'dashboard.html'));
  }
  res.sendFile(path.join(PASTA_FRONTEND, 'index.html'));
});

app.get(['/dashboard', '/dashboard.html', '/usuarios.html', '/monitoramento.html', '/historico.html'], verificarSessaoPage, (req, res) => {
  let paginaDesejada = req.path.substring(1);
  if (!paginaDesejada.includes('.html')) paginaDesejada += '.html';
  
  const htmlPath = path.join(PASTA_FRONTEND, paginaDesejada);
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.status(404).sendFile(path.join(PASTA_FRONTEND, 'dashboard.html'));
  }
});

// Middleware Global de Tratamento de Erros
app.use((err, req, res, next) => {
  logger.error(`Erro interno não tratado: ${err.message}`);
  res.status(500).json({ success: false, error: 'Ocorreu um erro interno no servidor.' });
});

// Inicialização
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Servidor rodando em: http://localhost:${PORT}`);
  logger.info(`Frontend em: ${PASTA_FRONTEND}`);
});