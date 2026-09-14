/**
 * snapshot-db.js
 * トーナメントのスナップショット（参加者・進行状況・デザイン設定・画像など）を
 * IndexedDBに保存・読込・削除するためのモジュール。
 *
 * localStorageは1オリジンあたり数MB程度しか使えず、背景画像やロゴ画像を
 * 含むスナップショットを複数保存すると容量不足（QuotaExceededError）に
 * なりやすいため、より大きな容量が使えるIndexedDBに保存先を変更している。
 *
 * 旧バージョン（localStorageの 'tournamentSnapshots' キー）に保存されていた
 * データは、初回アクセス時に自動的にIndexedDBへ移行される。
 */
const SnapshotDB = (function () {
  const DB_NAME = 'tournamentSnapshotDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'snapshots';
  const OLD_LS_KEY = 'tournamentSnapshots'; // 旧localStorage方式（移行用・移行後は削除）
  const MAX_SNAPSHOTS = 50; // IndexedDBは容量が大きいため上限を緩和

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('このブラウザはIndexedDBに対応していません'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function (e) { reject(e.target.error); };
    });
    return dbPromise;
  }

  // 保存済みスナップショットを全件取得（保存日時の新しい順）
  async function getAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => b.savedAt - a.savedAt);
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // スナップショットを1件追加/上書き保存
  async function add(snapshot) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(snapshot);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // スナップショットを1件削除
  async function remove(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // 保存件数が上限を超えた場合、古いものから削除
  async function trimToMax(maxCount) {
    const list = await getAll(); // 新しい順
    if (list.length <= maxCount) return;
    const toRemove = list.slice(maxCount);
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      toRemove.forEach(s => store.delete(s.id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // 旧localStorage方式（'tournamentSnapshots'キー）からIndexedDBへの1回限りの移行
  async function migrateFromLocalStorageIfNeeded() {
    try {
      const raw = localStorage.getItem(OLD_LS_KEY);
      if (!raw) return;
      const oldList = JSON.parse(raw);
      if (Array.isArray(oldList) && oldList.length > 0) {
        for (const snap of oldList) {
          if (snap && snap.id) {
            await add(snap);
          }
        }
      }
      localStorage.removeItem(OLD_LS_KEY);
    } catch (e) {
      console.warn('スナップショットの移行に失敗しました', e);
      // 移行に失敗しても旧データは保持しておく（再試行の余地を残す）
    }
  }

  return {
    getAll,
    add,
    remove,
    trimToMax,
    migrateFromLocalStorageIfNeeded,
    MAX_SNAPSHOTS
  };
})();
