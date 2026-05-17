const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 3008;
const DATA_FILE = path.join(__dirname, 'submissions.json');
const ADMIN_FILE = path.join(__dirname, 'admin.json');
const SECRET = 'jk_prob_2025_secret';

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {}
  return [];
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function loadAdmin() {
  try {
    if (fs.existsSync(ADMIN_FILE)) return JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
  } catch (e) {}
  return { password: 'jk2025', updatedAt: Date.now() };
}

function saveAdmin(data) {
  fs.writeFileSync(ADMIN_FILE, JSON.stringify(data, null, 2));
}

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

// Token store: { token: expiresMs }
const tokens = {};

setInterval(() => {
  const now = Date.now();
  Object.keys(tokens).forEach(t => { if (tokens[t] < now) delete tokens[t]; });
}, 60 * 60 * 1000);

function authToken(token) {
  if (!token || !tokens[token] || tokens[token] < Date.now()) return false;
  return true;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const STATIC_DIR = __dirname;

function sendJSON(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function sendFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = req.url.split('?')[0];
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  // ---- Public APIs ----
  if (url === '/api/submissions' && req.method === 'GET') {
    return sendJSON(res, loadData());
  }

  if (url === '/api/submit' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { name, probability } = JSON.parse(body);
        if (!name || !name.trim()) return sendJSON(res, { error: '名字不能为空' }, 400);
        const prob = parseFloat(probability);
        if (isNaN(prob) || prob < 0.1 || prob > 100) return sendJSON(res, { error: '概率必须在 0.1 - 100 之间' }, 400);
        const data = loadData();
        const newSub = { id: 'sub_' + Date.now(), name: name.trim().slice(0, 10), probability: prob.toFixed(1), createdAt: Date.now() };
        data.push(newSub);
        saveData(data);
        sendJSON(res, { success: true, data: newSub });
      } catch (e) { sendJSON(res, { error: '数据格式错误' }, 400); }
    });
    return;
  }

  // ---- Admin APIs ----
  if (url === '/api/admin/login' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { password } = JSON.parse(body);
        const admin = loadAdmin();
        if (password !== admin.password) return sendJSON(res, { error: '密码错误' }, 401);
        const tk = makeToken();
        tokens[tk] = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
        sendJSON(res, { success: true, token: tk });
      } catch (e) { sendJSON(res, { error: '请求格式错误' }, 400); }
    });
    return;
  }

  if (url === '/api/admin/submissions' && req.method === 'GET') {
    if (!authToken(token)) return sendJSON(res, { error: '未授权' }, 401);
    return sendJSON(res, loadData());
  }

  if (url === '/api/admin/submissions' && req.method === 'DELETE') {
    if (!authToken(token)) return sendJSON(res, { error: '未授权' }, 401);
    const data = loadData();
    data.length = 0;
    saveData(data);
    return sendJSON(res, { success: true });
  }

  if (url.startsWith('/api/admin/submissions/') && req.method === 'DELETE') {
    if (!authToken(token)) return sendJSON(res, { error: '未授权' }, 401);
    const id = url.split('/').pop();
    const data = loadData().filter(s => s.id !== id);
    saveData(data);
    return sendJSON(res, { success: true });
  }

  if (url === '/api/admin/password' && req.method === 'POST') {
    if (!authToken(token)) return sendJSON(res, { error: '未授权' }, 401);
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { password } = JSON.parse(body);
        if (!password || password.length < 3) return sendJSON(res, { error: '密码太短' }, 400);
        const admin = loadAdmin();
        admin.password = password;
        admin.updatedAt = Date.now();
        saveAdmin(admin);
        sendJSON(res, { success: true });
      } catch (e) { sendJSON(res, { error: '请求格式错误' }, 400); }
    });
    return;
  }

  // Static files
  if (url === '/admin') return sendFile(path.join(STATIC_DIR, 'admin.html'), res);

  let filePath = path.join(STATIC_DIR, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(STATIC_DIR, 'index.html');
  sendFile(filePath, res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`JK概率 server running at http://127.0.0.1:${PORT}`);
});