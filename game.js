'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#4fc3f7', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const startScreen = document.getElementById('start-screen');
const startRecordsEl = document.getElementById('start-records');
const overlayRecordsEl = document.getElementById('overlay-records');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const playBtn = document.getElementById('play-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');

const GRID_COLORS = { dark: '#22222e', light: '#e2e2ee' };

const HIGHSCORES_KEY = 'tetris-highscores';
const MAX_SCORES = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, combo, bestCombo, maxLines, pendingHighIndex;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    if (lines > maxLines) maxLines = lines;
    combo++;
    if (combo > bestCombo) bestCombo = combo;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  } else {
    combo = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = document.documentElement.classList.contains('light') ? GRID_COLORS.light : GRID_COLORS.dark;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function loadHighscores() {
  try {
    const raw = localStorage.getItem(HIGHSCORES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(e => e && typeof e.score === 'number');
  } catch {
    return [];
  }
}

function saveHighscores(scores) {
  localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(scores));
}

function qualifiesForTop(scores, value) {
  if (value <= 0) return false;
  if (scores.length < MAX_SCORES) return true;
  return value > scores[scores.length - 1].score;
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function renderRecords(container, highlightIndex) {
  const scores = loadHighscores();
  if (!scores.length) {
    container.innerHTML = '<p class="records-title">RÉCORDS</p><p class="records-empty">Sin récords todavía</p>';
    return;
  }
  let html = '<p class="records-title">RÉCORDS</p>';
  html += '<table class="records-table"><thead><tr>'
    + '<th class="col-rank">#</th><th class="col-name">Nombre</th>'
    + '<th>Puntos</th><th>Líneas</th><th>Combo</th></tr></thead><tbody>';
  scores.forEach((e, i) => {
    const cls = i === highlightIndex ? ' class="highlight"' : '';
    html += `<tr${cls}>`
      + `<td class="col-rank">${i + 1}</td>`
      + `<td class="col-name">${escapeHTML(e.name || '—')}</td>`
      + `<td>${(e.score || 0).toLocaleString()}</td>`
      + `<td>${e.lines || 0}</td>`
      + `<td>${e.combo || 0}</td>`
      + '</tr>';
  });
  html += '</tbody></table>';
  const bestScoreLines = scores.reduce((m, e) => Math.max(m, e.lines || 0), 0);
  const bestScoreCombo = scores.reduce((m, e) => Math.max(m, e.combo || 0), 0);
  html += `<div class="records-stats"><span>Máx. líneas: <b>${bestScoreLines}</b></span>`
    + `<span>Mejor combo: <b>${bestScoreCombo}</b></span></div>`;
  container.innerHTML = html;
}

function commitScore(name) {
  const scores = loadHighscores();
  const entry = {
    name: (name || 'Jugador').trim().slice(0, 12) || 'Jugador',
    score,
    lines: maxLines,
    combo: bestCombo,
  };
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  scores.length = Math.min(scores.length, MAX_SCORES);
  saveHighscores(scores);
  pendingHighIndex = scores.indexOf(entry);
  nameEntry.classList.add('hidden');
  renderRecords(overlayRecordsEl, pendingHighIndex);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  pendingHighIndex = -1;

  const scores = loadHighscores();
  if (qualifiesForTop(scores, score)) {
    nameEntry.classList.remove('hidden');
    nameInput.value = '';
    renderRecords(overlayRecordsEl, -1);
    overlay.classList.remove('hidden');
    nameInput.focus();
  } else {
    nameEntry.classList.add('hidden');
    renderRecords(overlayRecordsEl, -1);
    overlay.classList.remove('hidden');
  }
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver || paused) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  combo = 0;
  bestCombo = 0;
  maxLines = 0;
  pendingHighIndex = -1;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  startScreen.classList.add('hidden');
  nameEntry.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (!current || gameOver) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

saveScoreBtn.addEventListener('click', () => {
  commitScore(nameInput.value);
});

nameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    commitScore(nameInput.value);
  }
});

playBtn.addEventListener('click', init);

resetRecordsBtn.addEventListener('click', () => {
  localStorage.removeItem(HIGHSCORES_KEY);
  renderRecords(startRecordsEl, -1);
});

function showStartScreen() {
  renderRecords(startRecordsEl, -1);
  overlay.classList.add('hidden');
  startScreen.classList.remove('hidden');
}

function setTheme(light) {
  document.documentElement.classList.toggle('light', light);
  themeToggle.textContent = light ? '🌙' : '☀️';
  themeToggle.setAttribute('aria-label', light ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  localStorage.setItem('theme', light ? 'light' : 'dark');
}

themeToggle.addEventListener('click', () => {
  setTheme(!document.documentElement.classList.contains('light'));
});

setTheme(document.documentElement.classList.contains('light'));

showStartScreen();
