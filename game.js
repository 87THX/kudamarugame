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

let playing = false, score = 0, seconds = 30, playerX = 0.5, keys = {}, stars = [], spawnTimer, ticker, animation, muted = false, audioCtx, frozenUntil = 0, freezeTimer, damageTimer, surpriseTimer, bashfulTimer, singingTimer, fireworksShown = false;
const collectibleSprites = {};

// 外側につながる白だけを透明にするので、キャラクター内部の白は残る。
function removeWhiteBackdrop(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
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
    if (target === 'note') return blue > red * 1.05 && green > red * 1.05 && blue > green * .9;
    return red > 135 && red > green * 1.06 && red > blue * 1.02;
  };
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index], green = data[index + 1], blue = data[index + 2];
    const isHatYellow = red > 155 && green > 135 && blue < 135 && red + green > blue * 2 + 190;
    const pixel = index / 4, px = pixel % width, py = Math.floor(pixel / width);
    if (data[index + 3] > 0 && !isHatYellow && insideOutline(px, py) && isTargetColor(red, green, blue)) primary[pixel] = 1;
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
    if (target === 'note' ? !primary[pixel] : isHatYellow || !insideOutline(px, py) || (!primary[pixel] && !(isDarkLine && touchesPrimary(px, py)))) data[index + 3] = 0;
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
  // 顔を自然な比率のまま中央へ配置し、余白はタイトルの丸背景に任せる。
  crop.getContext('2d').drawImage(source, 0, 0, 480, 523, 21, 0, 480, 523);
  return crop.toDataURL('image/png');
}
const makeCharacterCutout = () => {
  if (!characterImage.dataset.cutout && characterImage.naturalWidth) {
    const cutout = removeWhiteBackdrop(characterImage);
    // 元イラストの頭飾りから、きつね・緑の木・桜をそのまま切り出す。
    // きつねは顔と耳の輪郭を広めに確保し、表情が欠けないようにする。
    collectibleSprites.fox = cropAccessory(cutout, 110, 35, 140, 125, [[0,0],[140,0],[140,125],[0,125]], 'fox');
    collectibleSprites.tree = cropAccessory(cutout, 263, 125, 155, 150, [[0,0],[155,0],[155,150],[0,150]], 'tree');
    collectibleSprites.petal = cropAccessory(cutout, 78, 148, 112, 75, [[3,5],[32,0],[49,16],[70,6],[94,18],[110,42],[99,67],[71,75],[49,62],[25,70],[4,53]], 'petal');
    collectibleSprites.note = cropAccessory(cutout, 155, 65, 140, 125, [[0,0],[140,0],[140,125],[0,125]], 'note');
    titleFace.src = cropTitleFace(cutout);
    characterImage.dataset.cutout = 'true';
    characterImage.src = cutout.toDataURL('image/png');
  }
};
characterImage.addEventListener('load', makeCharacterCutout, { once: true });
// キャッシュ済みの画像でも必ず処理する。
if (characterImage.complete) makeCharacterCutout();
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
function launchFireworks(big = false) { const colors = ['#ffe765', '#ff7fa9', '#86efff', '#b99aff']; const bursts = big ? 3 : 2, sparks = big ? 28 : 18, positions = big ? [['18%', '28%'], ['50%', '20%'], ['80%', '31%']] : [['28%', '35%'], ['70%', '27%']]; for (let burst = 0; burst < bursts; burst++) for (let n = 0; n < sparks; n++) { const spark = document.createElement('i'), angle = (Math.PI * 2 * n) / sparks, distance = (big ? 78 : 38) + (n % 4) * (big ? 13 : 10), [x, y] = positions[burst]; spark.className = `firework${big ? ' big-firework' : ''}`; spark.style.setProperty('--x', x); spark.style.setProperty('--y', y); spark.style.setProperty('--dx', `${Math.cos(angle) * distance}px`); spark.style.setProperty('--dy', `${Math.sin(angle) * distance + 35}px`); spark.style.setProperty('--color', colors[n % colors.length]); fireworks.append(spark); setTimeout(() => spark.remove(), big ? 1300 : 1000); } }
function spawn() {
  if (!playing) return;
  const roll = Math.random();
  let points = 1, type = '', symbol = '★', sprite = '', hazard = false, kind = 'yellow-star';
  if (roll < .08) { points = 5; type = 'red-star'; kind = 'red-star'; }
  else if (roll < .22) { points = 3; type = 'gold'; }
  else if (roll < .36) { points = 0; type = 'item fox'; sprite = collectibleSprites.fox; hazard = true; kind = 'fox'; }
  else if (roll < .50) { points = 2; type = 'item tree'; sprite = collectibleSprites.tree; kind = 'tree'; }
  else if (roll < .66) { points = 2; type = 'item petal'; sprite = collectibleSprites.petal; kind = 'petal'; }
  else if (roll < .76) { points = 2; type = 'item note'; sprite = collectibleSprites.note; kind = 'note'; }
  const star = document.createElement('div');
  star.className = `star ${type}`;
  if (sprite) { const image = document.createElement('img'); image.src = sprite; image.alt = ''; star.append(image); }
  else star.textContent = symbol;
  const item = { el: star, x: .06 + Math.random() * .84, y: -60, speed: .9 + Math.random() * .7 + (30 - seconds) * .11, points, hazard, kind };
  star.style.left = `calc(${item.x * 100}% - 25px)`; game.append(star); stars.push(item);
}
function isFrozen() { const active = Date.now() < frozenUntil; if (!active && frozenUntil) unfreeze(); return active; }
function unfreeze() { frozenUntil = 0; character.classList.remove('frozen'); damageEl.classList.remove('show'); }
function takeDamage() { frozenUntil = Date.now() + 2000; score = Math.max(0, score - 3); scoreEl.textContent = score; character.classList.remove('frozen'); character.animate([{ filter: 'grayscale(1) sepia(.18) contrast(1.2) brightness(.72) drop-shadow(0 0 8px #aeb3b9)' }, { filter: 'grayscale(1) sepia(.18) contrast(1.2) brightness(.72) drop-shadow(0 0 8px #aeb3b9)', offset: .88 }, { filter: 'drop-shadow(0 8px 3px rgba(45,94,81,.23))' }], { duration: 2000, easing: 'linear' }); damageEl.classList.add('show'); clearTimeout(freezeTimer); clearTimeout(damageTimer); freezeTimer = setTimeout(unfreeze, 2000); damageTimer = setTimeout(() => damageEl.classList.remove('show'), 2000); foxSound(); }
function surprise() { character.classList.add('surprised'); clearTimeout(surpriseTimer); surpriseTimer = setTimeout(() => character.classList.remove('surprised'), 450); }
function bashful() { character.classList.add('bashful'); clearTimeout(bashfulTimer); bashfulTimer = setTimeout(() => character.classList.remove('bashful'), 750); }
function sing() { character.classList.add('singing'); clearTimeout(singingTimer); singingTimer = setTimeout(() => character.classList.remove('singing'), 800); }
function frame() { if (!playing) return; const g = bounds(); if (!isFrozen() && (keys.ArrowLeft || keys.a)) aimPlayer(targetPlayerX - .018); if (!isFrozen() && (keys.ArrowRight || keys.d)) aimPlayer(targetPlayerX + .018); if (!isFrozen()) setPlayer(playerX + (targetPlayerX - playerX) * .32); const p = character.getBoundingClientRect(); for (const item of [...stars]) { item.y += item.speed; item.el.style.transform = `translateY(${item.y}px) rotate(${item.y / 7}deg)`; const s = item.el.getBoundingClientRect(); const hit = s.bottom > p.top + 17 && s.top < p.bottom - 25 && s.right > p.left + 20 && s.left < p.right - 20; if (hit) { if (item.hazard) takeDamage(); else { score += item.points; scoreEl.textContent = score; if (item.kind === 'tree') { rustleSound(); surprise(); } else if (item.kind === 'petal') { shamisenSound(); bashful(); } else if (item.kind === 'note') { pianoSound(); sing(); } else if (item.kind === 'red-star') redStarSound(); else yellowStarSound(); } item.el.animate([{transform: item.el.style.transform, opacity: 1}, {transform: `${item.el.style.transform} scale(1.8)`, opacity: 0}], {duration: 180}); removeStar(item); } else if (item.y > g.height + 50) removeStar(item); } animation = requestAnimationFrame(frame); }
function removeStar(item) { item.el.remove(); stars = stars.filter(s => s !== item); }
function start() { stars.forEach(s => s.el.remove()); stars = []; score = 0; seconds = 30; playerX = .5; targetPlayerX = .5; fireworksShown = false; fireworks.replaceChildren(); frozenUntil = 0; clearTimeout(freezeTimer); clearTimeout(damageTimer); character.classList.remove('frozen', 'facing-left'); damageEl.classList.remove('show'); scoreEl.textContent = '0'; timeEl.textContent = seconds; setPlayer(playerX); playing = true; message.classList.add('hidden'); startButton.textContent = 'プレイ中！'; startButton.classList.add('playing'); game.focus(); spawn(); spawnTimer = setInterval(spawn, 700); ticker = setInterval(() => { seconds = Math.max(0, seconds - 1); timeEl.textContent = seconds; if (seconds === 0) end(); }, 1000); animation = requestAnimationFrame(frame); }
function end() { playing = false; seconds = 0; timeEl.textContent = seconds; frozenUntil = 0; clearTimeout(freezeTimer); clearTimeout(damageTimer); character.classList.remove('frozen'); damageEl.classList.remove('show'); clearInterval(spawnTimer); clearInterval(ticker); spawnTimer = ticker = null; cancelAnimationFrame(animation); stars.forEach(s => s.el.remove()); stars = []; const greatScore = score >= 70; if (greatScore) launchFireworks(true); startButton.textContent = 'もういちど！'; startButton.classList.remove('playing'); message.innerHTML = `${greatScore ? 'がんばったね！' : 'おしまい！'}<br><strong>${score} 点</strong><small>タップして もういちど あそぼう！</small>`; message.classList.remove('hidden'); }
function moveByButton(direction) { if (!playing || isFrozen()) return; aimPlayer(targetPlayerX + direction * .09); }
startButton.addEventListener('click', start); message.addEventListener('click', start); game.addEventListener('pointermove', e => { if (playing && !isFrozen() && e.buttons) aimPlayer((e.clientX - bounds().left) / bounds().width); }); game.addEventListener('pointerdown', e => { if (playing && !isFrozen()) { game.setPointerCapture?.(e.pointerId); aimPlayer((e.clientX - bounds().left) / bounds().width); } });
document.addEventListener('keydown', e => { keys[e.key] = true; if (['ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault(); }); document.addEventListener('keyup', e => keys[e.key] = false);
function bindMoveButton(button, direction) { const key = direction < 0 ? 'ArrowLeft' : 'ArrowRight'; const release = () => { keys[key] = false; }; button.addEventListener('pointerdown', e => { if (!playing || isFrozen()) return; e.preventDefault(); button.setPointerCapture?.(e.pointerId); keys[key] = true; }); button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release); button.addEventListener('click', () => moveByButton(direction)); }
bindMoveButton(leftButton, -1); bindMoveButton(rightButton, 1); soundButton.addEventListener('click', () => { muted = !muted; soundButton.innerHTML = `<small>${muted ? 'OFF' : 'ON'}</small><strong>♪</strong>`; soundButton.classList.toggle('muted', muted); soundButton.setAttribute('aria-label', muted ? '効果音をオンにする' : '効果音をオフにする'); soundButton.title = muted ? 'タップして効果音をオンにする' : 'タップして効果音をオフにする'; }); window.addEventListener('resize', () => setPlayer(playerX)); setPlayer(.5);
