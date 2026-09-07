// Substitua a seção de arquivos estáticos (item 4) e rotas públicas por esta:

// 4. SERVIÇO DE ASSETS SEGUROS (Apenas CSS, JS, Imagens - SEM HTML)
app.use('/css', express.static(path.join(PASTA_FRONTEND, 'css')));
app.use('/js', express.static(path.join(PASTA_FRONTEND, 'js')));
app.use('/img', express.static(path.join(PASTA_FRONTEND, 'img')));
app.use('/auth-guard.js', express.static(path.join(PASTA_FRONTEND, 'auth-guard.js')));
app.use('/style.css', express.static(path.join(PASTA_FRONTEND, 'style.css')));

// Páginas estáticas exclusivamente públicas (sem autenticação)
app.get(['/', '/index.html', '/login.html'], (req, res) => {
  if (req.session && req.session.autenticado) {
    return res.sendFile(path.join(PASTA_FRONTEND, 'dashboard.html'));
  }
  res.sendFile(path.join(PASTA_FRONTEND, 'index.html'));
});

// 5. ROTAS DE PÁGINAS PROTEGIDAS RIGOROSAMENTE PELO SERVIDOR
const verificarSessaoPage = (req, res, next) => {
  if (req.session && req.session.autenticado) {
    return next();
  }
  return res.redirect('/index.html');
};

// Bloqueio rigoroso para qualquer outra página interna .html ou rota do painel
app.get(['/dashboard', '/dashboard.html', '/usuarios.html', '/monitoramento.html', '/historico.html'], verificarSessaoPage, (req, res) => {
  let paginaDesejada = req.path.substring(1);
  if (!paginaDesejada.includes('.html')) paginaDesejada += '.html';
  
  const htmlPath = path.join(PASTA_FRONTEND, paginaDesejada);
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.sendFile(path.join(PASTA_FRONTEND, 'dashboard.html'));
  }
});