const BRUSH_SIZE = 42;
const BRUSH_SPACING = 0.35;

const layerStack = document.getElementById("layerStack");
const resetBtn = document.getElementById("resetBtn");
const hint = document.getElementById("hint"); // optional — removed from main UI
const timerRing = document.getElementById("timerRing");
const timerProgress = document.getElementById("timerProgress");

const CIRCUMFERENCE = 2 * Math.PI * 15.5;

const state = {
  canvases: [],
  contexts: [],
  images: [],
  delayMs: 20_000,
  isDrawing: false,
  lastPoint: null,
  timerStart: null,
  timerId: null,
  unlockedCount: 1,
  loaded: false,
  fromConfig: false,
};

function getStackRect() {
  return layerStack.getBoundingClientRect();
}

function getCanvasSize() {
  const rect = getStackRect();
  const dpr = window.devicePixelRatio || 1;
  return {
    width: Math.round(rect.width * dpr),
    height: Math.round(rect.height * dpr),
    dpr,
  };
}

function setupCanvas(canvas, index) {
  const { width, height, dpr } = getCanvasSize();
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  state.contexts[index] = ctx;
  return ctx;
}

function drawImageOnCanvas(ctx, img) {
  const { width, height, dpr } = getCanvasSize();
  const w = width / dpr;
  const h = height / dpr;
  const imgRatio = img.width / img.height;
  const canvasRatio = w / h;

  let drawW, drawH, offsetX, offsetY;
  if (imgRatio > canvasRatio) {
    drawH = h;
    drawW = h * imgRatio;
    offsetX = (w - drawW) / 2;
    offsetY = 0;
  } else {
    drawW = w;
    drawH = w / imgRatio;
    offsetX = 0;
    offsetY = (h - drawH) / 2;
  }

  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
}

function paintBrush(ctx, x, y, size) {
  const radius = size / 2;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
  gradient.addColorStop(0.45, "rgba(0, 0, 0, 0.85)");
  gradient.addColorStop(0.75, "rgba(0, 0, 0, 0.35)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function interpolateBrush(ctx, from, to, size) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const step = size * BRUSH_SPACING;
  const steps = Math.max(1, Math.ceil(distance / step));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    paintBrush(ctx, from.x + dx * t, from.y + dy * t, size);
  }
}

function getPointerPos(event) {
  const rect = getStackRect();
  const clientX = event.touches ? event.touches[0].clientX : event.clientX;
  const clientY = event.touches ? event.touches[0].clientY : event.clientY;
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

function maxUnlockable() {
  return Math.max(1, state.images.length - 1);
}

function updateHint() {
  if (!hint) return;

  if (!state.fromConfig) {
    hint.innerHTML = 'Using sample images. <a href="/config/">Configure your own</a>';
    return;
  }

  if (state.unlockedCount >= maxUnlockable()) {
    hint.textContent = "All layers are open — keep scratching";
  } else if (state.unlockedCount > 1) {
    hint.textContent = "A deeper layer has opened — keep scratching";
  } else {
    hint.textContent = "Use your finger to paint away the top layer";
  }
  hint.classList.remove("fade");
}

function nextUnlockAt() {
  return state.unlockedCount * state.delayMs;
}

function updateTimerRing() {
  if (!state.timerStart || state.unlockedCount >= maxUnlockable()) return;

  const elapsed = Date.now() - state.timerStart;
  const target = nextUnlockAt();
  const prevTarget = (state.unlockedCount - 1) * state.delayMs;
  const windowMs = target - prevTarget;
  const windowElapsed = elapsed - prevTarget;
  const remaining = Math.max(0, windowMs - windowElapsed);
  const progress = remaining / windowMs;

  timerProgress.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);

  if (remaining <= 0) {
    unlockNextLayer();
  }
}

function startTimer() {
  if (state.timerStart || maxUnlockable() <= 1) return;
  state.timerStart = Date.now();
  timerRing.classList.add("visible");
  timerProgress.style.strokeDasharray = CIRCUMFERENCE;
  timerProgress.style.strokeDashoffset = 0;
  state.timerId = setInterval(updateTimerRing, 100);
}

