const delayInput = document.getElementById("delayInput");
const fileInput = document.getElementById("fileInput");
const uploadZone = document.getElementById("uploadZone");
const layerList = document.getElementById("layerList");
const saveBtn = document.getElementById("saveBtn");
const statusMsg = document.getElementById("statusMsg");

let layers = [];
let dirty = false;
let dragId = null;

function uid() {
  return crypto.randomUUID();
}

function positionLabel(index, total) {
  if (index === 0) return "Top — scratched first";
  if (index === total - 1) return "Bottom — final image";
  return `Layer ${index + 1}`;
}

function setStatus(msg, isError = false) {
  statusMsg.textContent = msg;
  statusMsg.classList.toggle("error", isError);
}

function markDirty() {
  dirty = true;
  saveBtn.disabled = layers.length < 2;
}

function render() {
  layerList.innerHTML = "";

  layers.forEach((layer, index) => {
    const li = document.createElement("li");
    li.className = "layer-item";
    li.dataset.id = layer.id;
    li.draggable = true;

    li.innerHTML = `
      <span class="drag-handle" aria-hidden="true">⠿</span>
      <img class="layer-thumb" src="${layer.preview}" alt="" />
      <div class="layer-info">
        <div class="layer-name">${layer.name}</div>
        <div class="layer-position">${positionLabel(index, layers.length)}</div>
      </div>
      <div class="layer-controls">
        <button type="button" class="layer-btn move-up" title="Move up" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="layer-btn move-down" title="Move down" ${index === layers.length - 1 ? "disabled" : ""}>↓</button>
        <button type="button" class="layer-btn remove" title="Remove">×</button>
      </div>
    `;

    li.querySelector(".move-up").addEventListener("click", () => moveLayer(index, -1));
    li.querySelector(".move-down").addEventListener("click", () => moveLayer(index, 1));
    li.querySelector(".remove").addEventListener("click", () => removeLayer(index));

    li.addEventListener("dragstart", onDragStart);
    li.addEventListener("dragend", onDragEnd);
    li.addEventListener("dragover", onDragOver);
    li.addEventListener("dragleave", onDragLeave);
    li.addEventListener("drop", onDrop);

    layerList.appendChild(li);
  });

  markDirty();
}

function moveLayer(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= layers.length) return;
  [layers[index], layers[target]] = [layers[target], layers[index]];
  render();
}

async function removeLayer(index) {
  const layer = layers[index];
  layers.splice(index, 1);
  if (layer.isNew) {
    URL.revokeObjectURL(layer.preview);
  }
  render();
}

async function addFiles(files) {
  const imageFiles = [...files].filter((f) => f.type.startsWith("image/"));
  if (!imageFiles.length) return;

  for (const file of imageFiles) {
    const id = uid();
    const preview = URL.createObjectURL(file);
    layers.push({
      id,
      name: file.name,
      preview,
      blob: file,
      isNew: true,
    });
  }
  render();
  setStatus(`Added ${imageFiles.length} image${imageFiles.length > 1 ? "s" : ""}`);
}

function onDragStart(event) {
  dragId = event.currentTarget.dataset.id;
  event.currentTarget.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
}

function onDragEnd(event) {
  event.currentTarget.classList.remove("dragging");
  document.querySelectorAll(".layer-item").forEach((el) => el.classList.remove("drag-over"));
  dragId = null;
}

function onDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  event.currentTarget.classList.add("drag-over");
}

function onDragLeave(event) {
  event.currentTarget.classList.remove("drag-over");
}

function onDrop(event) {
  event.preventDefault();
  const targetId = event.currentTarget.dataset.id;
  event.currentTarget.classList.remove("drag-over");
  if (!dragId || dragId === targetId) return;

  const fromIndex = layers.findIndex((l) => l.id === dragId);
  const toIndex = layers.findIndex((l) => l.id === targetId);
  if (fromIndex < 0 || toIndex < 0) return;

  const [moved] = layers.splice(fromIndex, 1);
  layers.splice(toIndex, 0, moved);
  render();
}

async function loadExisting() {
  const config = await WarholStorage.getConfig();
  delayInput.value = config.delaySeconds || 20;

  layers = await Promise.all(
    config.layers.map(async (meta) => {
      const blob = await WarholStorage.getImageBlob(meta.id);
      if (!blob) return null;
      return {
        id: meta.id,
        name: meta.name,
        preview: URL.createObjectURL(blob),
        blob,
        isNew: false,
      };
    })
  );
  layers = layers.filter(Boolean);
  dirty = false;
  saveBtn.disabled = layers.length < 2;
  render();
}

async function save() {
  if (layers.length < 2) {
    setStatus("Add at least two images", true);
    return;
  }

  const delaySeconds = Math.max(1, Math.min(300, parseInt(delayInput.value, 10) || 20));
  delayInput.value = delaySeconds;

  saveBtn.disabled = true;
  setStatus("Saving…");

  try {
    const existingConfig = await WarholStorage.getConfig();
    const keptIds = new Set(layers.map((l) => l.id));

    for (const old of existingConfig.layers) {
      if (!keptIds.has(old.id)) {
        await WarholStorage.deleteImageBlob(old.id);
      }
    }

    for (const layer of layers) {
      if (layer.isNew || layer.blob) {
        await WarholStorage.saveImageBlob(layer.id, layer.blob);
      }
    }

    await WarholStorage.saveConfig({
      delaySeconds,
      layers: layers.map((l) => ({ id: l.id, name: l.name })),
    });

    layers.forEach((l) => {
      l.isNew = false;
    });
    dirty = false;
    setStatus("Saved! Head back to Reveal to try it.");
  } catch (err) {
    setStatus("Could not save. Try again.", true);
    console.error(err);
  } finally {
    saveBtn.disabled = layers.length < 2;
  }
}

fileInput.addEventListener("change", () => {
  if (fileInput.files.length) addFiles(fileInput.files);
  fileInput.value = "";
});

uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.classList.add("dragover");
});

uploadZone.addEventListener("dragleave", () => {
  uploadZone.classList.remove("dragover");
});

uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("dragover");
  if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
});

delayInput.addEventListener("input", markDirty);
saveBtn.addEventListener("click", save);

loadExisting().catch(() => setStatus("Could not load saved configuration", true));
