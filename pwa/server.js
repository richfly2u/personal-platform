const https = require('https');
const fs = require('fs');
const path = require('path');
const {execSync} = require('child_process');
const dir = __dirname;

// Gen cert if missing
if (!fs.existsSync('cert.pem')) {
  execSync('openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"', {cwd: dir});
}

const server = https.createServer({
  key: fs.readFileSync(path.join(dir, 'key.pem')),
  cert: fs.readFileSync(path.join(dir, 'cert.pem'))
}, (req, res) => {
  let filePath = path.join(dir, req.url.split('?')[0]);
  if (filePath.endsWith('/')) filePath = path.join(filePath, 'index.html');
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {'Content-Type': path.extname(filePath)==='.js'?'application/javascript':'text/html;charset=utf-8', 'Cache-Control':'no-store'});
    res.end(data);
  } catch(e) { res.writeHead(404); res.end('404'); }
});

server.listen(8443, () => console.log('HTTPS on :8443'));
