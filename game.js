const game = document.querySelector('#game');
const character = document.querySelector('#character');
const scoreEl = document.querySelector('#score');
const timeEl = document.querySelector('#time');
const message = document.querySelector('#message');
const damageEl = document.querySelector('#damage');
const fireworks = document.querySelector('#fireworks');
const startButton = document.querySelector('#startButton');
const soundButton = document.querySelector('#soundButton');
const leftButton = document.querySelector('#leftButton');
const rightButton = document.querySelector('#rightButton');

let playing = false, score = 0, seconds = 30, playerX = 0.5, keys = {}, stars = [], spawnTimer, ticker, animation, muted = false, audioCtx, frozenUntil = 0, freezeTimer, damageTimer, surpriseTimer, bashfulTimer, singingTimer, glowTimer, stoneAnimation, fireworksShown = false, perfectRun = true, catchableItemsSpawned = 0;
let characterHitBounds = { left: 0, top: 0, right: 1, bottom: 1 };
let characterAlphaMask = null;
const collectibleSprites = {};

// 外側につながる白だけを透明にするので、キャラクター内部の白は残る。
function removeWhiteBackdrop(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width; canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = pixels, width = canvas.width, height = canvas.height;
  const visited = new Uint8Array(width * height), queue = [];
  // JPEG の白い背景に残るわずかな圧縮ノイズも対象にする。
  const isBackdropWhite = index => {
    const red = data[index], green = data[index + 1], blue = data[index + 2];
    return Math.min(red, green, blue) > 220 && Math.max(red, green, blue) - Math.min(red, green, blue) < 20;
  };
  const add = (x, y) => { const point = y * width + x; if (!visited[point] && isBackdropWhite(point * 4)) { visited[point] = 1; queue.push(point); } };
  for (let x = 0; x < width; x++) { add(x, 0); add(x, height - 1); }
  for (let y = 0; y < height; y++) { add(0, y); add(width - 1, y); }
  for (let i = 0; i < queue.length; i++) {
    const point = queue[i], x = point % width, y = Math.floor(point / width);
    data[point * 4 + 3] = 0;
    if (x) add(x - 1, y); if (x + 1 < width) add(x + 1, y);
    if (y) add(x, y - 1); if (y + 1 < height) add(x, y + 1);
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}
function getOpaqueBounds(canvas) {
  const { data } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
  let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    if (data[(y * canvas.width + x) * 4 + 3] > 12) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
  }
  return right < 0 ? { left: 0, top: 0, right: 1, bottom: 1 } : { left: left / canvas.width, top: top / canvas.height, right: (right + 1) / canvas.width, bottom: (bottom + 1) / canvas.height };
}
function getAlphaMask(source) {
  const width = source.naturalWidth || source.width, height = source.naturalHeight || source.height;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(source, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data, alpha = new Uint8Array(width * height);
  for (let index = 0; index < alpha.length; index++) alpha[index] = pixels[index * 4 + 3] > 20 ? 1 : 0;
  return { width, height, alpha };
}
function masksTouch(characterRect, item) {
  if (!characterAlphaMask || !item.mask || !item.image) return false;
  const imageRect = item.image.getBoundingClientRect(), mask = item.mask;
  const scale = Math.min(imageRect.width / mask.width, imageRect.height / mask.height);
  const drawWidth = mask.width * scale, drawHeight = mask.height * scale;
  const itemRect = { left: imageRect.left + (imageRect.width - drawWidth) / 2, top: imageRect.top + (imageRect.height - drawHeight) / 2, right: imageRect.left + (imageRect.width + drawWidth) / 2, bottom: imageRect.top + (imageRect.height + drawHeight) / 2 };
  const left = Math.max(characterRect.left, itemRect.left), right = Math.min(characterRect.right, itemRect.right), top = Math.max(characterRect.top, itemRect.top), bottom = Math.min(characterRect.bottom, itemRect.bottom);
  if (left > right || top > bottom) return false;
  for (let y = Math.floor(top); y <= Math.ceil(bottom); y += 2) for (let x = Math.floor(left); x <= Math.ceil(right); x += 2) {
    const cx = Math.floor((x - characterRect.left) / characterRect.width * characterAlphaMask.width), cy = Math.floor((y - characterRect.top) / characterRect.height * characterAlphaMask.height);
    const ix = Math.floor((x - itemRect.left) / drawWidth * mask.width), iy = Math.floor((y - itemRect.top) / drawHeight * mask.height);
    if (cx >= 0 && cx < characterAlphaMask.width && cy >= 0 && cy < characterAlphaMask.height && ix >= 0 && ix < mask.width && iy >= 0 && iy < mask.height && characterAlphaMask.alpha[cy * characterAlphaMask.width + cx] && mask.alpha[iy * mask.width + ix]) return true;
  }
  return false;
}
const characterImage = character.querySelector('img');
const titleFace = document.querySelector('#titleFace');
function cropAccessory(source, x, y, width, height, outline, target) {
  const crop = document.createElement('canvas'); crop.width = width; crop.height = height;
  const context = crop.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, x, y, width, height, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height), { data } = pixels;
  const insideOutline = (px, py) => {
    let inside = false;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const [xi, yi] = outline[i], [xj, yj] = outline[j];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  // 頭飾りの黄色い帽子と、対象色に接していない余分な黒線を透明化する。
  const primary = new Uint8Array(width * height);
  const isTargetColor = (red, green, blue) => {
    if (target === 'fox') return Math.min(red, green, blue) > 155 || (red > green * 1.18 && red > blue * 1.12);
    if (target === 'tree') return green > 75 && green > red * 1.03 && green > blue * 1.15;
    if (target === 'note') return green > 100 && blue > 60 && red < green * .98 && blue > green * .45;
    // 桜は花びらのピンクだけを残し、近くの赤い印刷や背景は除外する。
    return red > 150 && green < 205 && blue > 100 && blue > green * 1.08;
  };
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index], green = data[index + 1], blue = data[index + 2];
    const isHatYellow = red > 155 && green > 135 && blue < 135 && red + green > blue * 2 + 190;
    const pixel = index / 4, px = pixel % width, py = Math.floor(pixel / width);
    if (data[index + 3] > 0 && !isHatYellow && insideOutline(px, py) && isTargetColor(red, green, blue)) primary[pixel] = 1;
  }
  // 桜は「大きな花」と小さな花びら2枚」の3つだけを残す。
  // 周辺に混じった赤い小片は、独立した小さなかたまりとしてここで取り除く。
  if (target === 'petal') {
    const seen = new Uint8Array(width * height), groups = [];
    for (let start = 0; start < primary.length; start++) {
      if (!primary[start] || seen[start]) continue;
      const group = [], queue = [start]; seen[start] = 1;
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const point = queue[cursor], px = point % width, py = Math.floor(point / width); group.push(point);
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const nx = px + ox, ny = py + oy, next = ny * width + nx;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && primary[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
        }
      }
      groups.push(group);
    }
    primary.fill(0);
    groups.sort((a, b) => b.length - a.length).slice(0, 3).forEach(group => group.forEach(point => { primary[point] = 1; }));
  }
  const lineRadius = target === 'petal' ? 2 : target === 'note' ? 3 : 1;
  const touchesPrimary = (px, py) => {
    for (let oy = -lineRadius; oy <= lineRadius; oy++) for (let ox = -lineRadius; ox <= lineRadius; ox++) {
      const nx = px + ox, ny = py + oy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && primary[ny * width + nx]) return true;
    }
    return false;
  };
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index], green = data[index + 1], blue = data[index + 2];
    const isHatYellow = red > 155 && green > 135 && blue < 135 && red + green > blue * 2 + 190;
    const pixel = index / 4, px = pixel % width, py = Math.floor(pixel / width), isDarkLine = Math.max(red, green, blue) < 125;
    const colorOnly = target === 'tree' || target === 'note' || target === 'petal';
    if (colorOnly ? !primary[pixel] : isHatYellow || !insideOutline(px, py) || (!primary[pixel] && !(isDarkLine && touchesPrimary(px, py)))) data[index + 3] = 0;
  }
  context.putImageData(pixels, 0, 0);
  return crop.toDataURL('image/png');
}
function cropOriginal(source, x, y, width, height) {
  const crop = document.createElement('canvas'); crop.width = width; crop.height = height;
  crop.getContext('2d').drawImage(source, x, y, width, height, 0, 0, width, height);
  return crop.toDataURL('image/png');
}
function cropTitleFace(source) {
  const size = 523, crop = document.createElement('canvas'); crop.width = size; crop.height = size;
  // 新しい正方形イラストを縦横比を変えず、そのままタイトル用に配置する。
  crop.getContext('2d').drawImage(source, 0, 0, source.width, source.height, 0, 0, size, size);
  return crop.toDataURL('image/png');
}
const makeCharacterCutout = () => {
  if (!characterImage.dataset.cutout && characterImage.naturalWidth) {
    const cutout = removeWhiteBackdrop(characterImage);
    characterHitBounds = getOpaqueBounds(cutout); characterAlphaMask = getAlphaMask(cutout);
    // 元イラストの頭飾りから、きつね・緑の木・桜をそのまま切り出す。
    // きつねは顔と耳の輪郭を広めに確保し、表情が欠けないようにする。
    collectibleSprites.fox = cropAccessory(cutout, 82, 18, 96, 82, [[8,28],[40,5],[57,0],[69,17],[84,27],[80,42],[71,54],[74,70],[60,82],[31,80],[9,70],[1,49]], 'fox');
    collectibleSprites.tree = cropAccessory(cutout, 178, 82, 82, 78, [[0,0],[82,0],[82,78],[0,78]], 'tree');
    collectibleSprites.petal = cropAccessory(cutout, 70, 92, 72, 52, [[0,0],[72,0],[72,52],[0,52]], 'petal');
    collectibleSprites.note = cropAccessory(cutout, 125, 55, 75, 80, [[0,0],[75,0],[75,80],[0,80]], 'note');
    titleFace.src = cropTitleFace(cutout);
    characterImage.dataset.cutout = 'true';
    characterImage.src = cutout.toDataURL('image/png');
  }
};
characterImage.addEventListener('load', makeCharacterCutout, { once: true });
// キャッシュ済みの画像でも必ず処理する。
if (characterImage.complete) makeCharacterCutout();
function cropPdfItem(source, x, y, width, height) {
  const crop = document.createElement('canvas'); crop.width = width; crop.height = height;
  crop.getContext('2d').drawImage(source, x, y, width, height, 0, 0, width, height);
  return removeWhiteBackdrop(crop).toDataURL('image/png');
}
function usePdfItems(source) {
  collectibleSprites.fox = cropPdfItem(source, 650, 1530, 340, 420);
  collectibleSprites.tree = cropPdfItem(source, 90, 1740, 540, 340);
  collectibleSprites.pdfStar = cropPdfItem(source, 990, 1510, 340, 330);
  collectibleSprites.petal = cropAccessory(source, 220, 790, 380, 250, [[0,0],[380,0],[380,250],[0,250]], 'petal');
  collectibleSprites.note = cropAccessory(source, 540, 450, 340, 480, [[0,0],[340,0],[340,480],[0,480]], 'note');
}
const itemSheet = new Image();
itemSheet.addEventListener('load', () => usePdfItems(itemSheet));
itemSheet.src = 'assets/fukuwarai-sheet.png?v=1';
function bounds() { return game.getBoundingClientRect(); }
let targetPlayerX = .5;
function setPlayer(x) { const nextX = Math.max(.11, Math.min(.89, x)); if (nextX < playerX) character.classList.add('facing-left'); else if (nextX > playerX) character.classList.remove('facing-left'); playerX = nextX; character.style.left = `calc(${playerX * 100}% - ${character.offsetWidth / 2}px)`; }
function aimPlayer(x) { targetPlayerX = Math.max(.11, Math.min(.89, x)); }
function beep(freq = 620, duration = .08) { if (muted) return; audioCtx ||= new AudioContext(); const osc = audioCtx.createOscillator(), gain = audioCtx.createGain(); osc.frequency.value = freq; gain.gain.setValueAtTime(.07, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + duration); osc.connect(gain).connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + duration); }
function starSound(frequencies) { if (muted) return; audioCtx ||= new AudioContext(); const now = audioCtx.currentTime; frequencies.forEach((frequency, index) => { const osc = audioCtx.createOscillator(), gain = audioCtx.createGain(); osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, now + index * .055); gain.gain.setValueAtTime(.001, now + index * .055); gain.gain.exponentialRampToValueAtTime(.075, now + index * .055 + .012); gain.gain.exponentialRampToValueAtTime(.001, now + index * .055 + .20); osc.connect(gain).connect(audioCtx.destination); osc.start(now + index * .055); osc.stop(now + index * .055 + .21); }); }
function yellowStarSound() { starSound([523, 659, 784]); }
function redStarSound() { starSound([1047, 1319, 1568]); }
function rustleSound() { if (muted) return; audioCtx ||= new AudioContext(); const length = Math.floor(audioCtx.sampleRate * .24), buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate), noise = buffer.getChannelData(0); for (let i = 0; i < length; i++) noise[i] = (Math.random() * 2 - 1) * (1 - i / length); const source = audioCtx.createBufferSource(), filter = audioCtx.createBiquadFilter(), gain = audioCtx.createGain(); source.buffer = buffer; filter.type = 'bandpass'; filter.frequency.value = 1150; filter.Q.value = .7; gain.gain.value = .16; source.connect(filter).connect(gain).connect(audioCtx.destination); source.start(); }
function foxSound() { if (muted) return; audioCtx ||= new AudioContext(); const now = audioCtx.currentTime; [0, .09].forEach((delay, index) => { const osc = audioCtx.createOscillator(), gain = audioCtx.createGain(); osc.type = 'triangle'; osc.frequency.setValueAtTime(index ? 680 : 770, now + delay); osc.frequency.exponentialRampToValueAtTime(index ? 520 : 610, now + delay + .10); gain.gain.setValueAtTime(.001, now + delay); gain.gain.exponentialRampToValueAtTime(.09, now + delay + .008); gain.gain.exponentialRampToValueAtTime(.001, now + delay + .12); osc.connect(gain).connect(audioCtx.destination); osc.start(now + delay); osc.stop(now + delay + .13); }); }
function shamisenSound() { if (muted) return; audioCtx ||= new AudioContext(); const now = audioCtx.currentTime; [392, 587].forEach((frequency, index) => { const osc = audioCtx.createOscillator(), filter = audioCtx.createBiquadFilter(), gain = audioCtx.createGain(), delay = index * .075; osc.type = 'sawtooth'; osc.frequency.value = frequency; filter.type = 'lowpass'; filter.frequency.value = 1800; filter.Q.value = 4; gain.gain.setValueAtTime(.001, now + delay); gain.gain.exponentialRampToValueAtTime(.11, now + delay + .006); gain.gain.exponentialRampToValueAtTime(.001, now + delay + .42); osc.connect(filter).connect(gain).connect(audioCtx.destination); osc.start(now + delay); osc.stop(now + delay + .43); }); }
function pianoSound() { if (muted) return; audioCtx ||= new AudioContext(); const now = audioCtx.currentTime; [523, 659, 784].forEach((frequency, index) => { const osc = audioCtx.createOscillator(), gain = audioCtx.createGain(), delay = index * .10; osc.type = 'triangle'; osc.frequency.setValueAtTime(frequency, now + delay); gain.gain.setValueAtTime(.001, now + delay); gain.gain.exponentialRampToValueAtTime(.09, now + delay + .008); gain.gain.exponentialRampToValueAtTime(.001, now + delay + .34); osc.connect(gain).connect(audioCtx.destination); osc.start(now + delay); osc.stop(now + delay + .35); }); }
function launchFireworks(size = 'normal') { const colors = ['#ffe765', '#ff7fa9', '#86efff', '#b99aff']; const big = size !== 'normal', perfect = size === 'perfect', bursts = perfect ? 5 : big ? 3 : 2, sparks = perfect ? 46 : big ? 28 : 18, positions = perfect ? [['14%', '30%'], ['32%', '17%'], ['50%', '26%'], ['68%', '17%'], ['86%', '30%']] : big ? [['18%', '28%'], ['50%', '20%'], ['80%', '31%']] : [['28%', '35%'], ['70%', '27%']]; for (let burst = 0; burst < bursts; burst++) for (let n = 0; n < sparks; n++) { const spark = document.createElement('i'), angle = (Math.PI * 2 * n) / sparks, distance = (perfect ? 118 : big ? 78 : 38) + (n % 4) * (perfect ? 16 : big ? 13 : 10), [x, y] = positions[burst]; spark.className = `firework${big ? ' big-firework' : ''}${perfect ? ' perfect-firework' : ''}`; spark.style.setProperty('--x', x); spark.style.setProperty('--y', y); spark.style.setProperty('--dx', `${Math.cos(angle) * distance}px`); spark.style.setProperty('--dy', `${Math.sin(angle) * distance + 35}px`); spark.style.setProperty('--color', colors[n % colors.length]); fireworks.append(spark); setTimeout(() => spark.remove(), perfect ? 1750 : big ? 1300 : 1000); } }
function spawn() {
  if (!playing || seconds <= 4) return;
  const roll = Math.random();
  let points = 1, type = 'item pdf-star yellow-star', symbol = '★', sprite = collectibleSprites.pdfStar || '', hazard = false, kind = 'yellow-star';
  if (roll < .08) { points = 5; type = 'item pdf-star red-star'; sprite = collectibleSprites.pdfStar || ''; kind = 'red-star'; }
  else if (roll < .22) { points = 3; kind = 'gold'; sprite = collectibleSprites.pdfStar || ''; type = sprite ? 'item pdf-star' : 'gold'; }
  else if (roll < .36) { points = 0; type = 'item fox'; sprite = collectibleSprites.fox; hazard = true; kind = 'fox'; }
  else if (roll < .50) { points = 2; type = 'item tree'; sprite = collectibleSprites.tree; kind = 'tree'; }
  else if (roll < .66) { points = 2; type = 'item petal'; sprite = collectibleSprites.petal; kind = 'petal'; }
  else if (roll < .76) { points = 2; type = 'item note'; sprite = collectibleSprites.note; kind = 'note'; }
  const star = document.createElement('div');
  star.className = `star ${type}`;
  const item = { el: star, x: .06 + Math.random() * .84, y: -60, speed: .9 + Math.random() * .7 + (30 - seconds) * .11, points, hazard, kind, image: null, mask: null };
  if (!hazard) catchableItemsSpawned++;
  if (sprite) { const image = document.createElement('img'); image.alt = ''; image.addEventListener('load', () => { item.mask = getAlphaMask(image); }, { once: true }); image.src = sprite; star.append(image); item.image = image; }
  else star.textContent = symbol;
  star.style.left = `calc(${item.x * 100}% - ${sprite ? 34 : 25}px)`; game.append(star); stars.push(item);
}
function isFrozen() { const active = Date.now() < frozenUntil; if (!active && frozenUntil) unfreeze(); return active; }
function unfreeze() { frozenUntil = 0; stoneAnimation?.cancel(); stoneAnimation = null; character.classList.remove('frozen'); character.style.removeProperty('filter'); damageEl.classList.remove('show'); }
function takeDamage() { frozenUntil = Date.now() + 2000; score = Math.max(0, score - 3); scoreEl.textContent = score; character.classList.remove('frozen'); stoneAnimation?.cancel(); stoneAnimation = null; character.style.filter = 'grayscale(1) sepia(.18) contrast(1.2) brightness(.72) drop-shadow(0 0 8px #aeb3b9)'; damageEl.classList.add('show'); clearTimeout(freezeTimer); clearTimeout(damageTimer); freezeTimer = window.setTimeout(unfreeze, 2000); damageTimer = window.setTimeout(() => damageEl.classList.remove('show'), 2000); foxSound(); }
function surprise() { character.classList.add('surprised'); clearTimeout(surpriseTimer); surpriseTimer = setTimeout(() => character.classList.remove('surprised'), 450); }
function bashful() { character.classList.add('bashful'); clearTimeout(bashfulTimer); bashfulTimer = setTimeout(() => character.classList.remove('bashful'), 750); }
function starGlow(color) { character.style.setProperty('--star-glow', color); character.classList.add('star-glow'); clearTimeout(glowTimer); glowTimer = setTimeout(() => character.classList.remove('star-glow'), 360); }
function sing() { character.classList.add('singing'); clearTimeout(singingTimer); singingTimer = setTimeout(() => character.classList.remove('singing'), 800); }
function frame() { if (frozenUntil && Date.now() >= frozenUntil) unfreeze(); if (!playing) return; const g = bounds(); if (!isFrozen() && (keys.ArrowLeft || keys.a)) aimPlayer(targetPlayerX - .018); if (!isFrozen() && (keys.ArrowRight || keys.d)) aimPlayer(targetPlayerX + .018); if (!isFrozen()) setPlayer(playerX + (targetPlayerX - playerX) * .32); const characterRect = character.getBoundingClientRect(), p = { left: characterRect.left + characterRect.width * characterHitBounds.left, right: characterRect.left + characterRect.width * characterHitBounds.right, top: characterRect.top + characterRect.height * characterHitBounds.top, bottom: characterRect.top + characterRect.height * characterHitBounds.bottom }; for (const item of [...stars]) { item.y += item.speed; item.el.style.transform = `translateY(${item.y}px)${item.image ? '' : ` rotate(${item.y / 7}deg)`}`; const s = item.el.getBoundingClientRect(); const hit = item.image ? Boolean(item.mask && masksTouch(characterRect, item)) : s.bottom >= p.top && s.top <= p.bottom && s.right >= p.left && s.left <= p.right; if (hit) { if (item.hazard) takeDamage(); else { score += item.points; scoreEl.textContent = score; if (item.kind === 'tree') { rustleSound(); surprise(); } else if (item.kind === 'petal') { shamisenSound(); bashful(); } else if (item.kind === 'note') { pianoSound(); sing(); } else if (item.kind === 'red-star') { redStarSound(); starGlow('#ff637b'); } else { yellowStarSound(); starGlow(item.kind === 'gold' ? '#ffd42a' : '#ffe547'); } } item.el.animate([{transform: item.el.style.transform, opacity: 1}, {transform: `${item.el.style.transform} scale(1.8)`, opacity: 0}], {duration: 180}); removeStar(item); } else if (item.y > g.height + 50) { if (!item.hazard) perfectRun = false; removeStar(item); } } animation = requestAnimationFrame(frame); }
function removeStar(item) { item.el.remove(); stars = stars.filter(s => s !== item); }
function start() { stars.forEach(s => s.el.remove()); stars = []; score = 0; seconds = 30; playerX = .5; targetPlayerX = .5; perfectRun = true; catchableItemsSpawned = 0; fireworksShown = false; fireworks.replaceChildren(); frozenUntil = 0; clearTimeout(freezeTimer); clearTimeout(damageTimer); character.classList.remove('frozen', 'facing-left'); character.style.removeProperty('filter'); damageEl.classList.remove('show'); scoreEl.textContent = '0'; timeEl.textContent = seconds; setPlayer(playerX); playing = true; message.classList.add('hidden'); startButton.textContent = 'プレイ中！'; startButton.classList.add('playing'); game.focus(); spawn(); spawnTimer = setInterval(spawn, 700); ticker = setInterval(() => { seconds = Math.max(0, seconds - 1); timeEl.textContent = seconds; if (seconds === 0) end(); }, 1000); animation = requestAnimationFrame(frame); }
function end() { playing = false; seconds = 0; timeEl.textContent = seconds; frozenUntil = 0; clearTimeout(freezeTimer); clearTimeout(damageTimer); character.classList.remove('frozen'); character.style.removeProperty('filter'); damageEl.classList.remove('show'); clearInterval(spawnTimer); clearInterval(ticker); spawnTimer = ticker = null; cancelAnimationFrame(animation); if (stars.some(item => !item.hazard)) perfectRun = false; stars.forEach(s => s.el.remove()); stars = []; const perfect = perfectRun && catchableItemsSpawned > 0, greatScore = score >= 70, closeScore = score >= 60; if (perfect) { score = 100; scoreEl.textContent = score; launchFireworks('perfect'); } else if (greatScore) launchFireworks('big'); startButton.textContent = 'もういちど！'; startButton.classList.remove('playing'); message.innerHTML = `${perfect ? 'パーフェクト！' : greatScore ? 'がんばったね！' : closeScore ? 'おしい！' : 'またやってみてね！'}<br><strong>${score} 点</strong><small>タップして もういちど あそぼう！</small>`; message.classList.remove('hidden'); }
function moveByButton(direction) { if (!playing || isFrozen()) return; aimPlayer(targetPlayerX + direction * .09); }
startButton.addEventListener('click', start); message.addEventListener('click', start); game.addEventListener('pointermove', e => { if (playing && !isFrozen() && e.buttons) aimPlayer((e.clientX - bounds().left) / bounds().width); }); game.addEventListener('pointerdown', e => { if (playing && !isFrozen()) { game.setPointerCapture?.(e.pointerId); aimPlayer((e.clientX - bounds().left) / bounds().width); } });
document.addEventListener('keydown', e => { keys[e.key] = true; if (['ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault(); }); document.addEventListener('keyup', e => keys[e.key] = false);
function bindMoveButton(button, direction) { const key = direction < 0 ? 'ArrowLeft' : 'ArrowRight'; const release = () => { keys[key] = false; }; button.addEventListener('pointerdown', e => { if (!playing || isFrozen()) return; e.preventDefault(); button.setPointerCapture?.(e.pointerId); keys[key] = true; }); button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release); button.addEventListener('click', () => moveByButton(direction)); }
bindMoveButton(leftButton, -1); bindMoveButton(rightButton, 1); soundButton.addEventListener('click', () => { muted = !muted; soundButton.innerHTML = `<small>${muted ? 'OFF' : 'ON'}</small><strong>♪</strong>`; soundButton.classList.toggle('muted', muted); soundButton.setAttribute('aria-label', muted ? '効果音をオンにする' : '効果音をオフにする'); soundButton.title = muted ? 'タップして効果音をオンにする' : 'タップして効果音をオフにする'; }); window.addEventListener('resize', () => setPlayer(playerX)); setPlayer(.5);
