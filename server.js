const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 4317);
const MAX_BYTES = 12 * 1024 ** 3;
const PUBLIC = path.join(__dirname, 'public');
const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8']
};

function reply(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}

function run(exe, args, onLine) {
  return new Promise((resolve, reject) => {
    const proc = spawn(exe, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', b => { stdout += b; });
    proc.stderr.on('data', b => {
      const chunk = b.toString();
      stderr = (stderr + chunk).slice(-30000);
      if (onLine) onLine(chunk);
    });
    proc.on('error', reject);
    proc.on('close', code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${exe} exited ${code}: ${stderr.slice(-500)}`)));
  });
}

async function analyze(file, threshold) {
  const probe = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'format=duration:stream=duration', '-of', 'json', file]);
  const info = JSON.parse(probe.stdout);
  if (!info.streams?.length) throw new Error('文件中没有可读取的视频画面。');
  const duration = Number(info.format?.duration || info.streams[0].duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('无法读取视频时长。');

  const cuts = [];
  let log = '';
  await run('ffmpeg', ['-hide_banner', '-nostdin', '-loglevel', 'info', '-i', file, '-map', '0:v:0', '-vf', `scdet=threshold=${threshold}:sc_pass=1,showinfo`, '-an', '-sn', '-dn', '-f', 'null', '-'], chunk => {
    log += chunk;
    const lines = log.split(/\r?\n|\r/g);
    log = lines.pop() || '';
    for (const line of lines) {
      const match = line.match(/\bpts_time:\s*([0-9.]+)/);
      if (line.includes('showinfo') && match) {
        const t = Number(match[1]);
        if (t > 0.01 && t < duration - 0.01) cuts.push(t);
      }
    }
  });
  const unique = [...new Set(cuts.map(t => Number(t.toFixed(4))))].sort((a, b) => a - b);
  return { duration, cuts: unique, threshold, detector: 'FFmpeg scdet' };
}

async function receive(req, filename) {
  const output = fs.createWriteStream(filename, { flags: 'wx' });
  let count = 0;
  try {
    for await (const chunk of req) {
      count += chunk.length;
      if (count > MAX_BYTES) throw new Error('文件超过 12 GB 上限。');
      if (!output.write(chunk)) await new Promise(resolve => output.once('drain', resolve));
    }
    await new Promise((resolve, reject) => output.end(err => err ? reject(err) : resolve()));
    if (!count) throw new Error('上传文件为空。');
  } catch (err) {
    output.destroy();
    throw err;
  }
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://${HOST}:${PORT}`).pathname;
  if (req.method === 'GET' && FILES[pathname]) {
    const [name, type] = FILES[pathname];
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(path.join(PUBLIC, name)).pipe(res);
    return;
  }
  if (req.method === 'POST' && pathname === '/api/analyze') {
    const origin = req.headers.origin;
    if (origin && origin !== `http://${HOST}:${PORT}`) return reply(res, 403, { error: '仅允许本地页面发起分析。' });
    if (req.headers['content-type'] !== 'application/octet-stream') return reply(res, 415, { error: '请上传视频文件。' });
    const threshold = Number(req.headers['x-scene-threshold'] || 10);
    if (!Number.isFinite(threshold) || threshold < 1 || threshold > 60) return reply(res, 400, { error: '检测灵敏度超出范围。' });
    const temp = path.join(os.tmpdir(), `shot-rhythm-${crypto.randomUUID()}.video`);
    let status = 200;
    let payload;
    try {
      await receive(req, temp);
      payload = await analyze(temp, threshold);
    } catch (err) {
      status = 400;
      payload = { error: err.message };
    } finally {
      try {
        await fs.promises.unlink(temp);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          status = 500;
          payload = { error: `临时视频未能删除，请手动删除：${temp}。原因：${err.message}` };
        }
      }
    }
    reply(res, status, payload);
    return;
  }
  reply(res, 404, { error: '未找到页面。' });
});
server.requestTimeout = 0;
server.listen(PORT, HOST, () => console.log(`节奏可视化已启动：http://${HOST}:${PORT}`));
