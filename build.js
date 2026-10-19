const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const distDir = path.join(rootDir, 'dist');

console.log('🚀 Iniciando build unificado dos frontends...');

// 1. Limpar e recriar diretório dist/
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// 2. Copiar frontend-public para a raiz de dist/
const publicDir = path.join(rootDir, 'frontend-public');
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, distDir, { recursive: true });
  console.log('✅ frontend-public copiado para a raiz (/)');
} else {
  console.error('❌ Diretório frontend-public não encontrado!');
}

// Remover netlify.toml legado de dentro de frontend-public para evitar conflitos de rotas
const oldNetlifyToml = path.join(distDir, 'netlify.toml');
if (fs.existsSync(oldNetlifyToml)) {
  fs.unlinkSync(oldNetlifyToml);
}

// 3. Copiar frontend-area-usuario para dist/usuario/
const usuarioSrc = path.join(rootDir, 'frontend-area-usuario');
const usuarioDest = path.join(distDir, 'usuario');
if (fs.existsSync(usuarioSrc)) {
  fs.mkdirSync(usuarioDest, { recursive: true });
  fs.cpSync(usuarioSrc, usuarioDest, { recursive: true });
  console.log('✅ frontend-area-usuario copiado para (/usuario/)');
} else {
  console.error('❌ Diretório frontend-area-usuario não encontrado!');
}

// 4. Copiar frontend-admin para dist/admin/
const adminSrc = path.join(rootDir, 'frontend-admin');
const adminDest = path.join(distDir, 'admin');
if (fs.existsSync(adminSrc)) {
  fs.mkdirSync(adminDest, { recursive: true });
  fs.cpSync(adminSrc, adminDest, { recursive: true });
  console.log('✅ frontend-admin copiado para (/admin/)');
} else {
  console.error('❌ Diretório frontend-admin não encontrado!');
}

// 5. Gerar arquivo _redirects do Netlify para garantir roteamento perfeito
const redirectsContent = `# Redirecionamentos de conveniência para as pastas
/usuario        /usuario/login.html       301
/usuario/       /usuario/login.html       301
/admin          /admin/index.html         301
/admin/         /admin/index.html         301
`;

fs.writeFileSync(path.join(distDir, '_redirects'), redirectsContent, 'utf-8');
console.log('✅ dist/_redirects gerado com sucesso!');

console.log('🎉 Build unificado concluído com sucesso em dist/!');
