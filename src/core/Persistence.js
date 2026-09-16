// Run-once logic. localStorage with a versioned key, a cookie fallback for
// storage-blocked contexts, and a ?intro=force escape hatch for previews.

export class Persistence {
  constructor({ storageKey, forceParam }) {
    this.key = storageKey;
    this.forceParam = forceParam;
  }

  isForced() {
    try {
      return new URLSearchParams(window.location.search).get(this.forceParam) === 'force';
    } catch {
      return false;
    }
  }

  hasCompleted() {
    if (this.isForced()) return false;
    try {
      if (window.localStorage.getItem(this.key) === '1') return true;
    } catch {
      /* storage blocked — fall through to cookie */
    }
    return document.cookie.split('; ').includes(`${this.key}=1`);
  }

  markCompleted() {
    try {
      window.localStorage.setItem(this.key, '1');
    } catch {
      /* ignore */
    }
    const oneYear = 60 * 60 * 24 * 365;
    document.cookie = `${this.key}=1; max-age=${oneYear}; path=/; SameSite=Lax`;
  }
}
