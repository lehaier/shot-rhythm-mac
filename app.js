const $ = id => document.getElementById(id);
const state = { file: null, url: null, duration: 0, cuts: [], selected: 0, threshold: 10 };
const svgNS = 'http://www.w3.org/2000/svg';

function fmt(seconds, decimals = 1) {
  if (!Number.isFinite(seconds)) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = (seconds % 60).toFixed(decimals).padStart(decimals ? 2 + decimals + 1 : 2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
function median(values) {
  const a = [...values].sort((x, y) => x - y);
  if (!a.length) return 0;
  const n = a.length;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}
function quantile(values, p) {
  if (!values.length) return 1;
  const a = [...values].sort((x, y) => x - y);
  const pos = (a.length - 1) * p;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}
function shots() {
  const points = [0, ...state.cuts, state.duration];
  return points.slice(0, -1).map((start, i) => ({ start, end: points[i + 1], length: points[i + 1] - start, index: i }));
}
function mix(a, b, t) {
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function colorScale(list) {
  const mid = median(list.map(s => s.length));
  const fast = list.filter(s => s.length < mid).map(s => mid - s.length);
  const slow = list.filter(s => s.length > mid).map(s => s.length - mid);
  const fastMax = Math.max(.001, quantile(fast, .95));
  const slowMax = Math.max(.001, quantile(slow, .95));
  return { mid, get(length) {
    if (Math.abs(length - mid) < .00001) return '#dcd9d3';
    if (length < mid) return mix([235, 184, 176], [166, 51, 60], Math.min(1, (mid - length) / fastMax));
    return mix([185, 204, 217], [43, 96, 139], Math.min(1, (length - mid) / slowMax));
  }};
}
function node(name, attrs = {}, text) {
  const el = document.createElementNS(svgNS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  if (text !== undefined) el.textContent = text;
  return el;
}
function getWidth() { return Math.max(700, $('chartScroll').clientWidth - 2) * Number($('zoomRange').value); }
function draw() {
  const svg = $('timeline');
  svg.replaceChildren();
  const width = getWidth(), left = 18, right = 18, usable = width - left - right;
  const list = shots(), scale = colorScale(list);
  svg.setAttribute('width', width); svg.setAttribute('height', 172); svg.setAttribute('viewBox', `0 0 ${width} 172`);
  svg.append(node('rect', { x: left, y: 41, width: usable, height: 75, fill: '#0d1013', rx: 3 }));
  list.forEach(s => {
    const x = left + usable * s.start / state.duration;
    const w = usable * s.length / state.duration;
    const rect = node('rect', { x, y: 41, width: w, height: 75, fill: scale.get(s.length), 'data-index': s.index });
    rect.append(node('title', {}, `镜头 ${s.index + 1} · ${fmt(s.start, 2)}–${fmt(s.end, 2)} · ${s.length.toFixed(2)} 秒`));
    rect.addEventListener('click', () => selectShot(s.index, true));
    svg.append(rect);
    if (s.index && w >= 1) svg.append(node('line', { x1: x, x2: x, y1: 41, y2: 116, stroke: '#101215', 'stroke-width': Math.min(1.2, width / 1000) }));
  });
  const selected = list[state.selected];
  if (selected) {
    const x = left + usable * selected.start / state.duration, w = usable * selected.length / state.duration;
    svg.append(node('rect', { x, y: 39, width: Math.max(2, w), height: 79, fill: 'none', stroke: '#f2ede3', 'stroke-width': 2, 'pointer-events': 'none' }));
  }
  const ticks = Math.max(2, Math.min(10, Math.round(width / 150)));
  for (let i = 0; i <= ticks; i++) {
    const x = left + usable * i / ticks;
    svg.append(node('line', { x1: x, x2: x, y1: 126, y2: 132, stroke: '#63717a' }));
    svg.append(node('text', { x, y: 150, fill: '#88949c', 'font-size': 10, 'text-anchor': i === 0 ? 'start' : i === ticks ? 'end' : 'middle', 'font-family': 'Arial, sans-serif' }, fmt(state.duration * i / ticks, 0)));
  }
  $('legendMedian').textContent = `中位数 ${scale.mid.toFixed(2)} 秒`;
}
function update() {
  if (!state.duration) return;
  const list = shots(), mid = median(list.map(s => s.length));
  state.selected = Math.max(0, Math.min(state.selected, list.length - 1));
  $('durationStat').textContent = fmt(state.duration);
  $('countStat').textContent = list.length;
  $('medianStat').textContent = `${mid.toFixed(2)} 秒`;
  $('meanStat').textContent = `${(state.duration / list.length).toFixed(2)} 秒`;
  $('cutCount').textContent = `${state.cuts.length} 个切点`;
  $('fileMeta').textContent = `${state.file?.name || '视频'} · ${list.length} 个镜头 · 按真实时长绘制`;
  $('zoomValue').textContent = `${$('zoomRange').value}×`;
  draw();
  selectShot(state.selected, false, false);
}
function selectShot(index, seek = false, redraw = true) {
  const list = shots();
  state.selected = Math.max(0, Math.min(index, list.length - 1));
  const s = list[state.selected];
  if (!s) return;
  const mid = median(list.map(x => x.length));
  $('selectedTitle').textContent = `镜头 ${s.index + 1} / ${list.length}`;
  $('selectedTime').textContent = `${fmt(s.start, 2)} — ${fmt(s.end, 2)}`;
  $('selectedNote').textContent = `时长 ${s.length.toFixed(2)} 秒 · ${s.length < mid ? '快于' : s.length > mid ? '慢于' : '等于'}中位数 ${mid.toFixed(2)} 秒`;
  $('startInput').value = s.index ? s.start.toFixed(3) : '';
  $('endInput').value = s.index < list.length - 1 ? s.end.toFixed(3) : '';
  $('startInput').disabled = $('saveStart').disabled = $('removeStart').disabled = !s.index;
  $('endInput').disabled = $('saveEnd').disabled = $('removeEnd').disabled = s.index === list.length - 1;
  if (seek) $('preview').currentTime = Math.min(s.start, state.duration);
  if (redraw) draw();
}
function message(text) { $('editMessage').textContent = text; }
function validCut(t, except = -1) {
  return Number.isFinite(t) && t > .01 && t < state.duration - .01 && state.cuts.every((c, i) => i === except || Math.abs(c - t) >= .02);
}
function addCut(t) {
  t = Number(t.toFixed(3));
  if (!validCut(t)) return message('切点必须位于视频内部，且距离其他切点至少 0.02 秒。');
  state.cuts.push(t); state.cuts.sort((a, b) => a - b);
  state.selected = state.cuts.findIndex(c => c === t) + 1;
  message(`已在 ${fmt(t, 3)} 添加切点。`); update();
}
function editBoundary(which, remove = false) {
  const list = shots(), s = list[state.selected], index = which === 'start' ? s.index - 1 : s.index;
  if (index < 0 || index >= state.cuts.length) return;
  if (remove) {
    state.cuts.splice(index, 1);
    state.selected = Math.min(s.index, state.cuts.length);
    message('切点已删除。'); update(); return;
  }
  const t = Number($(which === 'start' ? 'startInput' : 'endInput').value);
  const before = index ? state.cuts[index - 1] : 0;
  const after = index < state.cuts.length - 1 ? state.cuts[index + 1] : state.duration;
  if (!validCut(t, index) || t <= before + .01 || t >= after - .01) return message('请输入相邻边界之间的有效秒数。');
  state.cuts[index] = Number(t.toFixed(3));
  message(`切点已移至 ${fmt(t, 3)}。`); update();
}
function setBusy(active, title = '正在分析画面…') {
  $('busy').hidden = !active; $('busyTitle').textContent = title;
  $('progressFill').style.width = '0%';
  $('busyText').textContent = '视频越长，所需时间越久。请保持页面打开。';
}
function analyzeFile() {
  if (!state.file) return;
  $('uploadError').hidden = true;
  setBusy(true, '正在读取视频…');
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/analyze');
  xhr.setRequestHeader('Content-Type', 'application/octet-stream');
  xhr.setRequestHeader('X-Scene-Threshold', state.threshold);
  xhr.upload.onprogress = e => {
    if (e.lengthComputable) $('progressFill').style.width = `${Math.min(85, e.loaded / e.total * 85)}%`;
    if (e.lengthComputable && e.loaded >= e.total) {
      $('busyTitle').textContent = '正在检测镜头剪切点…';
      $('busyText').textContent = '正在逐帧分析视频。长片可能需要数分钟。';
      $('progressFill').style.width = '90%';
    }
  };
  xhr.onload = () => {
    setBusy(false);
    let data;
    try { data = JSON.parse(xhr.responseText); } catch { data = {}; }
    if (xhr.status !== 200) return showUploadError(data.error || '分析失败，请确认 FFmpeg 已安装且视频可读取。');
    state.duration = data.duration; state.cuts = data.cuts; state.selected = 0;
    $('workspace').hidden = false;
    update();
    $('workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  xhr.onerror = () => { setBusy(false); showUploadError('无法连接本地分析程序。请启动 start.bat，然后点击“重试分析”。'); };
  xhr.send(state.file);
}
function showUploadError(text) {
  $('uploadErrorText').textContent = text;
  $('uploadError').hidden = false;
}
function chooseFile(file) {
  if (!file) return;
  if (state.url) URL.revokeObjectURL(state.url);
  state.file = file; state.url = URL.createObjectURL(file);
  $('preview').src = state.url;
  $('uploadTitle').textContent = file.name;
  $('uploadHint').textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB · 点击可更换文件`;
  analyzeFile();
}
function escapeXml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]); }
function exportSvg() {
  const list = shots(), scale = colorScale(list), width = 2400, left = 55, usable = width - 110, y = 130, h = 160;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="420" viewBox="0 0 ${width} 420">`, '<rect width="100%" height="100%" fill="#101215"/>', '<text x="55" y="65" fill="#f1efe9" font-family="Arial,sans-serif" font-size="32" font-weight="bold">SHOT RHYTHM</text>', `<text x="55" y="97" fill="#8e9ba4" font-family="Arial,sans-serif" font-size="17">${escapeXml(state.file?.name || 'VIDEO')}  ·  ${list.length} SHOTS  ·  MEDIAN ${scale.mid.toFixed(2)}s</text>`];
  for (const s of list) {
    const x = left + usable * s.start / state.duration, w = usable * s.length / state.duration;
    parts.push(`<rect x="${x.toFixed(3)}" y="${y}" width="${w.toFixed(3)}" height="${h}" fill="${scale.get(s.length)}"/>`);
  }
  for (const c of state.cuts) { const x = left + usable * c / state.duration; parts.push(`<line x1="${x.toFixed(3)}" x2="${x.toFixed(3)}" y1="${y}" y2="${y + h}" stroke="#101215" stroke-width="1.2"/>`); }
  for (let i = 0; i <= 8; i++) {
    const x = left + usable * i / 8;
    parts.push(`<text x="${x}" y="328" fill="#a0aab1" text-anchor="${i === 0 ? 'start' : i === 8 ? 'end' : 'middle'}" font-family="Arial,sans-serif" font-size="15">${fmt(state.duration * i / 8, 0)}</text>`);
  }
  parts.push('<text x="55" y="385" fill="#d57d78" font-family="Arial,sans-serif" font-size="15">FAST · SHORT</text>', `<text x="1200" y="385" fill="#dcd9d3" text-anchor="middle" font-family="Arial,sans-serif" font-size="15">MEDIAN ${scale.mid.toFixed(2)}s</text>`, '<text x="2345" y="385" fill="#86a6bd" text-anchor="end" font-family="Arial,sans-serif" font-size="15">SLOW · LONG</text>', '</svg>');
  return parts.join('');
}
function download(blob, ext) {
  const a = document.createElement('a');
  const base = (state.file?.name || 'video').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_');
  a.href = URL.createObjectURL(blob); a.download = `${base}-shot-rhythm.${ext}`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportCsv() {
  const list = shots(), scale = colorScale(list);
  const rows = [['shot', 'start_seconds', 'end_seconds', 'duration_seconds', 'relative_to_median', 'color']];
  list.forEach(s => rows.push([s.index + 1, s.start.toFixed(3), s.end.toFixed(3), s.length.toFixed(3), s.length < scale.mid ? 'fast' : s.length > scale.mid ? 'slow' : 'median', scale.get(s.length)]));
  download(new Blob(['\ufeff' + rows.map(r => r.join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'csv');
}

$('chooseBtn').onclick = e => { e.stopPropagation(); $('fileInput').click(); };
$('dropZone').onclick = () => $('fileInput').click();
$('fileInput').onchange = e => chooseFile(e.target.files[0]);
$('retryBtn').onclick = analyzeFile;
for (const name of ['dragenter', 'dragover']) $('dropZone').addEventListener(name, e => { e.preventDefault(); $('dropZone').classList.add('drag'); });
for (const name of ['dragleave', 'drop']) $('dropZone').addEventListener(name, e => { e.preventDefault(); $('dropZone').classList.remove('drag'); });
$('dropZone').addEventListener('drop', e => chooseFile([...e.dataTransfer.files].find(f => f.type.startsWith('video/') || /\.(mp4|mov|mkv|avi|webm|m4v)$/i.test(f.name))));
$('zoomRange').oninput = update;
$('thresholdRange').oninput = e => { state.threshold = Number(e.target.value); $('thresholdValue').textContent = state.threshold; };
$('reanalyzeBtn').onclick = () => { if (confirm('重新分析会替换已手工校正的切点。继续吗？')) analyzeFile(); };
$('addAtPlayhead').onclick = () => addCut($('preview').currentTime);
$('addAtTime').onclick = () => { const value = $('addInput').value; if (!value) return message('请先输入秒数。'); addCut(Number(value)); $('addInput').value = ''; };
$('saveStart').onclick = () => editBoundary('start'); $('saveEnd').onclick = () => editBoundary('end');
$('removeStart').onclick = () => editBoundary('start', true); $('removeEnd').onclick = () => editBoundary('end', true);
$('svgBtn').onclick = () => download(new Blob([exportSvg()], { type: 'image/svg+xml' }), 'svg');
$('csvBtn').onclick = exportCsv;
$('pngBtn').onclick = () => {
  const svg = new Blob([exportSvg()], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svg), img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas'); canvas.width = 2400; canvas.height = 420;
    canvas.getContext('2d').drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob(blob => blob && download(blob, 'png'));
  };
  img.onerror = () => { URL.revokeObjectURL(url); alert('PNG 导出失败。'); };
  img.src = url;
};
window.addEventListener('resize', () => { if (state.duration) draw(); });
