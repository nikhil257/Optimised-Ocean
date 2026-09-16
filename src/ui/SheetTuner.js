// Live tuner for the distant fish school.
//
// Every value below writes straight into config.underwater and calls
// FishSheet.applyLive(), so the scene updates as you drag — no reload, no
// rebuild. When it looks right, hit "Copy config" and paste the block into
// defaults.js.
//
// Enabled with ?tune=sheet on the URL. It is never constructed otherwise, so
// there is nothing to strip for production.

const FIELDS = [
  ['sheetSize', 0.1, 6, 0.05, 'Fish size'],
  ['sheetScale', 0.2, 8, 0.05, 'Orbit size'],
  ['sheetSpeed', 0.01, 1.2, 0.01, 'Speed'],
  ['sheetTurn', 0.01, 0.5, 0.005, 'Turn rate'],
  ['sheetBank', 0, 0.6, 0.01, 'Banking'],
  ['sheetTiltX', -1.6, 1.6, 0.01, 'Tilt X (rad)'],
  ['sheetTiltZ', -90, 90, 1, 'Tilt Z (deg)'],
  ['sheetDrift', 0, 4, 0.1, 'Plane drift'],
  ['sheetOffsetX', -250, 250, 1, 'Position X'],
  ['sheetHeight', 0, 120, 1, 'Height above seabed'],
  ['sheetZ', 0, 700, 5, 'Distance along journey'],
];

const DEFAULTS = {
  sheetSize: 1, sheetScale: 1, sheetSpeed: 0.18, sheetTurn: 0.075,
  sheetBank: 0.12, sheetTiltX: -0.20, sheetTiltZ: -30, sheetDrift: 1,
  sheetOffsetX: 0, sheetHeight: 30, sheetZ: 200,
};

export class SheetTuner {
  static enabled() {
    return new URLSearchParams(location.search).get('tune') === 'sheet';
  }

  constructor(config, sheet) {
    this.uw = config.underwater;
    this.sheet = sheet;
    for (const k of Object.keys(DEFAULTS)) {
      if (this.uw[k] === undefined) this.uw[k] = DEFAULTS[k];
    }

    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed; top:12px; right:12px; z-index:2147483647;
      width:250px; max-height:92vh; overflow:auto; padding:12px;
      background:rgba(8,20,34,.93); color:#cfe9f7; border-radius:10px;
      font:11px/1.5 ui-monospace,Menlo,monospace; backdrop-filter:blur(8px);
      box-shadow:0 8px 40px rgba(0,0,0,.5);`;
    el.innerHTML = '<div style="font-weight:700;margin-bottom:8px">FISH SHEET</div>';

    this.rows = [];
    for (const [key, min, max, step, label] of FIELDS) {
      const row = document.createElement('label');
      row.style.cssText = 'display:block;margin-bottom:7px';
      const out = document.createElement('span');
      out.style.cssText = 'float:right;opacity:.75';
      out.textContent = this.uw[key];
      const input = document.createElement('input');
      Object.assign(input, { type: 'range', min, max, step, value: this.uw[key] });
      input.style.cssText = 'width:100%;margin-top:2px;accent-color:#4fc3e8';
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        this.uw[key] = v;
        out.textContent = v;
        this.sheet.applyLive(this.uw, [key]);
      });
      row.append(label, out, input);
      el.appendChild(row);
      this.rows.push([key, input, out]);
    }

    const btn = document.createElement('button');
    btn.textContent = 'Copy config';
    btn.style.cssText = `width:100%;margin-top:6px;padding:7px;cursor:pointer;
      background:#1d6ea8;color:#fff;border:0;border-radius:6px;font:inherit`;
    btn.onclick = () => {
      const body = FIELDS.map(([k]) => `    ${k}: ${this.uw[k]},`).join('\n');
      navigator.clipboard.writeText(body);
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = 'Copy config'; }, 1200);
    };
    el.appendChild(btn);

    document.body.appendChild(el);
    this.el = el;
  }

  dispose() {
    this.el?.remove();
  }
}