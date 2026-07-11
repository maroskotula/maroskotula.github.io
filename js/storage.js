const WarholStorage = (() => {
  const DB_NAME = "warhol-reveal";
  const DB_VERSION = 1;
  const STORE_META = "meta";
  const STORE_IMAGES = "images";

  const DEFAULT_CONFIG = {
    delaySeconds: 20,
    layers: [],
  };

  let dbPromise = null;

  function openDB() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_META)) {
            db.createObjectStore(STORE_META);
          }
          if (!db.objectStoreNames.contains(STORE_IMAGES)) {
            db.createObjectStore(STORE_IMAGES);
          }
        };
      });
    }
    return dbPromise;
  }

  function tx(store, mode) {
    return openDB().then(
      (db) =>
        new Promise((resolve, reject) => {
          const transaction = db.transaction(store, mode);
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => resolve();
        })
    );
  }

  async function getConfig() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_META, "readonly").objectStore(STORE_META).get("config");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(request.result ? { ...DEFAULT_CONFIG, ...request.result } : { ...DEFAULT_CONFIG });
      };
    });
  }

  async function saveConfig(config) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_META, "readwrite").objectStore(STORE_META).put(config, "config");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async function getImageBlob(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_IMAGES, "readonly").objectStore(STORE_IMAGES).get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async function saveImageBlob(id, blob) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_IMAGES, "readwrite").objectStore(STORE_IMAGES).put(blob, id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async function deleteImageBlob(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_IMAGES, "readwrite").objectStore(STORE_IMAGES).delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async function loadImageElement(id) {
    const blob = await getImageBlob(id);
    if (!blob) throw new Error(`Image not found: ${id}`);
    const url = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  const FALLBACK_IMAGES = [
    "https://picsum.photos/seed/warhol1/800/1000",
    "https://picsum.photos/seed/warhol2/800/1000",
    "https://picsum.photos/seed/warhol3/800/1000",
  ];

  function loadUrlImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  async function loadLayersForApp() {
    const config = await getConfig();
    const delayMs = (config.delaySeconds || 20) * 1000;

    if (config.layers.length >= 2) {
      const images = await Promise.all(config.layers.map((layer) => loadImageElement(layer.id)));
      return { images, delayMs, fromConfig: true };
    }

    const images = await Promise.all(FALLBACK_IMAGES.map(loadUrlImage));
    return { images, delayMs, fromConfig: false };
  }

  return {
    DEFAULT_CONFIG,
    getConfig,
    saveConfig,
    getImageBlob,
    saveImageBlob,
    deleteImageBlob,
    loadImageElement,
    loadLayersForApp,
  };
})();