function unlockNextLayer() {
  if (state.unlockedCount >= maxUnlockable()) {
    timerRing.classList.remove("visible");
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
    return;
  }

  state.unlockedCount += 1;
  updateHint();

  if (state.unlockedCount >= maxUnlockable()) {
    timerRing.classList.remove("visible");
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }
}

function eraseAtPoint(x, y) {
  for (let i = 0; i < state.unlockedCount; i++) {
    paintBrush(state.contexts[i], x, y, BRUSH_SIZE);
  }
}

function eraseAtLayers(from, to) {
  for (let i = 0; i < state.unlockedCount; i++) {
    interpolateBrush(state.contexts[i], from, to, BRUSH_SIZE);
  }
}

function onPointerDown(event) {
  if (!state.loaded) return;
  event.preventDefault();
  state.isDrawing = true;
  state.lastPoint = getPointerPos(event);
  startTimer();
  eraseAtPoint(state.lastPoint.x, state.lastPoint.y);
}

function onPointerMove(event) {
  if (!state.isDrawing || !state.loaded) return;
  event.preventDefault();

  const point = getPointerPos(event);
  if (state.lastPoint) {
    eraseAtLayers(state.lastPoint, point);
  }
  state.lastPoint = point;
}

function onPointerUp() {
  state.isDrawing = false;
  state.lastPoint = null;
}

function buildLayers() {
  layerStack.innerHTML = "";
  state.canvases = new Array(state.images.length);
  state.contexts = new Array(state.images.length);

  // DOM stacks bottom-to-top; canvases[0] is the top scratchable image.
  for (let i = state.images.length - 1; i >= 0; i--) {
    const canvas = document.createElement("canvas");
    canvas.className = "layer";
    if (i === state.images.length - 1) {
      canvas.setAttribute("aria-hidden", "true");
    }
    layerStack.appendChild(canvas);
    state.canvases[i] = canvas;
  }
}

async function initLayers() {
  const { images, delayMs, fromConfig } = await WarholStorage.loadLayersForApp();
  state.images = images;
  state.delayMs = delayMs;
  state.fromConfig = fromConfig;
  state.unlockedCount = 1;

  buildLayers();

  await new Promise((resolve) => requestAnimationFrame(resolve));

  state.canvases.forEach((canvas, i) => {
    const ctx = setupCanvas(canvas, i);
    drawImageOnCanvas(ctx, state.images[i]);
  });

  state.loaded = true;
  updateHint();
}

function reset() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }

  state.isDrawing = false;
  state.lastPoint = null;
  state.timerStart = null;
  state.unlockedCount = 1;

  timerRing.classList.remove("visible");
  timerProgress.style.strokeDashoffset = 0;
  if (hint) hint.classList.remove("fade");
  updateHint();

  state.canvases.forEach((canvas, i) => {
    drawImageOnCanvas(state.contexts[i], state.images[i]);
  });
}

function onResize() {
  if (!state.loaded) return;

  const snapshots = state.canvases.map((canvas) => {
    const { width, height } = getCanvasSize();
    const snap = document.createElement("canvas");
    snap.width = width;
    snap.height = height;
    snap.getContext("2d").drawImage(canvas, 0, 0);
    return snap;
  });

  state.canvases.forEach((canvas, i) => {
    setupCanvas(canvas, i);
    const ctx = state.contexts[i];
    const { width, height, dpr } = getCanvasSize();
    ctx.drawImage(snapshots[i], 0, 0, width / dpr, height / dpr);
  });
}

function bindEvents() {
  layerStack.addEventListener("mousedown", onPointerDown);
  layerStack.addEventListener("mousemove", onPointerMove);
  layerStack.addEventListener("mouseup", onPointerUp);
  layerStack.addEventListener("mouseleave", onPointerUp);

  layerStack.addEventListener("touchstart", onPointerDown, { passive: false });
  layerStack.addEventListener("touchmove", onPointerMove, { passive: false });
  layerStack.addEventListener("touchend", onPointerUp);
  layerStack.addEventListener("touchcancel", onPointerUp);

  resetBtn.addEventListener("click", reset);

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(onResize, 150);
  });
}

initLayers().catch(() => {
  if (hint) hint.textContent = "Could not load images.";
});

bindEvents();
