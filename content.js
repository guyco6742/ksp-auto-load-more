// KSP Auto Load More
// שמות המחלקות של KSP נוצרים דינמית (moreButton-0-3-428 / 453...), לכן מחפשים לפי תחילית.
//
// התנהגות:
// - KSP טוענת 12 מוצרים בכל לחיצה. המשתמש בוחר "מכפיל" (1 עד 42, ברירת מחדל 8).
// - טעינה אוטומטית עד מכפיל×12 מוצרים, ואז עצירה.
// - לחיצה ידנית על "עוד תוצאות" מאפשרת עוד מכפיל×12.
// - פאנל צף עם מתג הפעלה ושדה למכפיל. ההגדרות נשמרות ב-chrome.storage.

(() => {
  const KSP_BATCH = 12;
  const MIN_MULT = 1, MAX_MULT = 42, DEFAULT_MULT = 8;
  const DEBOUNCE_MS = 700;
  const CLICK_TIMEOUT_MS = 15000;

  const settings = { enabled: true, mult: DEFAULT_MULT, collapsed: false };
  const step = () => settings.mult * KSP_BATCH;

  let limit = 0;
  let waitingForBatch = false;
  let lastClickAt = 0;
  let lastCount = 0;
  let debounceTimer = null;
  let lastUrl = location.href;

  const countProducts = () =>
    document.querySelectorAll('[class^="cardRoot-"], [class*=" cardRoot-"]').length;

  function findButton() {
    for (const el of document.querySelectorAll('[class*="moreButton-"]')) {
      const cls = typeof el.className === 'string' ? el.className : '';
      if (/(^|\s)moreButton-\d/.test(cls) && el.textContent.includes('עוד תוצאות')) return el;
    }
    return null;
  }

  // ---------- פאנל ----------
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:16px;top:calc(100vh - 160px);z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      .p{font:12px/1.3 Arial,sans-serif;direction:rtl;background:#000;color:#fff;border:2px solid #ff7a00;
         border-radius:8px;box-shadow:0 3px 12px rgba(255,122,0,.35);padding:6px 8px;min-width:0;width:max-content}
      .h{display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:bold;
         cursor:move;user-select:none;color:#ff7a00}
      .t{cursor:pointer;padding:0 2px;font-size:13px}
      .b{margin-top:5px;display:flex;flex-direction:column;gap:5px}
      .p.c .b{display:none}
      .row{display:flex;align-items:center;justify-content:space-between;gap:6px}
      input[type=number]{width:38px;padding:1px 3px;font-size:12px;background:#111;color:#fff;border:1px solid #ff7a00;border-radius:4px}
      .tg{display:flex;align-items:center;justify-content:center;gap:6px}
      .lbl{cursor:pointer;color:#777;user-select:none}
      .p:not(.off) .on-l{color:#ff7a00;font-weight:bold}
      .p.off .off-l{color:#fff;font-weight:bold}
      input[type=number]:disabled{background:#222;color:#666;border-color:#444;cursor:not-allowed}
      .p.off .mrow{color:#666}
      .sw{position:relative;display:inline-block;width:28px;height:15px;cursor:pointer}
      .sw input{position:absolute;opacity:0;width:0;height:0}
      .sl{position:absolute;inset:0;background:#333;border:1px solid #666;border-radius:20px;transition:.2s}
      .sl::before{content:"";position:absolute;width:11px;height:11px;top:1px;left:1px;background:#bbb;border-radius:50%;transition:.2s}
      .sw input:checked + .sl{background:#ff7a00;border-color:#ff7a00}
      .sw input:checked + .sl::before{transform:translateX(13px);background:#fff}
      .s{font-size:10.5px;color:#bbb;text-align:center}
      .dot{width:7px;height:7px;border-radius:50%;background:#3ddc84;display:inline-block;margin-inline-start:4px}
      .off .dot{background:#666}
    </style>
    <div class="p">
      <div class="h"><span>⠿ טעינה אוטו<span class="dot"></span></span><span class="t" title="כווץ / הרחב">▾</span></div>
      <div class="b">
        <div class="tg"><span class="lbl on-l">פעיל</span><label class="sw"><input type="checkbox" class="en"><span class="sl"></span></label><span class="lbl off-l">כבוי</span></div>
        <label class="row mrow">כפולות 12 <input type="number" class="m" min="${MIN_MULT}" max="${MAX_MULT}" step="1"></label>
        <div class="s"></div>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const panel = $('.p'), enEl = $('.en'), mEl = $('.m'), statusEl = $('.s'), toggleEl = $('.t');

  function render() {
    panel.classList.toggle('c', settings.collapsed);
    panel.classList.toggle('off', !settings.enabled);
    toggleEl.textContent = settings.collapsed ? '▴' : '▾';
    enEl.checked = settings.enabled;
    mEl.disabled = !settings.enabled;
    if (root.activeElement !== mEl) mEl.value = settings.mult;
    const n = countProducts();
    statusEl.textContent = !settings.enabled
      ? `כבוי`
      : `${n}/${limit} · סבב ${step()}`;
  }

  const save = () => { try { chrome.storage.local.set({ settings }); } catch (_) {} };

  toggleEl.addEventListener('click', () => { settings.collapsed = !settings.collapsed; save(); render(); });

  // ---------- גרירה ----------
  function placeAt(x, y) {
    const r = host.getBoundingClientRect();
    x = Math.min(Math.max(0, x), window.innerWidth - r.width);
    y = Math.min(Math.max(0, y), window.innerHeight - r.height);
    host.style.left = x + 'px';
    host.style.top = y + 'px';
    return { x, y };
  }
  $('.h').addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target === toggleEl) return;
    e.preventDefault();
    const r = host.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = (ev) => placeAt(ev.clientX - dx, ev.clientY - dy);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const r2 = host.getBoundingClientRect();
      settings.pos = { x: r2.left, y: r2.top };
      save();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  // שומרים את הפאנל בתוך המסך גם כשהחלון משנה גודל
  window.addEventListener('resize', () => {
    const r = host.getBoundingClientRect();
    placeAt(r.left, r.top);
  });
  // לחיצה על המילים "פעיל" / "כבוי" מעבירה את המתג למצב הזה
  $('.on-l').addEventListener('click', () => { if (!enEl.checked) { enEl.checked = true; enEl.dispatchEvent(new Event('change')); } });
  $('.off-l').addEventListener('click', () => { if (enEl.checked) { enEl.checked = false; enEl.dispatchEvent(new Event('change')); } });
  enEl.addEventListener('change', () => {
    settings.enabled = enEl.checked;
    if (settings.enabled) { limit = Math.max(limit, countProducts()); nudgeFails = 0; }
    save(); render(); scheduleCheck();
  });
  mEl.addEventListener('change', () => {
    let v = Math.round(Number(mEl.value));
    if (!Number.isFinite(v)) v = DEFAULT_MULT;
    v = Math.min(MAX_MULT, Math.max(MIN_MULT, v));
    const prevStep = step();
    settings.mult = v;
    mEl.value = v;
    // המגבלה הנוכחית מתעדכנת לפי הגודל החדש של הסבב
    limit = Math.max(countProducts(), limit - prevStep + step());
    save(); render(); scheduleCheck();
  });

  // ---------- לוגיקת טעינה ----------
  // לחיצה אמיתית של המשתמש (isTrusted) מוסיפה סבב. הלחיצות שלנו הן isTrusted=false.
  document.addEventListener('click', (e) => {
    if (!e.isTrusted || !settings.enabled) return;
    const btn = findButton();
    if (btn && btn.contains(e.target)) {
      limit = Math.max(limit, countProducts()) + step();
      waitingForBatch = true;
      lastClickAt = Date.now();
      lastCount = countProducts();
      render();
    }
  }, true);

  function tryClick() {
    if (location.href !== lastUrl) { // ניווט פנימי לקטגוריה אחרת
      lastUrl = location.href;
      limit = step();
      nudgeFails = 0;
    }
    render();
    if (!settings.enabled) return;

    const count = countProducts();
    if (count >= limit) { waitingForBatch = false; return; }

    const btn = findButton();
    if (!btn) {
      // בהתחלה KSP טוענת בגלילה (infinite scroll) והכפתור מופיע רק אחרי כמה מנות.
      // קפיצה רגעית לתחתית הדף וחזרה מפעילה את הטעינה בלי להזיז אותך.
      // קופצים רק בדף קטגוריה שבאמת נשארו בו מוצרים ("סך הכל מוצרים" גדול ממה שבדף).
      // אם 3 קפיצות ברצף לא הביאו כלום, מפסיקים לקפוץ.
      const total = getTotal();
      if (total === null || count >= total) return;
      // בטאב ברקע KSP לא טוענת בגלילה, אז אין טעם לקפוץ (וחבל לבזבז את 3 הניסיונות)
      if (document.hidden) return;
      if (Date.now() - lastNudgeAt > 2500) {
        if (count === lastNudgeCount) nudgeFails++; else nudgeFails = 0;
        if (nudgeFails < 3) nudgeScroll(count);
      }
      return;
    }
    if (waitingForBatch && count === lastCount && Date.now() - lastClickAt < CLICK_TIMEOUT_MS) return;

    waitingForBatch = true;
    lastClickAt = Date.now();
    lastCount = count;
    btn.click();
  }

  // "סך הכל מוצרים: 244" שמופיע בראש דף קטגוריה. null אם אין כזה (דף מוצר, דף בית וכו').
  function getTotal() {
    const el = document.querySelector('[class*="productsTotal-"]');
    const m = el && el.textContent.match(/(\d[\d,]*)/);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  }

  let lastNudgeAt = 0, lastNudgeCount = -1, nudgeFails = 0;
  function nudgeScroll(count) {
    lastNudgeAt = Date.now();
    lastNudgeCount = count;
    const y = window.scrollY;
    window.scrollTo(0, document.body.scrollHeight);
    requestAnimationFrame(() => requestAnimationFrame(() =>
      setTimeout(() => window.scrollTo(0, y), 100)));
  }

  function scheduleCheck() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (countProducts() !== lastCount) waitingForBatch = false;
      tryClick();
    }, DEBOUNCE_MS);
  }

  function start() {
    limit = step();
    document.documentElement.appendChild(host);
    render();
    if (settings.pos) placeAt(settings.pos.x, settings.pos.y);
    new MutationObserver((muts) => {
      if (muts.every((m) => host.contains(m.target))) return;
      scheduleCheck();
    }).observe(document.body, { childList: true, subtree: true });
    setInterval(tryClick, 3000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { nudgeFails = 0; scheduleCheck(); }
    });
    scheduleCheck();
  }

  try {
    chrome.storage.local.get('settings', (res) => {
      Object.assign(settings, res && res.settings);
      start();
    });
  } catch (_) {
    start();
  }
})();
