// ============================================================
// windows.js — ระบบ "หน้าต่างตึก" (คลิกตึกไหน → หน้าต่างของตึกนั้นเด้งขึ้น)
//   • ฉากหลัง = เกมเดิมย้อมสี/เบลอ (ดูตัวอย่าง assets/windows/stock city ex.png)
//   • ตึก chart (Stock Market) = หน้าต่างใหญ่ใช้กรอบ assets/windows/stock_market_frame.png
//     (สร้างจาก "stock market.png" ด้วย tools/make_window_frame.py — ลบตัวหนังสือ AI เพี้ยนข้างใน
//      เหลือกรอบทอง/กระทิง/แบนเนอร์/ปุ่ม X แล้ววาดเนื้อหาจริงด้วย HTML ทับ)
//     แท็บ OVERVIEW = ดัชนีตลาด + กราฟ + STOCK LIST ซื้อ/ขาย · MY PORTFOLIO = หุ้นที่ถือ + สัดส่วน (โดนัท)
//   • ตึกอื่น = หน้าต่าง generic (กรอบ CSS สไตล์เดียวกัน) โชว์ข้อมูลของตึกนั้น
//   เลย์เอาต์ในกรอบ stock: ตำแหน่งเป็น % ของกรอบ (1em = 1% ความกว้าง — เซ็ต font-size ด้วย JS)
//   สีหุ้น (ต่อตัว คงที่): กำหนดใน stocks.js — ผ่านตัวตรวจ dataviz (CVD/contrast บนพื้นเข้ม)
// ============================================================
SC.windows = {
  _root: null, _frame: null, _onClose: null, _charts: [],
  _tab: 'over', _sel: null, _chartMode: 'index', _mode: 'buy', _qty: {}, _pqty: {},

  FRAME_AR: 1369 / 886,   // สัดส่วนรูป stock_market_frame.png

  // กรอบหน้าต่างตึกสินทรัพย์ (สร้างด้วย tools/make_asset_windows.py จาก asset ที่ user ส่ง)
  //   สัดส่วนของภาพ crop แต่ละใบ — ใช้คำนวณขนาดกรอบใน _fit
  ASSET_AR: { crypto: 1.4341, bond: 1.3566, realestate: 1.4664, gold: 1.3247, startup: 1.5030, green: 1.4509, fin: 1.4400,
              news: 1.4769, leaderboard: 1.3645 },

  isOpen: function () { return !!this._root; },

  // ---------- เปิด/ปิด ----------
  open: function (id, onClose) {
    if (!SC.state) return;
    // ตึกถูกเหตุการณ์ปิด (ยกเว้น gold ปิดไม่ได้) — ไม่เปิดหน้าต่าง + คืน callback ให้ปลดล็อกการเดิน
    if (SC.events && SC.events.isClosed(id) && id !== 'gold') {
      var cb0 = SC.map.cityById(id);
      SC.ui.toast('🚧 ' + (cb0 ? cb0.name : 'ตึกนี้') + ' ปิดซ่อม (อีก ' + SC.state.events.closed[id] + ' รอบ)', 'warn');
      if (onClose) onClose();
      return;
    }
    this.close(true);
    var b = SC.map.cityById(id);
    if (!b) return;
    this._onClose = onClose || null;
    this._tab = 'over'; this._chartMode = 'index'; this._mode = 'buy';
    this._sel = SC.stocks[0].id;
    var self = this;
    SC.stocks.forEach(function (st) { if (!self._qty[st.id]) self._qty[st.id] = 10; if (!self._pqty[st.id]) self._pqty[st.id] = 10; });

    // เด้งบน fullscreen element ถ้ากำลังเต็มจอ (นอก fullscreen element จะมองไม่เห็น)
    var mount = document.fullscreenElement || document.webkitFullscreenElement || document.body;
    var root = document.createElement('div');
    root.className = 'win-overlay';
    mount.appendChild(root);
    this._root = root;

    var frame = document.createElement('div');
    var cls = 'win-generic';
    if (id === 'chart') cls = 'win-stock';
    else if (this.ASSET_AR[id]) cls = 'win-asset win-as-' + id;
    frame.className = 'win-frame ' + cls;
    root.appendChild(frame);
    this._frame = frame;
    this._id = id;
    this._ar = this.ASSET_AR[id] || null;

    // คลิกฉากหลัง (นอกกรอบ) = ปิด
    root.addEventListener('mousedown', function (ev) { if (ev.target === root) self.close(); });
    this._esc = function (ev) { if (ev.key === 'Escape') self.close(); };
    window.addEventListener('keydown', this._esc);
    this._onRes = function () { self._fit(); };
    window.addEventListener('resize', this._onRes);

    // ค่าตั้งต้นเฉพาะหน้าต่างสินทรัพย์
    this._cmode = 'buy'; this._ctab = 'over'; this._cqty = this._cqty || {}; this._csel = null;
    this._gq = this._gq || 5;
    this._bq = this._bq || {};
    this._gfilter = 'all'; this._rtab = 'over';   // green/startup ไม่มีแท็บแล้ว (อาร์ตใหม่ 2026-07-15)

    this._svcUsed = false; // ตึกข่าว/ลีดเดอร์บอร์ด: ใช้บริการได้ 1 อย่างต่อการเข้า 1 ครั้ง

    if (id === 'chart') this._buildStock();
    else if (id === 'crypto') this._buildCrypto();
    else if (id === 'gold') this._buildGold();
    else if (id === 'bond') this._buildBond();
    else if (id === 'realestate') this._buildRealEstate();
    else if (id === 'startup') this._buildStartup();
    else if (id === 'green') this._buildGreen();
    else if (id === 'fin') this._buildBank(b);
    else if (id === 'news') this._buildNews(b);
    else if (id === 'leaderboard') this._buildLeaderboard(b);
    else this._buildGeneric(b);
    this._fit();
  },

  // สลับไปหน้าต่างตึกอื่นโดยคง callback จบเทิร์นเดิม (ใช้กับปุ่ม Startup Hub ↔ Green Invest)
  switchTo: function (id) {
    var cb = this._onClose;
    this._onClose = null;           // กัน close ใน open() ไปเรียก callback
    this.open(id, cb);
  },

  // สลับตึกแบบ "เดินไปจริง" (user 2026-07-13): ปิดหน้าต่างนี้ → เดินตามถนนไปตึกเป้าหมาย
  //   → ถึงแล้ว turn.js เปิดหน้าต่างนั้นเอง (นับเวลาเดินใน 60 วิ) · นอกเฟสแมพ = สลับทันที
  walkSwitch: function (id) {
    var w = SC.world;
    if (!w || !w.actor || !w.walkPathTo || !SC.turn._t || SC.turn._t.ended) { this.switchTo(id); return; }
    this.close();                   // → turn.js onClose: windowOpen=false + ปลดล็อกการเดิน
    w.bounceBuilding(id);
    w.walkPathTo(id);
  },

  close: function (silent) {
    if (!this._root) return;
    window.removeEventListener('keydown', this._esc);
    window.removeEventListener('resize', this._onRes);
    this._root.remove();
    this._root = null; this._frame = null; this._charts = [];
    var cb = this._onClose; this._onClose = null;
    if (!silent && cb) cb();
  },

  // ขนาดกรอบพอดีจอ (คงสัดส่วนรูป) + สเกลฟอนต์: 1em = 1% ความกว้างกรอบ
  _fit: function () {
    var f = this._frame; if (!f) return;
    var vw = window.innerWidth, vh = window.innerHeight;
    if (f.classList.contains('win-stock')) {
      var w = Math.min(vw * 0.94, vh * 0.94 * this.FRAME_AR);
      f.style.width = w + 'px'; f.style.height = (w / this.FRAME_AR) + 'px';
      f.style.fontSize = (w / 100) + 'px';
    } else if (f.classList.contains('win-asset')) {
      var ar = this._ar || 1.4;
      var wa = Math.min(vw * 0.96, vh * 0.96 * ar);
      f.style.width = wa + 'px'; f.style.height = (wa / ar) + 'px';
      f.style.fontSize = (wa / 100) + 'px';
    } else {
      var w2 = Math.min(vw * 0.9, 1080), h2 = Math.min(vh * 0.88, w2 * 0.72);
      f.style.width = w2 + 'px'; f.style.height = h2 + 'px';
      f.style.fontSize = Math.max(14, Math.min(21, w2 / 52)) + 'px';
    }
    this._charts.forEach(function (fn) { fn(); });
  },

  // ---------- helper ข้อมูล ----------
  _fmtVol: function (n) {
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return Math.round(n / 1e3) + 'K';
    return String(n);
  },
  _hist: function (id) {
    var s = SC.state;
    if (!s.history) { s.history = SC._seedHistory(); }
    return s.history[id];
  },
  // ดัชนีตลาด = 2000 × ค่าเฉลี่ย (ราคา/ราคาแรกสุด) ของหุ้นทุกตัว
  _indexSeries: function () {
    var self = this, L = this._hist(SC.stocks[0].id).length, out = [];
    for (var t = 0; t < L; t++) {
      var sum = 0;
      SC.stocks.forEach(function (st) { var h = self._hist(st.id); sum += h[t] / h[0]; });
      out.push(2000 * sum / SC.stocks.length);
    }
    return out;
  },
  _change: function (id) { // [diff, pct] เทียบสัปดาห์ก่อน
    var h = this._hist(id), last = h[h.length - 1], prev = h.length > 1 ? h[h.length - 2] : last;
    return [last - prev, prev ? (last - prev) / prev * 100 : 0];
  },
  _volume: function (id) {
    var s = SC.state;
    if (!s.volumes) s.volumes = SC.rollVolumes();
    return s.volumes[id];
  },
  _num: function (n, dec) {
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  },

  // ============================================================
  // หน้าต่าง STOCK MARKET (ตึก chart)
  // ============================================================
  _buildStock: function () {
    var f = this._frame;
    f.innerHTML =
      '<button class="wf-x" data-wclose title="ปิด (Esc)"></button>' +
      '<div class="wf-tabs">' +
        '<button class="wf-tab" data-wtab="over">OVERVIEW</button>' +
        '<button class="wf-tab" data-wtab="port">MY PORTFOLIO</button>' +
      '</div>' +
      '<div class="wf-left"></div>' +
      '<div class="wf-right"></div>' +
      '<div class="wf-foot"></div>';
    var self = this;
    f.querySelector('[data-wclose]').onclick = function () { self.close(); };
    Array.prototype.forEach.call(f.querySelectorAll('[data-wtab]'), function (bt) {
      bt.onclick = function () { self._tab = bt.getAttribute('data-wtab'); self._renderTab(); };
    });
    this._renderTab();
  },

  _renderTab: function () {
    var f = this._frame; if (!f) return;
    Array.prototype.forEach.call(f.querySelectorAll('[data-wtab]'), function (bt) {
      bt.classList.toggle('active', bt.getAttribute('data-wtab') === SC.windows._tab);
    });
    this._charts = [];
    if (this._tab === 'over') this._renderOverview(); else this._renderPortfolio();
    this._renderFoot();
    this._charts.forEach(function (fn) { fn(); });
  },

  // ---------- แท็บ OVERVIEW ----------
  _renderOverview: function () {
    var self = this, f = this._frame, s = SC.state;
    var idx = this._indexSeries();
    var iLast = idx[idx.length - 1], iPrev = idx.length > 1 ? idx[idx.length - 2] : iLast;
    var iDiff = iLast - iPrev, iPct = iPrev ? iDiff / iPrev * 100 : 0;
    var gain = 0, lose = 0, volSum = 0;
    SC.stocks.forEach(function (st) {
      var c = self._change(st.id)[0];
      if (c > 0) gain++; else if (c < 0) lose++;
      volSum += self._volume(st.id);
    });

    // --- ซ้าย: MARKET OVERVIEW ---
    f.querySelector('.wf-left').innerHTML =
      '<div class="wp-title">MARKET OVERVIEW</div>' +
      '<div class="ov-index">' +
        '<span class="ov-chip" id="wfChip">MARKET INDEX</span>' +
        '<b class="ov-val" id="wfVal"></b>' +
      '</div>' +
      '<div class="ov-chg" id="wfChg"></div>' +
      '<div class="ov-chart"><canvas id="wfChart"></canvas></div>' +
      '<div class="ov-note" id="wfNote"></div>' +
      '<div class="ov-stats">' +
        '<div class="ov-stat"><label>GAINERS</label><b class="up">▲ ' + gain + '</b></div>' +
        '<div class="ov-stat"><label>LOSERS</label><b class="down">▼ ' + lose + '</b></div>' +
        '<div class="ov-stat"><label>VOLUME</label><b>' + this._fmtVol(volSum) + '</b></div>' +
      '</div>';

    // --- ขวา: STOCK LIST ---
    var rows = SC.stocks.map(function (st) {
      var price = s.prices[st.id], ch = self._change(st.id);
      var cls = ch[0] >= 0 ? 'up' : 'down', sign = ch[0] >= 0 ? '+' : '';
      return '<tr data-wrow="' + st.id + '" class="' + (st.id === self._sel && self._chartMode === 'stock' ? 'sel' : '') + '">' +
        '<td><div class="st-co"><span class="st-ico" style="background:' + st.color + '">' + st.icon + '</span>' +
          '<span class="st-nm"><b>' + st.name + '</b><small>' + st.sector + '</small></span></div></td>' +
        '<td class="num">฿' + self._num(price, 2) + '</td>' +
        '<td class="num ' + cls + '">' + sign + self._num(ch[0], 2) + '</td>' +
        '<td class="num ' + cls + '">' + sign + ch[1].toFixed(2) + '%</td>' +
        '<td class="num">' + self._fmtVol(self._volume(st.id)) + '</td>' +
        '<td><span class="qty2"><button data-wdq="' + st.id + '">−</button>' +
          '<span class="q2v" id="wq-' + st.id + '">' + self._qty[st.id] + '</span>' +
          '<button data-wiq="' + st.id + '">+</button></span></td>' +
        '<td><button class="buy2' + (self._mode === 'sell' ? ' sellmode' : '') + '" data-wtrade="' + st.id + '">' +
          (self._mode === 'sell' ? 'SELL' : 'BUY') + '</button></td>' +
      '</tr>';
    }).join('');

    f.querySelector('.wf-right').innerHTML =
      '<div class="wp-title">STOCK LIST <small class="wp-sub">คลิกแถวเพื่อดูกราฟรายตัว · ถือ: คลิก MY PORTFOLIO</small></div>' +
      '<div class="wf-tablewrap"><table class="wf-table">' +
        '<thead><tr><th>COMPANY</th><th>PRICE</th><th>CHANGE</th><th>CHANGE %</th><th>VOLUME</th>' +
        '<th>' + (this._mode === 'sell' ? 'SELL' : 'BUY') + ' VOLUME</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>';

    this._updateChartHead();
    this._bindOverview();
    this._charts.push(function () { self._drawMainChart(); });
  },

  _updateChartHead: function () {
    var f = this._frame, s = SC.state;
    var chip = f.querySelector('#wfChip'), val = f.querySelector('#wfVal'), chg = f.querySelector('#wfChg'), note = f.querySelector('#wfNote');
    if (!chip) return;
    if (this._chartMode === 'stock') {
      var st = SC.getStock(this._sel), ch = this._change(st.id);
      var cls = ch[0] >= 0 ? 'up' : 'down', sign = ch[0] >= 0 ? '+' : '';
      chip.textContent = st.name + ' · ' + st.sector;
      val.textContent = '฿' + this._num(s.prices[st.id], 2);
      chg.innerHTML = '<b class="' + cls + '">' + sign + this._num(ch[0], 2) + ' (' + sign + ch[1].toFixed(2) + '%)</b> เทียบสัปดาห์ก่อน';
      note.textContent = '📈 ' + st.info.chart;
    } else {
      var idx = this._indexSeries();
      var last = idx[idx.length - 1], prev = idx.length > 1 ? idx[idx.length - 2] : last;
      var d = last - prev, p = prev ? d / prev * 100 : 0;
      var cls2 = d >= 0 ? 'up' : 'down', sg = d >= 0 ? '+' : '';
      chip.textContent = 'MARKET INDEX';
      val.textContent = this._num(last, 2);
      chg.innerHTML = '<b class="' + cls2 + '">' + sg + this._num(d, 2) + ' (' + sg + p.toFixed(2) + '%)</b> เทียบสัปดาห์ก่อน';
      note.textContent = 'ดัชนีรวมทั้งตลาด (ถ่วงจากราคาหุ้นทุกตัว) · คลิกแถวหุ้นเพื่อดูรายตัว';
    }
  },

  _bindOverview: function () {
    var self = this, f = this._frame;
    Array.prototype.forEach.call(f.querySelectorAll('[data-wrow]'), function (tr) {
      tr.onclick = function (ev) {
        if (ev.target.closest('button')) return; // ปุ่มในแถวไม่ใช่การเลือกแถว
        self._sel = tr.getAttribute('data-wrow'); self._chartMode = 'stock';
        Array.prototype.forEach.call(f.querySelectorAll('[data-wrow]'), function (r) { r.classList.toggle('sel', r === tr); });
        self._updateChartHead(); self._drawMainChart();
      };
    });
    Array.prototype.forEach.call(f.querySelectorAll('[data-wiq]'), function (bt) {
      bt.onclick = function () { self._bumpQty(bt.getAttribute('data-wiq'), +1, self._qty, 'wq-'); };
    });
    Array.prototype.forEach.call(f.querySelectorAll('[data-wdq]'), function (bt) {
      bt.onclick = function () { self._bumpQty(bt.getAttribute('data-wdq'), -1, self._qty, 'wq-'); };
    });
    Array.prototype.forEach.call(f.querySelectorAll('[data-wtrade]'), function (bt) {
      bt.onclick = function () { self._trade(bt.getAttribute('data-wtrade'), self._mode); };
    });
  },

  // ปรับจำนวน: ต่ำกว่า 10 ทีละ 1 · ตั้งแต่ 10 ขึ้นไปทีละ 5 (กดน้อยลงตอนซื้อเยอะ)
  _bumpQty: function (id, d, store, prefix) {
    var cur = store[id] || 1;
    var step = (d > 0 ? cur >= 10 : cur > 10) ? 5 : 1;
    store[id] = Math.max(1, cur + d * step);
    var el = this._frame.querySelector('#' + prefix + id);
    if (el) el.textContent = store[id];
  },

  _trade: function (id, mode) {
    var s = SC.state;
    var qty = (this._tab === 'port' ? this._pqty : this._qty)[id] || 1;
    var r = (mode === 'sell') ? SC.trade.sell(s.player, id, qty) : SC.trade.buy(s.player, id, qty);
    if (!r.ok) { SC.ui.toast(r.msg, 'bad'); return; }
    if (mode === 'sell') SC.ui.toast('ขาย ' + id + ' ' + qty + ' หุ้น (+' + SC.ui.money(r.gain) + ')', 'good');
    else SC.ui.toast('ซื้อ ' + id + ' ' + qty + ' หุ้น (−' + SC.ui.money(r.cost) + ')', 'good');
    SC.ui.renderHUD();
    this._renderTab(); // อัปเดตเงินสด/พอร์ต/ปุ่ม
  },

  // ---------- แท็บ MY PORTFOLIO ----------
  _renderPortfolio: function () {
    var self = this, f = this._frame, s = SC.state, p = s.player;
    var total = SC.portfolioValue(p, s.prices);
    var slices = [], stockVal = 0;
    SC.stocks.forEach(function (st) {
      var sh = p.holdings[st.id];
      if (sh > 0) {
        var v = sh * s.prices[st.id];
        stockVal += v;
        slices.push({ label: st.name, value: v, color: st.color });
      }
    });
    if (p.cash > 0) slices.push({ label: 'เงินสด', value: p.cash, color: '#5b6b7d' });
    var pnl = total - s.startValue, pnlCls = pnl >= 0 ? 'up' : 'down';

    f.querySelector('.wf-left').innerHTML =
      '<div class="wp-title">MY PORTFOLIO</div>' +
      '<div class="pf-donut"><canvas id="wfDonut"></canvas></div>' +
      '<div class="pf-legend">' + slices.map(function (sl) {
        var pct = total > 0 ? (sl.value / total * 100) : 0;
        return '<div class="pf-leg"><i style="background:' + sl.color + '"></i>' +
          '<span>' + sl.label + '</span><b>' + pct.toFixed(1) + '%</b></div>';
      }).join('') + '</div>' +
      '<div class="ov-stats">' +
        '<div class="ov-stat"><label>มูลค่าหุ้น</label><b>' + SC.ui.money(stockVal) + '</b></div>' +
        '<div class="ov-stat"><label>เงินสด</label><b>' + SC.ui.money(p.cash) + '</b></div>' +
        '<div class="ov-stat"><label>กำไร/ขาดทุน</label><b class="' + pnlCls + '">' + (pnl >= 0 ? '+' : '') + SC.ui.money(pnl) + '</b></div>' +
      '</div>';

    var held = SC.stocks.filter(function (st) { return p.holdings[st.id] > 0; });
    var rows = held.map(function (st) {
      var sh = p.holdings[st.id], price = s.prices[st.id], v = sh * price;
      var avg = p.avgCost ? p.avgCost[st.id] : null;
      var plPct = avg ? (price - avg) / avg * 100 : null;
      var plCls = (plPct || 0) >= 0 ? 'up' : 'down';
      var w = total > 0 ? v / total * 100 : 0;
      return '<tr>' +
        '<td><div class="st-co"><span class="st-ico" style="background:' + st.color + '">' + st.icon + '</span>' +
          '<span class="st-nm"><b>' + st.name + '</b><small>' + st.sector + '</small></span></div></td>' +
        '<td class="num">' + sh + '</td>' +
        '<td class="num">' + (avg ? '฿' + self._num(avg, 2) : '—') + '</td>' +
        '<td class="num">฿' + self._num(price, 2) + '</td>' +
        '<td class="num ' + plCls + '">' + (plPct == null ? '—' : (plPct >= 0 ? '+' : '') + plPct.toFixed(1) + '%') + '</td>' +
        '<td class="num">฿' + self._num(v, 2) + '</td>' +
        '<td><div class="wbar"><i style="width:' + Math.min(100, w).toFixed(1) + '%;background:' + st.color + '"></i></div><small class="wpct">' + w.toFixed(1) + '%</small></td>' +
        '<td><span class="qty2"><button data-pdq="' + st.id + '">−</button>' +
          '<span class="q2v" id="pq-' + st.id + '">' + Math.min(self._pqty[st.id], sh) + '</span>' +
          '<button data-piq="' + st.id + '">+</button></span></td>' +
        '<td><button class="buy2 sellmode" data-psell="' + st.id + '">SELL</button></td>' +
      '</tr>';
    }).join('');

    f.querySelector('.wf-right').innerHTML =
      '<div class="wp-title">HOLDINGS <small class="wp-sub">หุ้นที่ถือ · ปริมาณ · สัดส่วนพอร์ต</small></div>' +
      '<div class="wf-tablewrap"><table class="wf-table">' +
        '<thead><tr><th>COMPANY</th><th>SHARES</th><th>AVG COST</th><th>PRICE</th><th>P/L %</th><th>VALUE</th><th>WEIGHT</th><th>SELL VOLUME</th><th></th></tr></thead>' +
        '<tbody>' + (rows || '<tr><td colspan="9" class="pf-empty">ยังไม่มีหุ้นในพอร์ต — กลับไปแท็บ OVERVIEW แล้วกด BUY เลย 🛒</td></tr>') + '</tbody>' +
      '</table></div>';

    var self2 = this;
    Array.prototype.forEach.call(f.querySelectorAll('[data-piq]'), function (bt) {
      bt.onclick = function () { self2._bumpQty(bt.getAttribute('data-piq'), +1, self2._pqty, 'pq-'); };
    });
    Array.prototype.forEach.call(f.querySelectorAll('[data-pdq]'), function (bt) {
      bt.onclick = function () { self2._bumpQty(bt.getAttribute('data-pdq'), -1, self2._pqty, 'pq-'); };
    });
    Array.prototype.forEach.call(f.querySelectorAll('[data-psell]'), function (bt) {
      bt.onclick = function () {
        var id = bt.getAttribute('data-psell');
        self2._pqty[id] = Math.min(self2._pqty[id] || 1, s.player.holdings[id]);
        self2._trade(id, 'sell');
      };
    });

    this._charts.push(function () { self._drawDonut('#wfDonut', slices, total, { label: 'มูลค่าพอร์ตรวม' }); });
  },

  // ---------- แถบล่าง (ทั้งสองแท็บ) ----------
  _renderFoot: function () {
    var self = this, f = this._frame, s = SC.state;
    f.querySelector('.wf-foot').innerHTML =
      '<div class="wf-status"><span class="dot"></span>MARKET STATUS: <b class="up">OPEN</b>' +
        '<small>สัปดาห์ ' + s.week + '/' + SC.config.weeks + ' · ⏸ นาฬิกาเทิร์นหยุดระหว่างเปิดหน้าต่าง</small></div>' +
      '<button class="wf-btn" id="wfQuick">QUICK TRADE: ' + (this._mode === 'sell' ? 'ขาย' : 'ซื้อ') + '</button>' +
      '<button class="wf-btn" id="wfAdv">ADVANCED CHARTS</button>' +
      '<div class="wf-cash">💵<span class="wf-cashcol"><label>AVAILABLE CASH</label>' +
        '<b>' + SC.ui.money(s.player.cash) + '</b></span>' +
        '<button class="wf-plus" id="wfPlus" title="ดูพอร์ตของฉัน">+</button></div>';
    f.querySelector('#wfQuick').onclick = function () {
      self._mode = (self._mode === 'sell') ? 'buy' : 'sell';
      if (self._tab !== 'over') self._tab = 'over';
      self._renderTab();
      SC.ui.toast(self._mode === 'sell' ? '🔁 โหมดขาย — ปุ่มในตารางกลายเป็น SELL' : '🔁 โหมดซื้อ', '');
    };
    f.querySelector('#wfAdv').onclick = function () {
      self._chartMode = (self._chartMode === 'stock') ? 'index' : 'stock';
      if (self._tab !== 'over') { self._tab = 'over'; self._renderTab(); }
      else { self._updateChartHead(); self._drawMainChart(); self._markSelRow(); }
    };
    f.querySelector('#wfPlus').onclick = function () { self._tab = 'port'; self._renderTab(); };
  },

  _markSelRow: function () {
    var self = this;
    Array.prototype.forEach.call(this._frame.querySelectorAll('[data-wrow]'), function (r) {
      r.classList.toggle('sel', self._chartMode === 'stock' && r.getAttribute('data-wrow') === self._sel);
    });
  },

  // ============================================================
  // กราฟเส้น (canvas) — เส้น 2px + grid จาง + area fill + hover crosshair
  // ============================================================
  _drawMainChart: function () {
    var c = this._frame && this._frame.querySelector('#wfChart');
    if (!c) return;
    var series = (this._chartMode === 'stock') ? this._hist(this._sel).slice() : this._indexSeries();
    var isPrice = this._chartMode === 'stock';
    this._lineChart(c, series, {
      fmt: function (v) { return isPrice ? v.toFixed(2) : Math.round(v).toLocaleString('en-US'); },
      unit: isPrice ? '฿' : '',
    });
  },

  _fitCanvas: function (c) {
    var r = c.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.max(40, Math.round(r.width * d)), h = Math.max(40, Math.round(r.height * d));
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    return { w: w, h: h, d: d };
  },

  _lineChart: function (canvas, values, opts) {
    var self = this;
    canvas._plotData = { values: values, opts: opts || {} };
    if (!canvas._plotBound) {
      canvas._plotBound = true;
      canvas.addEventListener('mousemove', function (ev) {
        var r = canvas.getBoundingClientRect();
        canvas._hoverX = (ev.clientX - r.left) / r.width;
        self._renderLine(canvas);
      });
      canvas.addEventListener('mouseleave', function () { canvas._hoverX = null; self._renderLine(canvas); });
    }
    this._renderLine(canvas);
  },

  _renderLine: function (canvas) {
    var d = canvas._plotData; if (!d) return;
    var values = d.values, opts = d.opts;
    var sz = this._fitCanvas(canvas), W = sz.w, H = sz.h, k = sz.d;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    var n = values.length; if (n < 2) return;

    var fs = Math.max(9, Math.round(Math.min(W * 0.033, H * 0.13))); // ฟอนต์แกน (คุมด้วยความสูงด้วย — canvas เตี้ยตัวเลขไม่ทับกัน)
    var padL = fs * 3.4, padR = fs * 0.9, padT = fs * 0.9, padB = fs * 1.7;
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    var span = (max - min) || Math.abs(max) * 0.1 || 1;
    min -= span * 0.08; max += span * 0.08;
    var X = function (i) { return padL + (W - padL - padR) * i / (n - 1); };
    var Y = function (v) { return padT + (H - padT - padB) * (1 - (v - min) / (max - min)); };
    var up = values[n - 1] >= values[0];
    var col = up ? '#35d07f' : '#ff6b5e';
    var fmt = opts.fmt || function (v) { return v.toFixed(2); };

    // grid แนวนอน (จาง ไม่แย่งซีน) + ค่าแกน y
    ctx.strokeStyle = 'rgba(160,200,230,.13)'; ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(170,195,215,.75)'; ctx.font = fs + 'px "Segoe UI"'; ctx.textAlign = 'right';
    for (var g = 0; g <= 3; g++) {
      var vv = min + (max - min) * g / 3, yy = Y(vv);
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
      ctx.fillText(fmt(vv), padL - fs * 0.5, yy + fs * 0.35);
    }
    // ค่าแกน x (ออฟเซ็ตสัปดาห์: -12 … ตอนนี้)
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(170,195,215,.6)';
    for (var tx = 0; tx < 5; tx++) {
      var ii = Math.round((n - 1) * tx / 4), off = ii - (n - 1);
      ctx.fillText(off === 0 ? 'ตอนนี้' : String(off), X(ii), H - fs * 0.45);
    }

    // area ใต้เส้น
    var grad = ctx.createLinearGradient(0, padT, 0, H - padB);
    grad.addColorStop(0, up ? 'rgba(53,208,127,.28)' : 'rgba(255,107,94,.26)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    for (var i = 0; i < n; i++) { if (i === 0) ctx.moveTo(X(i), Y(values[i])); else ctx.lineTo(X(i), Y(values[i])); }
    ctx.lineTo(X(n - 1), H - padB); ctx.lineTo(X(0), H - padB); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    // เส้นหลัก 2px (สเกลตาม dpr) + เรืองแสงเบาๆ ตามสไตล์เกม
    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = 5 * k;
    ctx.strokeStyle = col; ctx.lineWidth = 2 * k; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    for (var j = 0; j < n; j++) { if (j === 0) ctx.moveTo(X(j), Y(values[j])); else ctx.lineTo(X(j), Y(values[j])); }
    ctx.stroke();
    ctx.restore();

    // จุดปลาย (ค่าปัจจุบัน) + วงแหวนสีพื้นกันจม
    ctx.fillStyle = col; ctx.strokeStyle = '#0a1a26'; ctx.lineWidth = 2 * k;
    ctx.beginPath(); ctx.arc(X(n - 1), Y(values[n - 1]), 3.2 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // hover: crosshair + กล่องค่า
    if (canvas._hoverX != null) {
      var hi = Math.max(0, Math.min(n - 1, Math.round((canvas._hoverX * W - padL) / (W - padL - padR) * (n - 1))));
      var hx = X(hi), hy = Y(values[hi]);
      ctx.strokeStyle = 'rgba(220,235,250,.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx, padT); ctx.lineTo(hx, H - padB); ctx.stroke();
      ctx.fillStyle = '#eaf4ff'; ctx.strokeStyle = col; ctx.lineWidth = 2 * k;
      ctx.beginPath(); ctx.arc(hx, hy, 3 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      var off2 = hi - (n - 1);
      var l1 = (off2 === 0 ? 'สัปดาห์นี้' : 'สัปดาห์ ' + off2);
      var l2 = (opts.unit || '') + fmt(values[hi]);
      ctx.font = 'bold ' + fs + 'px "Segoe UI"';
      var tw = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + fs * 1.2;
      var bx = Math.min(W - padR - tw, Math.max(padL, hx - tw / 2)), by = Math.max(2, hy - fs * 3.4);
      ctx.fillStyle = 'rgba(8,20,32,.93)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, tw, fs * 2.8, 4 * k); else ctx.rect(bx, by, tw, fs * 2.8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,170,210,.4)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(170,195,215,.85)'; ctx.fillText(l1, bx + fs * 0.6, by + fs * 1.15);
      ctx.fillStyle = '#eaf4ff'; ctx.fillText(l2, bx + fs * 0.6, by + fs * 2.35);
    }
  },

  // ============================================================
  // โดนัทสัดส่วนพอร์ต — ช่องว่าง 2px ระหว่างชิ้น + ตัวเลขรวมกลาง + hover ดูรายชิ้น
  // ============================================================
  //   opts: { label: ข้อความกลาง, fmt: ฟังก์ชันฟอร์แมตค่า (ไม่ใส่ = เงินบาท) }
  _drawDonut: function (sel, slices, total, opts) {
    var c = this._frame && this._frame.querySelector(sel);
    if (!c) return;
    var self = this;
    c._donut = { slices: slices, total: total, hover: -1, opts: opts || {} };
    if (!c._donutBound) {
      c._donutBound = true;
      c.addEventListener('mousemove', function (ev) {
        var r = c.getBoundingClientRect();
        var dd = c._donut, sz = { w: c.width, h: c.height };
        var mx = (ev.clientX - r.left) / r.width * sz.w - sz.w / 2;
        var my = (ev.clientY - r.top) / r.height * sz.h - sz.h / 2;
        var dist = Math.sqrt(mx * mx + my * my), R = Math.min(sz.w, sz.h) / 2 - 4;
        var hov = -1;
        if (dist <= R && dist >= R * 0.56 && dd.total > 0) {
          var ang = Math.atan2(my, mx); if (ang < -Math.PI / 2) ang += Math.PI * 2; // เริ่มที่ -90°
          var acc = -Math.PI / 2;
          for (var i = 0; i < dd.slices.length; i++) {
            var sw = dd.slices[i].value / dd.total * Math.PI * 2;
            if (ang >= acc && ang < acc + sw) { hov = i; break; }
            acc += sw;
          }
        }
        if (hov !== dd.hover) { dd.hover = hov; self._renderDonut(c); }
      });
      c.addEventListener('mouseleave', function () { if (c._donut) { c._donut.hover = -1; self._renderDonut(c); } });
    }
    this._renderDonut(c);
  },

  _renderDonut: function (c) {
    var dd = c._donut; if (!dd) return;
    var sz = this._fitCanvas(c), W = sz.w, H = sz.h, k = sz.d;
    var ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    var cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 4 * k, r0 = R * 0.6;
    var total = dd.total || 1;

    var acc = -Math.PI / 2;
    for (var i = 0; i < dd.slices.length; i++) {
      var sl = dd.slices[i], sw = Math.max(0.002, sl.value / total * Math.PI * 2);
      var Ro = (i === dd.hover) ? R + 3 * k : R;
      ctx.beginPath();
      ctx.arc(cx, cy, Ro, acc, acc + sw);
      ctx.arc(cx, cy, r0, acc + sw, acc, true);
      ctx.closePath();
      ctx.fillStyle = sl.color; ctx.fill();
      ctx.strokeStyle = '#0a1a26'; ctx.lineWidth = 2 * k; ctx.stroke(); // spacer 2px ระหว่างชิ้น
      acc += sw;
    }

    // ตัวเลขกลาง: ปกติ = ค่ารวม · hover = ชิ้นที่ชี้
    var fs = Math.max(10, Math.round(W * 0.055));
    var fmt = dd.opts.fmt || SC.ui.money;
    ctx.textAlign = 'center';
    if (dd.hover >= 0) {
      var hs = dd.slices[dd.hover];
      ctx.fillStyle = 'rgba(170,195,215,.85)'; ctx.font = fs * 0.78 + 'px "Segoe UI"';
      ctx.fillText(hs.label, cx, cy - fs * 0.5);
      ctx.fillStyle = '#eaf4ff'; ctx.font = '800 ' + fs + 'px "Segoe UI"';
      ctx.fillText((hs.value / total * 100).toFixed(1) + '%', cx, cy + fs * 0.65);
      ctx.fillStyle = 'rgba(170,195,215,.7)'; ctx.font = fs * 0.62 + 'px "Segoe UI"';
      ctx.fillText(fmt(hs.value), cx, cy + fs * 1.6);
    } else {
      ctx.fillStyle = 'rgba(170,195,215,.85)'; ctx.font = fs * 0.72 + 'px "Segoe UI"';
      ctx.fillText(dd.opts.label || 'มูลค่าพอร์ตรวม', cx, cy - fs * 0.55);
      ctx.fillStyle = '#eaf4ff'; ctx.font = '800 ' + fs + 'px "Segoe UI"';
      ctx.fillText(fmt(dd.total), cx, cy + fs * 0.7);
    }
  },

  // ============================================================
  // หน้าต่าง generic (ตึกอื่นๆ) — กรอบ CSS สไตล์เดียวกับ asset
  // ============================================================
  _buildGeneric: function (b) {
    var f = this._frame, self = this, s = SC.state;
    var inner = '';

    if (b.interactive) {
      // ตึกข้อมูล (fin/news/trend): ตารางข้อมูลหมวดของตึกนี้ต่อหุ้น (เปิดหน้าต่าง = ได้ข้อมูลแล้ว)
      var key = SC.config.buildings[b.id].info;
      inner =
        '<p class="wg-desc">' + b.emoji + ' ' + SC.config.buildings[b.id].desc + ' — เก็บข้อมูลแล้ว ✓ (ใช้ช่วยตัดสินใจซื้อ/ขายท้ายสัปดาห์)</p>' +
        '<table class="wf-table wg-table"><thead><tr><th>หุ้น</th><th>ข้อมูลจาก' + b.name + '</th></tr></thead><tbody>' +
        SC.stocks.map(function (st) {
          return '<tr><td><div class="st-co"><span class="st-ico" style="background:' + st.color + '">' + st.icon + '</span>' +
            '<span class="st-nm"><b>' + st.name + '</b><small>' + st.sector + '</small></span></div></td>' +
            '<td>' + st.info[key] + '</td></tr>';
        }).join('') + '</tbody></table>';
    } else if (b.id === 'leaderboard') {
      inner = '<p class="wg-desc">🏅 อันดับพอร์ตของทุกคนในเมือง (สัปดาห์ ' + s.week + ')</p>' + SC.main._leaderboardHtml();
    } else {
      // ตึกสินทรัพย์ (bond/gold/realestate/crypto/green/startup): การ์ดข้อมูลอ้างอิง
      var a = SC.getAssetRefByTower(b.id);
      var lvl = a ? Math.max(1, Math.min(5, Math.round(a.vol * 10))) : 1;
      var risk = '';
      for (var i = 1; i <= 5; i++) risk += '<i class="' + (i <= lvl ? 'on' : '') + '"></i>';
      inner =
        '<div class="wg-asset">' +
          '<div class="wg-asset-emoji">' + b.emoji + '</div>' +
          (a ?
            '<p class="wg-desc">' + a.note + '</p>' +
            '<div class="wg-rows">' +
              '<div><label>ราคาอ้างอิง</label><b>฿' + this._num(a.start, 2) + '</b></div>' +
              '<div><label>ผลตอบแทน/ปี</label><b>' + (a.yield > 0 ? (a.yield * 100).toFixed(1) + '%' : '—') + '</b></div>' +
              '<div><label>ความเสี่ยง</label><b class="wg-risk">' + risk + '</b></div>' +
            '</div>' +
            '<p class="wg-soon">🔒 การซื้อขายสินทรัพย์นี้ยังไม่เปิดให้บริการ (เร็วๆ นี้)</p>'
            : '<p class="wg-desc">อาคารประจำเมือง</p>') +
        '</div>';
    }

    f.innerHTML =
      '<div class="wg-banner">' + b.name + ' · ' + b.en.toUpperCase() + '</div>' +
      '<button class="wg-x" data-wclose>✕</button>' +
      '<div class="wg-body">' + inner + '</div>';
    f.querySelector('[data-wclose]').onclick = function () { self.close(); };
  },

  // ============================================================
  // 🏦 ธนาคาร (ตึก fin) — กู้ / ชำระหนี้ / ฝาก / ถอน (GAME_SPEC 5.2)
  // ============================================================
  _buildBank: function (b) {
    // ใช้กรอบอาร์ต BANK & SAVINGS (assets/windows/frames/bank_frame.png) — สเกล em เหมือนหน้าต่างสินทรัพย์
    this._frame.innerHTML =
      '<button class="wa-x" data-wclose title="ปิด (Esc)"></button>' +
      '<div class="wa-body" id="bankBody"></div>';
    this._bindClose();
    this._renderBank();
  },

  _renderBank: function () {
    // เลย์เอาต์ตามตัวอย่าง bank savings win ex.png: แผงเขียว 2×2 (ถอน/ฝาก/กู้/ชำระหนี้)
    // แต่ละแผงมีป้ายหัว + ไอคอน + ช่องจำนวนเงิน (− / + / MAX ขั้นละ ฿500) + ปุ่มใหญ่ · แถบ BALANCE กลางล่าง
    var self = this, s = SC.state, p = s.player, cfg = SC.config.bank;
    var rt = SC.bank.rates();   // อัตราดอกเบี้ยปัจจุบัน (เหตุการณ์ rateHike/rateCut เปลี่ยนชั่วคราว)
    var el = this._frame.querySelector('#bankBody');
    if (!el) return;
    var broken = p.brokenCredit > 0;
    if (!this._bankAmt) this._bankAmt = { wd: 500, dep: 500, loan: 500, repay: 500 };
    var A = this._bankAmt;
    // เงินธนาคารเป็นจำนวนเต็มเสมอ — ตัดทศนิยม .00 ของ SC.ui.money ออกให้จออ่านง่าย
    function baht(n) { return '฿' + Math.round(n).toLocaleString('en-US'); }

    function panel(key, icon, th, en, sub, btnTxt, dis) {
      return '<div class="bank-panel' + (dis ? ' disabled' : '') + '">' +
        '<div class="bank-plq"><b>' + th + '</b><small>' + en + '</small></div>' +
        '<div class="bank-pbody">' +
          '<div class="bank-ico">' + icon + '</div>' +
          '<div class="bank-ctl">' +
            '<label>จำนวนเงิน</label>' +
            '<div class="bank-amt">' +
              '<b>' + baht(A[key]) + '</b>' +
              '<button data-bstep="' + key + ':-" title="−฿500">−</button>' +
              '<button data-bstep="' + key + ':+" title="+฿500">+</button>' +
              '<button class="bank-max" data-bmax="' + key + '">MAX</button>' +
            '</div>' +
            '<small class="bank-sub">' + sub + '</small>' +
          '</div>' +
        '</div>' +
        '<button class="bank-act" data-bact="' + key + '">' + btnTxt + '</button>' +
      '</div>';
    }

    var depSub = 'เงินฝาก ' + baht(p.deposit) + ' · ดอกเบี้ย ' + (rt.depositRate * 100).toFixed(1) + '%/รอบ' +
                 (broken ? ' <span class="bad">— เครดิตพัง ไม่ได้ดอก!</span>' : '');
    var loanSub = broken
      ? '<span class="bad">💳 เครดิตพังอีก ' + p.brokenCredit + ' รอบ — กู้ไม่ได้</span>'
      : 'หนี้ ' + baht(p.debt) + ' / เพดาน ' + baht(cfg.loanCap) + ' · ดอก ' + (rt.loanRate * 100).toFixed(1) + '%/รอบ';

    el.innerHTML =
      '<div class="bank-grid">' +
        panel('wd',    '💰', 'ถอนเงิน',  'WITHDRAW', 'ถอนได้สูงสุด ' + baht(p.deposit), 'ถอนเงิน') +
        panel('dep',   '🐷', 'ฝากเงิน',  'DEPOSIT',  depSub, 'ฝากเงิน') +
        panel('loan',  '📜', 'กู้เงิน',   'LOAN',     loanSub, 'ขอสินเชื่อ', broken) +
        panel('repay', '💳', 'ชำระหนี้', 'PAY LOAN', 'หนี้คงค้าง ' + baht(p.debt), 'ชำระหนี้') +
      '</div>' +
      '<div class="bank-balance">เงินสด<b>' + baht(p.cash) + '</b></div>';

    this._bindAll('data-bstep', function (v) {
      var q = v.split(':');
      A[q[0]] = Math.max(0, A[q[0]] + (q[1] === '+' ? 500 : -500));
      self._renderBank();
    });
    this._bindAll('data-bmax', function (k) {
      A[k] = k === 'dep'  ? p.cash
           : k === 'wd'   ? p.deposit
           : k === 'loan' ? Math.max(0, cfg.loanCap - p.debt)
           :                Math.min(p.debt, p.cash);
      self._renderBank();
    });
    this._bindAll('data-bact', function (k) {
      var amt = A[k], r;
      if (k === 'dep')   r = SC.bank.deposit(p, amt);
      if (k === 'wd')    r = SC.bank.withdraw(p, amt);
      if (k === 'loan')  r = SC.bank.borrow(p, amt);
      if (k === 'repay') r = SC.bank.repay(p, amt);
      if (r && !r.ok) SC.ui.toast(r.msg, 'bad');
      else SC.ui.renderHUD();
      self._renderBank();
    });
  },

  // ============================================================
  // 📰 ตึกข่าวสาร (ตึก news) — บริการ 1 อย่างต่อการเข้า (GAME_SPEC 4.3)
  // ============================================================
  _buildNews: function (b) {
    // กรอบอาร์ต NEWS LIVE (frames/news_frame.png) — เลย์เอาต์ตามตัวอย่าง news win ex.png:
    // ตาราง 3 คอลัมน์ (บริการ / ราคา / ผล) 3 แถว + โน้ต + ฟีดข่าวย่อ · ปุ่ม X แดงกลางล่างตามตัวอย่าง
    this._frame.innerHTML =
      '<button class="wa-x wa-x-drawn wa-x-news" data-wclose title="ปิด (Esc)">✕</button>' +
      '<div class="wa-body" id="newsBody"></div>';
    this._bindClose();
    this._rumorPick = { asset: 'PTT', dir: 1, size: 0.15 };
    this._renderNews();
  },

  _renderNews: function () {
    var self = this, s = SC.state, p = s.player;
    var el = this._frame.querySelector('#newsBody');
    if (!el) return;
    var used = this._svcUsed;

    // แถวบริการ: [ไอคอน+ชื่อ+ฟอร์ม] [ราคา+ปุ่มซื้อ] [ผลที่ได้]
    function row(icon, name, desc, formHtml, price, act, effIcon, eff) {
      return '<div class="news-cell news-svc-c"><span class="news-ic">' + icon + '</span>' +
               '<div class="news-svc-t"><b>' + name + '</b><small>' + desc + '</small>' + (formHtml || '') + '</div></div>' +
             '<div class="news-cell news-price"><b>฿' + price.toLocaleString('en-US') + '</b>' +
               '<button class="news-buy" data-nsvc="' + act + '"' + (used ? ' disabled' : '') + '>🛒 ซื้อ</button></div>' +
             '<div class="news-cell news-eff"><span class="news-ic sm">' + effIcon + '</span><small>' + eff + '</small></div>';
    }

    // fact-check: เลือกการ์ดที่ยังไม่เคยตรวจ
    var unchecked = p.news.filter(function (c) { return !c.checked; });
    var fcForm = unchecked.length
      ? '<select id="fcCard">' + unchecked.map(function (c) {
          return '<option value="' + c.id + '">' + c.headline + '</option>';
        }).join('') + '</select>'
      : '<small class="muted">— ไม่มีการ์ดข่าวให้ตรวจ —</small>';

    // ข่าวลือ: เลือกพาดหัวจาก template (สินทรัพย์+ทิศทาง+ขนาด)
    var rp = this._rumorPick;
    var rumorForm =
      '<div class="news-rumor-row">' +
        '<select id="rumorAsset">' + SC.newsSys.TARGETS.map(function (t) {
          return '<option value="' + t.key + '"' + (rp.asset === t.key ? ' selected' : '') + '>' + t.name + '</option>';
        }).join('') + '</select>' +
        '<select id="rumorDir"><option value="1"' + (rp.dir > 0 ? ' selected' : '') + '>📈 บวก</option><option value="-1"' + (rp.dir < 0 ? ' selected' : '') + '>📉 ลบ</option></select>' +
        '<select id="rumorSize"><option value="0.10"' + (rp.size === 0.10 ? ' selected' : '') + '>10%</option><option value="0.15"' + (rp.size === 0.15 ? ' selected' : '') + '>15%</option><option value="0.20"' + (rp.size === 0.20 ? ' selected' : '') + '>20%</option></select>' +
      '</div>';

    // ฟีดย่อ: ข่าวสาธารณะ + การ์ดในมือ (แท็กจริง/ปลอมเฉพาะที่ตรวจแล้ว)
    var pub = SC.newsSys.activePublic();
    var pubHtml = pub.length ? pub.map(function (nw) {
      return '<div class="news-item">' + nw.headline + ' <small class="muted">· มีผลรอบ ' + nw.dueRound + '</small></div>';
    }).join('') : '<p class="muted">ยังไม่มีข่าวสาธารณะตอนนี้</p>';
    var mine = p.news.length ? p.news.map(function (c) {
      var tag = c.checked ? (c.isReal ? '<span class="news-tag real">จริง ✓</span>' : '<span class="news-tag fake">ปลอม ✗</span>')
                          : '<span class="news-tag">?</span>';
      return '<div class="news-item mine">' + c.headline + ' <small class="muted">· รอบ ' + c.dueRound + '</small> ' + tag + '</div>';
    }).join('') : '<p class="muted">ยังไม่มีการ์ดข่าวในมือ</p>';

    el.innerHTML =
      '<div class="news-tbl' + (used ? ' used' : '') + '">' +
        '<div class="news-th">บริการ</div><div class="news-th">ราคา (จ่ายเข้าระบบ)</div><div class="news-th">ผล</div>' +
        row('🗂️', 'ซื้อข่าววงใน', 'จั่วการ์ดข่าววงใน 1 ใบ', '', 500, 'buy',
            '🃏', 'จั่วการ์ดข่าววงใน 1 ใบ<br>จริง 60 : ปลอม 40 — รู้คนเดียว') +
        row('🔬', 'ตรวจสอบข่าว (fact-check)', 'เลือกข่าวในมือ 1 ใบ', fcForm, 700, 'fc',
            '✅', 'ระบบบอกเจ้าตัวคนเดียวว่า จริง/ปลอม') +
        row('📣', 'ปล่อยข่าวลือ', 'เลือกพาดหัวจาก template (สินทรัพย์+ทิศทาง+ขนาด)', rumorForm, 1000, 'rumor',
            '📰', 'แสดงเป็นข่าวสาธารณะรอบถัดไป<br>แบบไม่ระบุตัวตน ไม่มีผลต่อราคา') +
      '</div>' +
      '<p class="news-note">' + (used
        ? '✅ ใช้บริการรอบนี้แล้ว — เดินเข้าใหม่เพื่อใช้อีกครั้ง'
        : 'ℹ️ ค่าบริการจะถูกหักจากเงินสดของคุณทันที · เลือกใช้ได้ 1 บริการต่อการเข้า 1 ครั้ง') + '</p>' +
      '<div class="news-lists">' +
        '<div><h5>🗞️ ข่าวสาธารณะ</h5><div class="news-scroll">' + pubHtml + '</div></div>' +
        '<div><h5>🤫 ข่าววงในของคุณ (ลับ)</h5><div class="news-scroll">' + mine + '</div></div>' +
      '</div>';

    var pick = function () {
      var a = el.querySelector('#rumorAsset'), d = el.querySelector('#rumorDir'), z = el.querySelector('#rumorSize');
      self._rumorPick = { asset: a ? a.value : 'PTT', dir: d ? +d.value : 1, size: z ? +z.value : 0.15 };
      return self._rumorPick;
    };

    this._bindAll('data-nsvc', function (v) {
      if (self._svcUsed) return;
      if (v === 'buy') {
        var r = SC.newsSys.buyNews(p);
        if (!r.ok) { SC.ui.toast(r.msg, 'bad'); return; }
        self._svcUsed = true;
        SC.ui.toast('📨 ได้ข่าววงในใหม่: ' + r.card.headline, 'good');
      } else if (v === 'fc') {
        var sel = el.querySelector('#fcCard');
        if (!sel) { SC.ui.toast('ไม่มีการ์ดข่าวให้ตรวจ', 'bad'); return; }
        var r3 = SC.newsSys.factCheck(p, sel.value);
        if (!r3.ok) { SC.ui.toast(r3.msg, 'bad'); return; }
        self._svcUsed = true;
        SC.ui.toast('🔬 ผลตรวจ: ข่าว' + (r3.card.isReal ? 'จริง ✓' : 'ปลอม ✗') + ' (รู้คนเดียว)', r3.card.isReal ? 'good' : 'warn');
      } else if (v === 'rumor') {
        var o = pick();
        var r2 = SC.newsSys.plantRumor(p, o.asset, o.dir, o.size);
        if (!r2.ok) { SC.ui.toast(r2.msg, 'bad'); return; }
        self._svcUsed = true;
        SC.ui.toast('📣 ปล่อยข่าวลือแล้ว — โผล่ในฟีดรอบถัดไปแบบนิรนาม', 'warn');
      }
      SC.ui.renderHUD();
      self._renderNews();
    });
  },

  // ============================================================
  // 🏅 ลีดเดอร์บอร์ด — ส่องพอร์ตละเอียดได้ทีละ 1 คนต่อการเข้า (GAME_SPEC 5.2)
  // ============================================================
  _buildLeaderboard: function (b) {
    // กรอบอาร์ต LEADERBOARD (frames/leaderboard_frame.png) — UI มินิมอลทับ:
    // อันดับซ้าย / รายละเอียดส่องขวา + ชิปชื่อ top-3 บนแท่น 1/2/3 ของอาร์ต + คำบรรยายบนแถบเขียวล่าง
    this._frame.innerHTML =
      '<button class="wa-x wa-x-drawn wa-x-lb" data-wclose title="ปิด (Esc)">✕</button>' +
      '<div class="wa-body" id="lbBody"></div>' +
      '<div class="lb-pod" id="lbPod1"></div>' +
      '<div class="lb-pod" id="lbPod2"></div>' +
      '<div class="lb-pod" id="lbPod3"></div>' +
      '<div class="lb-note">👁️ ส่องพอร์ตละเอียดได้ 1 คน ต่อการเข้า 1 ครั้ง</div>';
    this._bindClose();
    this._spyTarget = null;
    this._renderLeaderboard();
  },

  _renderLeaderboard: function () {
    var self = this, s = SC.state;
    var el = this._frame.querySelector('#lbBody');
    if (!el) return;

    var rows = SC.main._leaderboard();

    // ชิปชื่อบนแท่น 1/2/3 (อันดับหยาบ — ไม่โชว์ตัวเลข)
    for (var i = 0; i < 3; i++) {
      var pod = this._frame.querySelector('#lbPod' + (i + 1));
      if (pod) pod.textContent = rows[i] ? rows[i].name : '';
    }

    var listHtml = '<div class="lb-list">' + rows.map(function (r, i) {
      var medal = ['🥇', '🥈', '🥉'][i] || '<i>' + (i + 1) + '</i>';
      var spyBtn = self._svcUsed
        ? (self._spyTarget === r.actor ? '<span class="lb-spying">👁️ กำลังส่อง</span>' : '')
        : '<button class="lb-spy" data-spy="' + (r.actor.id || 'player') + '">🔍 ส่องพอร์ต</button>';
      return '<div class="lb-row' + (r.isPlayer ? ' me' : '') + '"><span class="lb-medal">' + medal + '</span>' +
             '<b>' + r.name + '</b>' + spyBtn + '</div>';
    }).join('') + '</div>';

    var detailHtml =
      '<div class="lb-hint"><b>🏅 อันดับรอบ ' + s.week + '</b>' +
      '<p>อันดับหยาบดูฟรี (ไม่โชว์ตัวเลข)<br>ส่องพอร์ตละเอียดได้ 1 คนต่อการเข้า —<br>' +
      'เห็นสินทรัพย์รายหมวด / เงินสด / ฝาก / หนี้<br>ไม่เห็นการ์ดอาชีพและการ์ดข่าว</p></div>';
    if (this._spyTarget) {
      var t = this._spyTarget, v = SC.attacks.categoryValues(t);
      var rowsD = [
        ['💰 เงินสด', t.cash], ['🏦 เงินฝาก', v.deposit], ['💳 หนี้คงค้าง', t.debt ? -t.debt : 0],
        ['📈 หุ้น', v.stock], ['🪙 คริปโต', v.crypto], ['🏆 ทอง', v.gold],
        ['📜 พันธบัตร+กองทุน', v.bond + v.fund], ['🏠 อสังหา', v.prop],
      ].map(function (r) {
        return '<div class="spy-row"><label>' + r[0] + '</label><b class="' + (r[1] < 0 ? 'down' : '') + '">' + SC.ui.money(r[1]) + '</b></div>';
      }).join('');
      detailHtml = '<div class="spy-detail"><h4>🔍 พอร์ตของ ' + (t.isPlayer ? 'คุณ' : t.name) + ' (รอบ ' + s.week + ')</h4>' + rowsD +
        '<div class="spy-row total"><label>รวมมูลค่าสุทธิ</label><b>' + SC.ui.money(SC.portfolioValue(t, s.prices)) + '</b></div></div>';
    }

    el.innerHTML = '<div class="lb-cols"><div class="lb-col">' + listHtml + '</div><div class="lb-col">' + detailHtml + '</div></div>';

    this._bindAll('data-spy', function (id) {
      if (self._svcUsed) return;
      self._svcUsed = true;
      self._spyTarget = id === 'player' ? s.player : s.bots.find(function (x) { return x.id === id; });
      self._renderLeaderboard();
    });
  },

  // ============================================================
  // helper ร่วมของหน้าต่างสินทรัพย์ (กรอบจาก assets/windows/frames/)
  // ============================================================
  _pct: function (pct) { // ป้าย +x.x% เขียว/แดง
    var cls = pct >= 0 ? 'up' : 'down', sg = pct >= 0 ? '+' : '';
    return '<b class="' + cls + '">' + sg + pct.toFixed(2) + '%</b>';
  },
  _bindClose: function () {
    var self = this;
    var x = this._frame.querySelector('[data-wclose]');
    if (x) x.onclick = function () { self.close(); };
  },
  _bindAll: function (attr, fn) { // ปุ่มตามแอตทริบิวต์ data-*
    Array.prototype.forEach.call(this._frame.querySelectorAll('[' + attr + ']'), function (bt) {
      bt.onclick = function (ev) { ev.stopPropagation(); fn(bt.getAttribute(attr), bt); };
    });
  },
  _numStep: function (cur, step, d) { // เดินค่าทีละ step (คูณ 5 เมื่อเกิน 10 step — กดน้อยลง)
    var big = (d > 0 ? cur >= step * 10 - 1e-9 : cur > step * 10 + 1e-9) ? step * 5 : step;
    return Math.max(step, +(cur + d * big).toFixed(6));
  },

  // ============================================================
  // 🪙 CRYPTO ARENA (ตึก crypto) — เหรียญ 6 ตัว ซื้อขายเศษเหรียญได้
  // ============================================================
  _buildCrypto: function () {
    var f = this._frame, self = this;
    SC.markets.ensure();
    var q = this._cqty;
    SC.coins.forEach(function (c) { if (!q[c.id]) q[c.id] = c.step * 10; });
    f.innerHTML =
      '<button class="wa-x" data-wclose title="ปิด (Esc)"></button>' +
      '<div class="wa-body">' +
        '<div class="wa-tabs">' +
          '<button class="wa-tab" data-atab="over">OVERVIEW</button>' +
          '<button class="wa-tab" data-atab="port">MY PORTFOLIO</button>' +
        '</div>' +
        '<div class="wa-main"></div>' +
        '<div class="wa-foot"></div>' +
      '</div>';
    this._bindClose();
    this._bindAll('data-atab', function (t) { self._ctab = t; self._renderCrypto(); });
    this._renderCrypto();
  },

  _renderCrypto: function () {
    var f = this._frame, self = this, s = SC.state, m = s.markets, a = s.player.assets;
    Array.prototype.forEach.call(f.querySelectorAll('[data-atab]'), function (bt) {
      bt.classList.toggle('active', bt.getAttribute('data-atab') === self._ctab);
    });
    this._charts = [];
    var main = f.querySelector('.wa-main');

    // มูลค่าคริปโตที่ถือ
    var walletVal = 0;
    SC.coins.forEach(function (c) { walletVal += (a.coins[c.id] || 0) * SC.markets.coinPrice(c.id); });

    if (this._ctab === 'over') {
      // series มูลค่าตลาดรวม (ราคา × supply ทุกเหรียญ)
      var L = m.coin.BTC.length, caps = [];
      for (var t = 0; t < L; t++) {
        var cap = 0;
        SC.coins.forEach(function (c) { cap += m.coin[c.id][t] * c.supply; });
        caps.push(cap);
      }
      var capNow = caps[L - 1], capPrev = caps[L - 2] || capNow;
      var capPct = capPrev ? (capNow - capPrev) / capPrev * 100 : 0;
      // top gainer / loser + sentiment
      var best = null, worst = null, sum = 0;
      SC.coins.forEach(function (c) {
        var pc = SC.markets.change(m.coin[c.id])[1];
        sum += pc;
        if (!best || pc > best.pc) best = { c: c, pc: pc };
        if (!worst || pc < worst.pc) worst = { c: c, pc: pc };
      });
      var senti = Math.max(5, Math.min(95, Math.round(50 + sum / SC.coins.length * 2.5)));
      var vol = capNow * (0.05 + Math.abs(capPct) / 100 * 2);

      var rows = SC.coins.map(function (c) {
        var px = SC.markets.coinPrice(c.id), pc = SC.markets.change(m.coin[c.id])[1];
        var hold = a.coins[c.id] || 0;
        return '<tr data-crow="' + c.id + '" class="' + (c.id === self._csel ? 'sel' : '') + '">' +
          '<td><div class="st-co"><span class="st-ico" style="background:' + c.color + '">' + c.icon + '</span>' +
            '<span class="st-nm"><b>' + c.name + '</b><small>' + c.sym + '</small></span></div></td>' +
          '<td class="num">฿' + self._num(px, px >= 100 ? 2 : 3) + '</td>' +
          '<td class="num">' + self._pct(pc) + '</td>' +
          '<td class="num">' + (hold > 0 ? self._num(hold, c.dec) : '—') + '</td>' +
          '<td class="num">' + (hold > 0 ? SC.ui.money(hold * px) : '—') + '</td>' +
          '<td><span class="qty2"><button data-cdq="' + c.id + '">−</button>' +
            '<span class="q2v" id="cq-' + c.id + '">' + self._num(self._cqty[c.id], c.dec) + '</span>' +
            '<button data-ciq="' + c.id + '">+</button></span></td>' +
          '<td><button class="buy2' + (self._cmode === 'sell' ? ' sellmode' : '') + '" data-ctr="' + c.id + '">' +
            (self._cmode === 'sell' ? 'SELL' : 'BUY') + '</button></td>' +
        '</tr>';
      }).join('');

      // แผงซ้าย: กราฟตลาดรวม หรือกราฟรายเหรียญที่เลือก (คลิกแถวขวา — แพทเทิร์นเดียวกับหน้าต่างหุ้น)
      var selC = this._csel ? SC.coins.find(function (c) { return c.id === self._csel; }) : null;
      var leftHtml;
      if (selC) {
        var selPx = SC.markets.coinPrice(selC.id), selCh = SC.markets.change(m.coin[selC.id]);
        leftHtml =
          '<div class="wp-title"><span class="st-ico" style="background:' + selC.color + '">' + selC.icon + '</span> ' +
            selC.name + ' · ' + selC.sym + ' <span class="wa-live">● LIVE</span></div>' +
          '<label class="wa-lab">PRICE</label>' +
          '<b class="wa-big">฿' + this._num(selPx, selPx >= 100 ? 2 : 3) + '</b>' +
          '<div class="wa-sub">' + this._pct(selCh[1]) + ' เทียบสัปดาห์ก่อน</div>' +
          '<div class="wa-chart"><canvas id="caChart"></canvas></div>' +
          '<div class="wa-sub">ถือ: ' + ((a.coins[selC.id] || 0) > 0 ? this._num(a.coins[selC.id], selC.dec) + ' ' + selC.sym + ' (' + SC.ui.money((a.coins[selC.id] || 0) * selPx) + ')' : '—') + '</div>' +
          '<button class="wf-btn" id="caBack">‹ กลับกราฟตลาดรวม</button>';
      } else {
        leftHtml =
          '<div class="wp-title">MARKET OVERVIEW <span class="wa-live">● LIVE</span></div>' +
          '<label class="wa-lab">TOTAL MARKET CAP</label>' +
          '<b class="wa-big">' + SC.ui.money(capNow) + '</b>' +
          '<div class="wa-sub">' + this._pct(capPct) + ' เทียบสัปดาห์ก่อน</div>' +
          '<div class="wa-chart"><canvas id="caChart"></canvas></div>' +
          '<div class="ov-stats">' +
            '<div class="ov-stat"><label>TOP GAINER</label><b class="up">' + best.c.sym + ' ▲' + best.pc.toFixed(1) + '%</b></div>' +
            '<div class="ov-stat"><label>TOP LOSER</label><b class="down">' + worst.c.sym + ' ▼' + Math.abs(worst.pc).toFixed(1) + '%</b></div>' +
            '<div class="ov-stat"><label>VOLUME</label><b>' + this._fmtVol(Math.round(vol)) + '</b></div>' +
          '</div>' +
          '<div class="wa-senti"><label>MARKET SENTIMENT</label>' +
            '<div class="wa-sentibar"><i style="width:' + senti + '%"></i></div>' +
            '<b class="' + (senti >= 50 ? 'up' : 'down') + '">' + (senti >= 50 ? 'BULLISH' : 'BEARISH') + ' ' + senti + '%</b></div>';
      }

      main.innerHTML =
        '<div class="wa-cols">' +
          '<div class="wa-p wa-left">' + leftHtml + '</div>' +
          '<div class="wa-p wa-right">' +
            '<div class="wp-title">TOP CRYPTOCURRENCIES <small class="wp-sub">คลิกแถวดูกราฟรายเหรียญ · ซื้อเศษเหรียญได้</small></div>' +
            '<div class="wf-tablewrap"><table class="wf-table"><thead><tr>' +
              '<th>COIN</th><th>PRICE</th><th>CHANGE</th><th>HOLDINGS</th><th>VALUE</th><th>' +
              (this._cmode === 'sell' ? 'SELL' : 'BUY') + ' QTY</th><th></th></tr></thead>' +
              '<tbody>' + rows + '</tbody></table></div>' +
          '</div>' +
        '</div>';
      this._charts.push(function () {
        var c = f.querySelector('#caChart');
        if (!c) return;
        if (self._csel) {
          self._lineChart(c, m.coin[self._csel].slice(), {
            fmt: function (v) { return v >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(2); },
            unit: '฿',
          });
        } else {
          self._lineChart(c, caps, { fmt: function (v) { return self._fmtVol(Math.round(v)); } });
        }
      });

      // คลิกแถวเหรียญ = ดูกราฟรายตัว (ปุ่มในแถวไม่นับ) · ปุ่มกลับ = กราฟตลาดรวม
      Array.prototype.forEach.call(f.querySelectorAll('[data-crow]'), function (tr) {
        tr.onclick = function (ev) {
          if (ev.target.closest('button')) return;
          self._csel = tr.getAttribute('data-crow');
          self._renderCrypto();
        };
      });
      var backBt = f.querySelector('#caBack');
      if (backBt) backBt.onclick = function () { self._csel = null; self._renderCrypto(); };

      this._bindAll('data-ciq', function (id) {
        var c = SC.coins.find(function (x) { return x.id === id; });
        self._cqty[id] = self._numStep(self._cqty[id], c.step, +1);
        f.querySelector('#cq-' + id).textContent = self._num(self._cqty[id], c.dec);
      });
      this._bindAll('data-cdq', function (id) {
        var c = SC.coins.find(function (x) { return x.id === id; });
        self._cqty[id] = self._numStep(self._cqty[id], c.step, -1);
        f.querySelector('#cq-' + id).textContent = self._num(self._cqty[id], c.dec);
      });
      this._bindAll('data-ctr', function (id) {
        var r = SC.markets.tradeCoin(id, self._cqty[id], self._cmode);
        if (!r.ok) { SC.ui.toast(r.msg, 'bad'); return; }
        SC.ui.toast((self._cmode === 'sell' ? 'ขาย ' : 'ซื้อ ') + id + ' ' + self._num(self._cqty[id], 4) + ' เหรียญ', 'good');
        SC.ui.renderHUD(); self._renderCrypto();
      });
    } else {
      // MY PORTFOLIO
      var slices = [];
      SC.coins.forEach(function (c) {
        var v = (a.coins[c.id] || 0) * SC.markets.coinPrice(c.id);
        if (v > 0) slices.push({ label: c.sym, value: v, color: c.color });
      });
      var held = SC.coins.filter(function (c) { return (a.coins[c.id] || 0) > 0; });
      var rows2 = held.map(function (c) {
        var hold = a.coins[c.id], px = SC.markets.coinPrice(c.id), v = hold * px;
        var w = walletVal > 0 ? v / walletVal * 100 : 0;
        return '<tr>' +
          '<td><div class="st-co"><span class="st-ico" style="background:' + c.color + '">' + c.icon + '</span>' +
            '<span class="st-nm"><b>' + c.name + '</b><small>' + c.sym + '</small></span></div></td>' +
          '<td class="num">' + self._num(hold, c.dec) + '</td>' +
          '<td class="num">฿' + self._num(px, 2) + '</td>' +
          '<td class="num">' + SC.ui.money(v) + '</td>' +
          '<td><div class="wbar"><i style="width:' + Math.min(100, w).toFixed(1) + '%;background:' + c.color + '"></i></div><small class="wpct">' + w.toFixed(1) + '%</small></td>' +
          '<td><button class="buy2 sellmode" data-cps="' + c.id + '">SELL ทั้งหมด</button></td>' +
        '</tr>';
      }).join('');
      main.innerHTML =
        '<div class="wa-cols">' +
          '<div class="wa-p wa-left">' +
            '<div class="wp-title">MY CRYPTO WALLET</div>' +
            '<div class="pf-donut"><canvas id="caDonut"></canvas></div>' +
            '<div class="ov-stats">' +
              '<div class="ov-stat"><label>มูลค่าคริปโต</label><b>' + SC.ui.money(walletVal) + '</b></div>' +
              '<div class="ov-stat"><label>เหรียญที่ถือ</label><b>' + held.length + ' / ' + SC.coins.length + '</b></div>' +
              '<div class="ov-stat"><label>เงินสด</label><b>' + SC.ui.money(s.player.cash) + '</b></div>' +
            '</div>' +
          '</div>' +
          '<div class="wa-p wa-right">' +
            '<div class="wp-title">HOLDINGS</div>' +
            '<div class="wf-tablewrap"><table class="wf-table"><thead><tr>' +
              '<th>COIN</th><th>QTY</th><th>PRICE</th><th>VALUE</th><th>WEIGHT</th><th></th></tr></thead>' +
              '<tbody>' + (rows2 || '<tr><td colspan="6" class="pf-empty">ยังไม่มีเหรียญ — กลับแท็บ OVERVIEW แล้วกด BUY 🛒</td></tr>') + '</tbody></table></div>' +
          '</div>' +
        '</div>';
      this._charts.push(function () { self._drawDonut('#caDonut', slices, walletVal, { label: 'มูลค่ารวม' }); });
      this._bindAll('data-cps', function (id) {
        var r = SC.markets.tradeCoin(id, a.coins[id], 'sell');
        if (!r.ok) { SC.ui.toast(r.msg, 'bad'); return; }
        SC.ui.toast('ขาย ' + id + ' ทั้งหมด (+' + SC.ui.money(r.gain) + ')', 'good');
        SC.ui.renderHUD(); self._renderCrypto();
      });
    }

    f.querySelector('.wa-foot').innerHTML =
      '<div class="wf-cash">💵<span class="wf-cashcol"><label>AVAILABLE CASH</label><b>' + SC.ui.money(s.player.cash) + '</b></span></div>' +
      '<button class="wf-btn" id="caQuick">' + (this._cmode === 'sell' ? '🔁 QUICK BUY' : '🔁 QUICK SELL') + '</button>' +
      '<div class="wf-cash">🔐<span class="wf-cashcol"><label>SECURE WALLET</label><b>' + SC.ui.money(walletVal) + '</b></span></div>' +
      '<small class="wa-note">⚠️ คริปโตผันผวนสูงมาก — ลงเท่าที่เสียได้</small>';
    f.querySelector('#caQuick').onclick = function () {
      self._cmode = self._cmode === 'sell' ? 'buy' : 'sell';
      if (self._ctab !== 'over') self._ctab = 'over';
      self._renderCrypto();
      SC.ui.toast(self._cmode === 'sell' ? '🔁 โหมดขาย' : '🔁 โหมดซื้อ', '');
    };
    this._charts.forEach(function (fn) { fn(); });
  },

  // ============================================================
  // 🏆 GOLD VAULT (ตึก gold) — ซื้อทองเป็นกรัม + อัปเกรดตู้เซฟ
  // ============================================================
  _buildGold: function () {
    var f = this._frame;
    SC.markets.ensure();
    f.innerHTML = '<button class="wa-x" data-wclose title="ปิด (Esc)"></button><div class="wa-body"></div>';
    this._bindClose();
    this._renderGold();
  },

  _renderGold: function () {
    var f = this._frame, self = this, s = SC.state, m = s.markets, a = s.player.assets;
    this._charts = [];
    var px = SC.markets.goldPrice(), ch = SC.markets.change(m.gold);
    var cap = SC.markets.goldCap(a), gold = a.gold || 0;
    var capLv = a.goldCapLv || 0, secLv = a.goldSecLv || 0;
    var nextCap = capLv < SC.goldCfg.storage.length ? SC.goldCfg.storage[capLv] : null;
    var nextSec = secLv < SC.goldCfg.security.length ? SC.goldCfg.security[secLv] : null;
    var cost = px * this._gq;
    var pips = '';
    for (var i = 1; i <= 3; i++) pips += '<i class="' + (i <= secLv ? 'on' : '') + '"></i>';

    f.querySelector('.wa-body').innerHTML =
      '<div class="gv-buy wa-p">' +
        '<div class="wp-title">BUY GOLD <span class="wa-live">● ราคาตลาด</span></div>' +
        '<div class="gv-price"><label class="wa-lab">ราคาทองตอนนี้</label>' +
          '<b class="wa-big">฿' + this._num(px, 2) + '</b><span class="wa-sub">/กรัม · ' + this._pct(ch[1]) + ' สัปดาห์นี้</span></div>' +
        '<div class="gv-chart"><canvas id="gvChart"></canvas></div>' +
        '<div class="gv-trade">' +
          '<span class="qty2"><button id="gvDq">−</button><span class="q2v" id="gvQ">' + this._gq + '</span><button id="gvIq">+</button></span>' +
          '<span class="gv-recv">กรัม = <b>' + SC.ui.money(cost) + '</b></span>' +
          '<button class="buy2" id="gvBuy">ซื้อ</button>' +
          '<button class="buy2 sellmode" id="gvSell">ขาย</button>' +
        '</div>' +
        '<small class="wa-note">💡 ทองคือสินทรัพย์ปลอดภัย — มักขึ้นเวลาตลาดหุ้นผันผวน แต่ไม่มีปันผล</small>' +
      '</div>' +
      '<div class="gv-row">' +
        '<div class="wa-p gv-card">' +
          '<div class="wp-title">VAULT STORAGE <span class="gv-lv">Lv.' + capLv + '</span></div>' +
          '<div class="gv-bar"><i style="width:' + Math.min(100, gold / cap * 100).toFixed(1) + '%"></i></div>' +
          '<div class="wa-sub">' + this._num(gold, 1) + ' / ' + this._num(cap, 0) + ' กรัม</div>' +
          (nextCap ?
            '<button class="wf-btn gv-up" id="gvUpCap">อัปเกรดเป็น ' + nextCap.cap + ' กรัม — ' + SC.ui.money(nextCap.price) + '</button>' :
            '<div class="wa-note">ความจุสูงสุดแล้ว ✓</div>') +
        '</div>' +
        '<div class="wa-p gv-card">' +
          '<div class="wp-title">VAULT SECURITY <span class="gv-lv">Lv.' + secLv + '</span></div>' +
          '<div class="wg-risk gv-pips">' + pips + '</div>' +
          '<div class="wa-sub">ป้องกันเหตุการณ์ขโมยในอนาคต</div>' +
          (nextSec ?
            '<button class="wf-btn gv-up" id="gvUpSec">ติดตั้ง' + nextSec.name + ' — ' + SC.ui.money(nextSec.price) + '</button>' :
            '<div class="wa-note">ปลอดภัยสูงสุดแล้ว ✓</div>') +
        '</div>' +
        '<div class="wa-p gv-card">' +
          '<div class="wp-title">YOUR GOLD</div>' +
          '<b class="wa-big gv-gold">' + this._num(gold, 1) + ' กรัม</b>' +
          '<div class="wa-sub">มูลค่า <b>' + SC.ui.money(gold * px) + '</b></div>' +
          '<div class="wa-sub">เงินสด ' + SC.ui.money(s.player.cash) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="gv-foot">ⓘ ราคาทองขยับตามตลาดทุกสัปดาห์ · ตู้เซฟเต็มต้องอัปเกรดก่อนซื้อเพิ่ม</div>';

    this._charts.push(function () {
      var c = f.querySelector('#gvChart');
      if (c) self._lineChart(c, m.gold.slice(), { fmt: function (v) { return v.toFixed(1); }, unit: '฿' });
    });
    f.querySelector('#gvIq').onclick = function () { self._gq = self._numStep(self._gq, 1, +1); self._renderGold(); };
    f.querySelector('#gvDq').onclick = function () { self._gq = self._numStep(self._gq, 1, -1); self._renderGold(); };
    f.querySelector('#gvBuy').onclick = function () { self._goldTrade('buy'); };
    f.querySelector('#gvSell').onclick = function () { self._goldTrade('sell'); };
    var uc = f.querySelector('#gvUpCap');
    if (uc) uc.onclick = function () {
      var r = SC.markets.upgradeGold('cap');
      if (!r.ok) { SC.ui.toast(r.msg, 'bad'); return; }
      SC.ui.toast('ขยายตู้เซฟเป็น ' + r.item.cap + ' กรัม ✓', 'good'); SC.ui.renderHUD(); self._renderGold();
    };
    var us = f.querySelector('#gvUpSec');
    if (us) us.onclick = function () {
      var r = SC.markets.upgradeGold('sec');
      if (!r.ok) { SC.ui.toast(r.msg, 'bad'); return; }
      SC.ui.toast('ติดตั้ง' + r.item.name + ' ✓', 'good'); SC.ui.renderHUD(); self._renderGold();
    };
    this._charts.forEach(function (fn) { fn(); });
  },

  _goldTrade: function (side) {
    var r = SC.markets.tradeGold(this._gq, side);
    if (!r.ok) { SC.ui.toast(r.msg, 'bad'); return; }
    SC.ui.toast((side === 'sell' ? 'ขายทอง ' : 'ซื้อทอง ') + this._gq + ' กรัม', 'good');
    SC.ui.renderHUD(); this._renderGold();
  },

  // ============================================================
  // 📜 BONDS & FUND (ตึก bond) — พันธบัตรจ่ายดอกรายสัปดาห์ + กองทุน NAV
  // ============================================================
  _buildBond: function () {
    var f = this._frame;
    SC.markets.ensure();
    var q = this._bq;
    SC.bonds.forEach(function (b) { if (!q[b.id]) q[b.id] = 1; });
    // อาร์ต bonds_new มีแบนเนอร์เขียวว่างกลางบน → เขียนชื่อหน้าต่างลงไปเอง (2026-07-20)
    f.innerHTML = '<button class="wa-x" data-wclose title="ปิด (Esc)"></button>' +
      '<div class="bd-banner">BONDS &amp; FUND</div><div class="wa-body"></div>';
    this._bindClose();
    this._renderBond();
  },

  _renderBond: function () {
    var f = this._frame, self = this, s = SC.state, m = s.markets, a = s.player.assets;
    this._charts = [];
    var bondVal = 0, weekly = 0;
    SC.bonds.forEach(function (b) {
      var u = a.bonds[b.id] || 0;
      bondVal += u * b.face;
      weekly += u * b.face * b.coupon / 52;
    });
    var fundVal = 0;
    SC.funds.forEach(function (fd) { fundVal += (a.funds[fd.id] || 0) * SC.markets.fundNav(fd.id); });

    var bondRows = SC.bonds.map(function (b) {
      var u = a.bonds[b.id] || 0;
      var risk = '';
      for (var i = 1; i <= 3; i++) risk += '<i class="' + (i <= b.risk ? 'on' : '') + '"></i>';
      return '<tr>' +
        '<td><div class="st-co"><span class="st-ico bd-ico">' + b.icon + '</span>' +
          '<span class="st-nm"><b>' + b.name + '</b><small>ครบกำหนด' + b.maturity + ' · เสี่ยง <span class="wg-risk">' + risk + '</span></small></span></div></td>' +
        '<td class="num up">' + (b.coupon * 100).toFixed(2) + '%/ปี</td>' +
        '<td class="num">' + (u > 0 ? u + ' หน่วย' : '—') + '</td>' +
        '<td><span class="qty2"><button data-bdq="' + b.id + '">−</button>' +
          '<span class="q2v" id="bq-' + b.id + '">' + self._bq[b.id] + '</span>' +
          '<button data-biq="' + b.id + '">+</button></span></td>' +
        '<td><button class="buy2" data-bbuy="' + b.id + '">ซื้อ</button></td>' +
        '<td><button class="buy2 sellmode" data-bsell="' + b.id + '">ขาย</button></td>' +
      '</tr>';
    }).join('');

    var fundCards = SC.funds.map(function (fd) {
      var nav = SC.markets.fundNav(fd.id), pc = SC.markets.change(m.fund[fd.id])[1];
      var u = a.funds[fd.id] || 0;
      return '<div class="bd-fund">' +
        '<span class="st-ico" style="background:' + fd.color + '">' + fd.icon + '</span>' +
        '<div class="bd-fmid"><b>' + fd.name + '</b><small>' + fd.note + ' · คาดหวัง <b class="up">' + fd.expect + '</b></small>' +
          '<small>NAV ฿' + self._num(nav, 2) + ' ' + self._pct(pc) + (u > 0 ? ' · ถือ ' + self._num(u, 2) + ' หน่วย ≈ ' + SC.ui.money(u * nav) : '') + '</small></div>' +
        '<div class="bd-fbtns">' +
          '<button class="buy2" data-fb1="' + fd.id + '">ลงทุน ฿100</button>' +
          '<button class="buy2" data-fb5="' + fd.id + '">฿500</button>' +
          (u > 0 ? '<button class="buy2 sellmode" data-fsell="' + fd.id + '">ขายหมด</button>' : '') +
        '</div>' +
      '</div>';
    }).join('');

    var inc = m.income;
    f.querySelector('.wa-body').innerHTML =
      '<div class="wa-cols">' +
        '<div class="wa-p wa-left bd-left">' +
          '<div class="wp-title">MARKET OVERVIEW</div>' +
          '<div class="ov-stats">' +
            '<div class="ov-stat"><label>มูลค่าที่คุณถือ</label><b>' + SC.ui.money(bondVal + fundVal) + '</b></div>' +
            '<div class="ov-stat"><label>ดอกเบี้ยรับ/สัปดาห์</label><b class="up">+' + SC.ui.money(weekly) + '</b></div>' +
            '<div class="ov-stat"><label>รับสัปดาห์ล่าสุด</label><b class="up">+' + SC.ui.money(inc ? inc.coupon + inc.div : 0) + '</b></div>' +
          '</div>' +
          '<div class="wp-title bd-t2">TOP PERFORMING BONDS <small class="wp-sub">หน่วยละ ฿100 · ดอกเบี้ยเข้าเงินสดทุกสัปดาห์</small></div>' +
          '<div class="wf-tablewrap"><table class="wf-table"><thead><tr>' +
            '<th>BOND</th><th>COUPON</th><th>ถือ</th><th>QTY</th><th></th><th></th></tr></thead>' +
            '<tbody>' + bondRows + '</tbody></table></div>' +
          '<small class="wa-note">💡 พันธบัตร = เสี่ยงต่ำสุดในเมือง เงินต้นไม่ผันผวน เหมาะพักเงิน</small>' +
        '</div>' +
        '<div class="wa-p wa-right bd-right">' +
          '<div class="wp-title">RECOMMENDED FUNDS <small class="wp-sub">NAV ขยับทุกสัปดาห์ · ขั้นต่ำ ฿100</small></div>' +
          '<div class="bd-funds">' + fundCards + '</div>' +
          '<div class="wf-cash bd-cash">💵<span class="wf-cashcol"><label>AVAILABLE CASH</label><b>' + SC.ui.money(s.player.cash) + '</b></span></div>' +
        '</div>' +
      '</div>';

    this._bindAll('data-biq', function (id) { self._bq[id] = Math.min(99, self._bq[id] + 1); f.querySelector('#bq-' + id).textContent = self._bq[id]; });
    this._bindAll('data-bdq', function (id) { self._bq[id] = Math.max(1, self._bq[id] - 1); f.querySelector('#bq-' + id).textContent = self._bq[id]; });
    this._bindAll('data-bbuy', function (id) { self._bondTrade(id, 'buy'); });
    this._bindAll('data-bsell', function (id) { self._bondTrade(id, 'sell'); });
    this._bindAll('data-fb1', function (id) { self._fundBuy(id, 100); });
    this._bindAll('data-fb5', function (id) { self._fundBuy(id, 500); });
    this._bindAll('data-fsell', function (id) {
      var r = SC.markets.tradeFund(id, s.player.assets.funds[id], 'sell');
      if (!r.ok) { SC.ui.toast(r.msg, 'bad'); return; }
      SC.ui.toast('ขายกองทุนคืนทั้งหมด (+' + SC.ui.money(r.gain) + ')', 'good');
      SC.ui.renderHUD(); self._renderBond();
    });
  },

  _bondTrade: function (id, side) {
    var r = SC.markets.tradeBond(id, this._bq[id], side);
    if (!r.ok) { SC.ui.toast(r.msg, 'bad'); return; }
    SC.ui.toast((side === 'sell' ? 'ขาย' : 'ซื้อ') + 'พันธบัตร ' + this._bq[id] + ' หน่วย', 'good');
    SC.ui.renderHUD(); this._renderBond();
  },
  _fundBuy: function (id, amt) {
    var r = SC.markets.tradeFund(id, amt, 'buy');
    if (!r.ok) { SC.ui.toast(r.msg, 'bad'); return; }
    SC.ui.toast('ลงทุนกองทุน ' + SC.ui.money(amt) + ' (ได้ ' + this._num(r.units, 2) + ' หน่วย)', 'good');
    SC.ui.renderHUD(); this._renderBond();
  },

  // ============================================================
  // 🏠 REAL ESTATE HUB (ตึก realestate) — ซื้อทรัพย์เก็บค่าเช่ารายสัปดาห์
  //   เลย์เอาต์ตาม asset "real estate win new.png" / ตัวอย่าง "real estate win ex.png":
  //   2 คอลัมน์ ไม่มีแถบเมนูซ้าย — ซ้าย (สถิติ/โดนัทประเภท/ธุรกรรมล่าสุด) + ขวา (Top Earning + Market Trend)
  //   + ปุ่มลัดใหญ่ 4 ปุ่มแถวล่าง (ตัวหนังสือในภาพเพี้ยน → วาดใหม่ด้วย HTML)
  // ============================================================
  RE_ACTS: [ // [action, icon, ชื่อ(ตามภาพ), คำโปรย, คลาสสี] — 4 ปุ่มตาม real estate win ex.png
    ['buy',     '🏠', 'BUY PROPERTY',     'ค้นหาทรัพย์ใหม่',    're-act-purple'],
    ['auction', '🔨', 'AUCTION HOUSE',    'ประมูลดีลพิเศษ',      're-act-green'],
    ['market',  '🤝', 'PROPERTY MARKET',  'เทรดกับผู้เล่นอื่น',   're-act-blue'],
    ['upgrade', '⬆️', 'UPGRADE BUILDING', 'เพิ่มมูลค่า · รายได้', 're-act-gold'],
  ],

  _buildRealEstate: function () {
    var f = this._frame;
    SC.markets.ensure();
    f.innerHTML = '<button class="wa-x" data-wclose title="ปิด (Esc)"></button><div class="wa-body"></div>';
    this._bindClose();
    this._renderRealEstate();
  },

  // การ์ดทรัพย์ 1 ใบ (ใช้ทั้งแท็บซื้อทรัพย์ + ทรัพย์ของฉัน)
  _reCard: function (p) {
    var m = SC.state.markets, a = SC.state.player.assets;
    var px = SC.markets.propPrice(p.id), pc = SC.markets.change(m.prop[p.id])[1];
    var own = !!a.props[p.id];
    var yieldY = p.rent > 0 ? (p.rent * 52 / px * 100).toFixed(1) + '%/ปี' : 'เก็งกำไรที่ดิน';
    return '<div class="re-card' + (own ? ' own' : '') + '">' +
      '<span class="st-ico" style="background:' + p.color + '">' + p.icon + '</span>' +
      '<div class="re-mid"><b>' + p.name + '</b><small>' + p.type + ' · ค่าเช่า ' +
        (p.rent > 0 ? '฿' + p.rent + '/สัปดาห์ (' + yieldY + ')' : '— (' + yieldY + ')') + '</small>' +
        '<small>ราคา <b>' + SC.ui.money(px) + '</b> ' + this._pct(pc) + '</small></div>' +
      (own ?
        '<div class="re-btns"><span class="re-own">✓ เจ้าของ</span><button class="buy2 sellmode" data-rsell="' + p.id + '">ขาย</button></div>' :
        '<div class="re-btns"><button class="buy2" data-rbuy="' + p.id + '">ซื้อ</button></div>') +
    '</div>';
  },

  _renderRealEstate: function () {
    var f = this._frame, self = this, s = SC.state, m = s.markets, a = s.player.assets;
    this._charts = [];
    var owned = SC.properties.filter(function (p) { return a.props[p.id]; });
    var totVal = 0, totRent = 0;
    owned.forEach(function (p) { totVal += SC.markets.propPrice(p.id); totRent += p.rent; });
    var yieldPct = totVal > 0 ? totRent * 52 / totVal * 100 : 0;
    // ดัชนีตลาด = ค่าเฉลี่ย (ราคา/ราคาแรก) ×100
    var L = m.prop[SC.properties[0].id].length, idxSeries = [];
    for (var t = 0; t < L; t++) {
      var sum = 0;
      SC.properties.forEach(function (p) { sum += m.prop[p.id][t] / m.prop[p.id][0]; });
      idxSeries.push(100 * sum / SC.properties.length);
    }
    var idxPct = (idxSeries[L - 1] - idxSeries[L - 2]) / idxSeries[L - 2] * 100;

    // ---- คอลัมน์ซ้าย (ตามมุมมอง) : ภาพรวม / รายการซื้อทรัพย์ / ประวัติธุรกรรม ----
    var slices = [];   // ประกาศนอก branch เพื่อให้ callback วาดโดนัทอ้างถึงได้
    var main = '';
    if (this._rtab === 'buy') {
      var cards = SC.properties.map(function (p) { return self._reCard(p); }).join('');
      main =
        '<div class="wa-p re-panel re-fill">' +
          '<div class="wp-title">BUY PROPERTY <small class="wp-sub">ซื้อขาด · เก็บค่าเช่าทุกสัปดาห์ · ขายคืนตามราคาตลาด</small>' +
            '<button class="re-viewall" data-rnav="over">‹ ภาพรวม</button></div>' +
          '<div class="re-list">' + cards + '</div>' +
          '<div class="re-cashline">💵 เงินสดคงเหลือ <b>' + SC.ui.money(s.player.cash) + '</b></div>' +
        '</div>';
    } else if (this._rtab === 'hist') {
      var allTx = m.log.filter(function (l) { return l.kind === 'prop'; }).map(function (l) {
        var cls = l.side === 'ซื้อ' ? 'down' : 'up';
        return '<div class="re-tx"><span>' + l.name + '</span><b class="' + cls + '">' + l.side + ' ' + SC.ui.money(l.amount) + '</b><small>สัปดาห์ ' + l.week + '</small></div>';
      }).join('') || '<div class="pf-empty">ยังไม่มีธุรกรรมอสังหา</div>';
      main =
        '<div class="wa-p re-panel re-fill">' +
          '<div class="wp-title">ALL TRANSACTIONS <small class="wp-sub">ประวัติซื้อ-ขายอสังหาทั้งหมด</small>' +
            '<button class="re-viewall" data-rnav="over">‹ ภาพรวม</button></div>' +
          '<div class="re-txlist">' + allTx + '</div>' +
        '</div>';
    } else { // 'over' — เลย์เอาต์หลักตามภาพตัวอย่าง
      // โดนัทตามประเภททรัพย์ที่ถือ
      var typeAgg = {};
      owned.forEach(function (p) {
        if (!typeAgg[p.type]) typeAgg[p.type] = { label: p.type, value: 0, color: p.color, n: 0 };
        typeAgg[p.type].value += SC.markets.propPrice(p.id);
        typeAgg[p.type].n++;
      });
      slices = Object.keys(typeAgg).map(function (k) { return typeAgg[k]; });
      var legend = slices.map(function (sl) {
        return '<div class="pf-leg"><i style="background:' + sl.color + '"></i>' +
          '<span>' + sl.label + '</span><small>' + sl.n + ' แห่ง</small><b>' + SC.ui.money(sl.value) + '</b></div>';
      }).join('') || '<div class="pf-empty">ยังไม่มีทรัพย์ — กด "BUY PROPERTY" ด้านล่างเพื่อเริ่มเก็บค่าเช่า 🛒</div>';
      var txRows = m.log.filter(function (l) { return l.kind === 'prop'; }).slice(0, 4).map(function (l) {
        var cls = l.side === 'ซื้อ' ? 'down' : 'up';
        return '<div class="re-tx"><span>' + l.name + '</span><b class="' + cls + '">' + l.side + ' ' + SC.ui.money(l.amount) + '</b><small>สัปดาห์ ' + l.week + '</small></div>';
      }).join('') || '<div class="pf-empty">ยังไม่มีธุรกรรม</div>';
      main =
        '<div class="wa-p re-panel">' +
          '<div class="wp-title">PORTFOLIO OVERVIEW</div>' +
          '<div class="ov-stats re-stats">' +
            '<div class="ov-stat"><label>ทรัพย์ที่ถือ</label><b>' + owned.length + ' / ' + SC.properties.length + '</b></div>' +
            '<div class="ov-stat"><label>มูลค่ารวม</label><b>' + SC.ui.money(totVal) + '</b></div>' +
            '<div class="ov-stat"><label>ค่าเช่า/สัปดาห์</label><b class="up">+' + SC.ui.money(totRent) + '</b></div>' +
            '<div class="ov-stat"><label>ผลตอบแทน</label><b>' + (totVal > 0 ? yieldPct.toFixed(1) + '%/ปี' : '—') + '</b></div>' +
          '</div>' +
        '</div>' +
        '<div class="wa-p re-panel re-typesp">' +
          '<div class="wp-title">PROPERTY TYPES</div>' +
          '<div class="re-donutrow"><div class="re-donut"><canvas id="reDonut"></canvas></div>' +
            '<div class="pf-legend re-leg">' + legend + '</div></div>' +
        '</div>' +
        '<div class="wa-p re-panel re-txp">' +
          '<div class="wp-title">RECENT TRANSACTIONS <button class="re-viewall" data-rnav="hist">VIEW ALL ›</button></div>' +
          txRows +
        '</div>';
    }

    // ---- คอลัมน์ขวา: Top Earning + Market Trend ----
    var earners = (owned.length ? owned.slice().sort(function (x, y) { return y.rent - x.rent; })
      : SC.properties.slice().sort(function (x, y) {
          return (y.rent * 52 / SC.markets.propPrice(y.id)) - (x.rent * 52 / SC.markets.propPrice(x.id));
        })).slice(0, 5);
    var topRows = earners.map(function (p) {
      var px = SC.markets.propPrice(p.id);
      var yy = p.rent > 0 ? (p.rent * 52 / px * 100) : 0;
      var stars = '', nStar = Math.max(1, Math.min(5, Math.round(yy / 15)));
      for (var i = 0; i < 5; i++) stars += '<i class="' + (i < nStar ? 'on' : '') + '">★</i>';
      return '<div class="re-toprow"><span class="st-ico" style="background:' + p.color + '">' + p.icon + '</span>' +
        '<div class="re-topmid"><b>' + p.name + '</b><span class="re-stars">' + stars + '</span></div>' +
        '<div class="re-topval"><b class="up">' + (p.rent > 0 ? '+฿' + p.rent + '/สัปดาห์' : 'ที่ดิน') + '</b>' +
          '<small>' + (p.rent > 0 ? yy.toFixed(1) + '%/ปี' : 'เก็งกำไร') + '</small></div></div>';
    }).join('');
    var col3 =
      '<div class="wa-p re-panel re-topp">' +
        '<div class="wp-title">TOP EARNING PROPERTIES <small class="wp-sub">' + (owned.length ? 'ทรัพย์ของคุณ' : 'น่าซื้อสุดในตลาด') + '</small></div>' +
        topRows +
      '</div>' +
      '<div class="wa-p re-panel re-trendp">' +
        '<div class="wp-title">MARKET TREND</div>' +
        '<div class="re-idx"><b>' + idxSeries[L - 1].toFixed(1) + '</b> ' + this._pct(idxPct) +
          '<small>ดัชนีราคาอสังหารวมทั้งเมือง</small></div>' +
        '<div class="re-trend"><canvas id="reChart"></canvas></div>' +
      '</div>';

    // ---- ปุ่มลัดใหญ่แถวล่าง 4 ปุ่ม (ตามภาพตัวอย่าง) ----
    var acts = this.RE_ACTS.map(function (ac) {
      var on = (ac[0] === 'buy' && self._rtab === 'buy');
      return '<button class="re-act ' + ac[4] + (on ? ' active' : '') + '" data-ract="' + ac[0] + '">' +
        '<span class="re-aico">' + ac[1] + '</span>' +
        '<span class="re-atxt"><b>' + ac[2] + '</b><small>' + ac[3] + '</small></span></button>';
    }).join('');

    f.querySelector('.wa-body').innerHTML =
      '<div class="re-grid">' +
        '<div class="re-main">' + main + '</div>' +
        '<div class="re-col3">' + col3 + '</div>' +
        '<div class="re-actions">' + acts + '</div>' +
      '</div>';

    this._charts.push(function () {
      var c = f.querySelector('#reChart');
      if (c) self._lineChart(c, idxSeries, { fmt: function (v) { return v.toFixed(1); } });
      if (f.querySelector('#reDonut')) self._drawDonut('#reDonut', slices, totVal, { label: 'มูลค่าอสังหา' });
    });
    // นำทางมุมมองซ้าย (VIEW ALL / ปุ่มกลับ)
    this._bindAll('data-rnav', function (t) { self._rtab = t; self._renderRealEstate(); });
    // ปุ่มลัดแถวล่าง: BUY PROPERTY สลับรายการซื้อ ↔ ภาพรวม · อีก 3 ปุ่มเป็นระบบที่ยังไม่เปิด
    this._bindAll('data-ract', function (t) {
      if (t === 'buy') { self._rtab = (self._rtab === 'buy') ? 'over' : 'buy'; self._renderRealEstate(); }
      else if (t === 'auction') SC.ui.toast('🔨 โรงประมูล — เปิดให้บริการเร็วๆ นี้!', 'info');
      else if (t === 'market')  SC.ui.toast('🤝 ตลาดซื้อขายระหว่างผู้เล่น — กำลังพัฒนา', 'info');
      else if (t === 'upgrade') SC.ui.toast('⬆️ ระบบอัปเกรดอาคาร — กำลังพัฒนา', 'info');
    });
    this._bindAll('data-rbuy', function (id) { self._propTrade(id, 'buy'); });
    this._bindAll('data-rsell', function (id) { self._propTrade(id, 'sell'); });
    this._charts.forEach(function (fn) { fn(); });
  },

  _propTrade: function (id, side) {
    var r = SC.markets.tradeProp(id, side);
    if (!r.ok) { SC.ui.toast(r.msg, 'bad'); return; }
    SC.ui.toast(side === 'sell' ? 'ขายทรัพย์แล้ว (+' + SC.ui.money(r.gain) + ')' : 'ซื้อทรัพย์แล้ว (−' + SC.ui.money(r.cost) + ')', 'good');
    SC.ui.renderHUD(); this._renderRealEstate();
  },

  // ============================================================
  // 🚀 STARTUP HUB (ตึก startup) — บริหารธุรกิจ (greenhub.js)
  //   อาร์ตใหม่ 2026-07-15 (startup hub win new.png): กรอบเปล่า **ไม่มีแถบเมนูล่าง/กล่องสรุป**
  //   (user สั่งไม่เอาแถบเมนู) → หน้าเดียวจบ 3 คอลัมน์ตามตัวอย่าง start up hub win.png
  //   ปุ่ม GREEN INVEST เป็นอาร์ตในกรอบมุมซ้ายล่าง → วาง hotspot ทับ (วัดจากภาพ crop)
  // ============================================================
  _buildStartup: function () {
    var f = this._frame, self = this;
    SC.greenhub.ensure();
    f.innerHTML =
      '<button class="wa-x" data-wclose title="ปิด (Esc)"></button>' +
      '<div class="wa-body su-body"></div>' +
      '<button class="su-gihot" id="suGoGreen" title="ไปที่ Green Invest"></button>';
    this._bindClose();
    f.querySelector('#suGoGreen').onclick = function () { self.walkSwitch('green'); };
    this._renderStartup();
  },

  _suHud: function () {
    var g = SC.greenhub.ensure(), p = SC.state.player;
    var cash = '<div class="su-chip"><label>💰 เงินสด</label><b>' + SC.ui.money(p.cash) + '</b></div>';
    if (!g.biz) return cash + '<div class="su-chip"><label>🏢 ธุรกิจ</label><b>ยังไม่เริ่ม</b></div>';
    var idx = SC.greenhub.carbonIdx();
    return cash +
      '<div class="su-chip"><label>🌫️ คาร์บอน/หน่วย</label><b>' + idx.toFixed(0) + '%</b></div>' +
      '<div class="su-chip"><label>⭐ ชื่อเสียง</label><b>' + (g.rep >= 0 ? '+' : '') + g.rep + '</b></div>' +
      '<div class="su-chip"><label>👁️ สายตาสังคม</label><b>' + g.eyes + ' / 100</b></div>';
  },

  // การ์ดเลือกธุรกิจ (แสดงเมื่อยังไม่เริ่ม — user 2026-07-13)
  _bizPickerHtml: function () {
    var p = SC.state.player;
    var cards = SC.hubBusinesses.map(function (b) {
      var carbon = b.base.energy + b.base.material + b.base.waste + b.base.transport;
      var afford = p.cash >= b.startCost;
      return '<div class="su-pcard' + (afford ? '' : ' poor') + '">' +
        '<span class="su-bigico">' + b.icon + '</span>' +
        '<b class="su-pname">' + b.name + '</b><small class="su-pdesc">' + b.desc + '</small>' +
        '<div class="su-pstats">' +
          '<div><label>ทุนเปิด</label><b>' + SC.ui.money(b.startCost) + '</b></div>' +
          '<div><label>กำไร/' + b.unit + '</label><b>฿' + b.profitPerUnit + '</b></div>' +
          '<div><label>ลูกค้า/เทิร์น</label><b>' + b.custBase + '</b></div>' +
          '<div><label>คาร์บอนเริ่ม</label><b>' + carbon + '%</b></div>' +
        '</div>' +
        '<button class="wf-btn su-pbuy" data-sbiz="' + b.id + '"' + (afford ? '' : ' disabled') + '>' +
          (afford ? 'เปิดร้าน — ' + SC.ui.money(b.startCost) : 'เงินไม่พอ') + '</button>' +
      '</div>';
    }).join('');
    return '<div class="su-pick">' +
      '<div class="wp-title">🚀 เลือกธุรกิจเพื่อเริ่มต้น <small class="wp-sub">หักทุนตั้งต้นจากเงินสดหลัก · เลือกได้ครั้งเดียว · เงินสด ' + SC.ui.money(p.cash) + '</small></div>' +
      '<div class="su-pickgrid">' + cards + '</div>' +
    '</div>';
  },

  _renderStartup: function () {
    var f = this._frame, self = this, g = SC.greenhub.ensure();
    this._charts = [];
    var body = f.querySelector('.su-body');

    if (!g.biz) { // ยังไม่ได้เลือกธุรกิจ → โชว์การ์ดเลือกธุรกิจ
      body.innerHTML = this._bizPickerHtml();
      this._bindAll('data-sbiz', function (id) {
        var r = SC.greenhub.startBusiness(id);
        SC.ui.toast(r.ok ? '🎉 เปิด' + r.biz.name + 'แล้ว! ลงทุน ' + SC.ui.money(r.biz.startCost) : r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) self._renderStartup();
      });
      return;
    }
    var idx = SC.greenhub.carbonIdx();

    {
      // คอลัมน์ 1: ธุรกิจของฉัน + การเงิน
      var rp = g.lastReport;
      var fp = SC.greenhub.footprint();
      var fpSlices = [
        { label: 'พลังงาน', value: fp.energy, color: '#c98500' },
        { label: 'วัสดุ', value: fp.material, color: '#3987e5' },
        { label: 'ของเสีย', value: fp.waste, color: '#199e70' },
        { label: 'ขนส่ง', value: fp.transport, color: '#d95926' },
      ];
      var xpNeed = g.level * 100;
      var col1 =
        '<div class="wa-p su-col">' +
          '<div class="wp-title">ธุรกิจของฉัน</div>' +
          '<div class="su-biz"><span class="su-bigico">' + g.icon + '</span><div><b>' + g.name + '</b>' +
            '<small>เลเวลธุรกิจ ' + g.level + ' · XP ' + g.xp + '/' + xpNeed + '</small>' +
            '<div class="gv-bar su-xp"><i style="width:' + Math.min(100, g.xp / xpNeed * 100).toFixed(0) + '%"></i></div></div></div>' +
          '<div class="su-grid">' +
            '<div><label>กำไร/' + g.unit + '</label><b>฿' + SC.greenhub.curProfitPerUnit() + '</b></div>' +
            '<div><label>คาร์บอนต่อหน่วย</label><b>' + idx.toFixed(0) + '%</b></div>' +
            '<div><label>ฐานลูกค้า/เทิร์น</label><b>' + g.custBase.toLocaleString('en-US') + '</b></div>' +
            '<div><label>ยอดขายคาด</label><b>' + Math.round(SC.greenhub.expectedSales()).toLocaleString('en-US') + ' ' + g.unit + '</b></div>' +
            '<div><label>เพดานผลิต</label><b>' + SC.greenhub.curCapacity().toLocaleString('en-US') + '</b></div>' +
            '<div><label>ค่าใช้จ่าย/เทิร์น</label><b>' + SC.ui.money(SC.greenhub.curFixed()) + '</b></div>' +
          '</div>' +
          '<div class="wp-title su-t2">สัดส่วน Footprint</div>' +
          '<div class="su-donutrow"><div class="su-donut"><canvas id="suDonut"></canvas></div>' +
            '<div class="pf-legend su-leg">' + fpSlices.map(function (sl) {
              return '<div class="pf-leg"><i style="background:' + sl.color + '"></i><span>' + sl.label + '</span><b>' + sl.value.toFixed(0) + '</b></div>';
            }).join('') + '</div></div>' +
          // การเงิน (เดิมเป็นแท็บในแถบเมนูล่างที่ถูกถอด) — ปิดท้ายคอลัมน์
          '<div class="wp-title su-t2">รายงานเดือนล่าสุด <small class="wp-sub">เดือนที่ ' + g.turn + '</small></div>' +
          (rp ?
            '<div class="su-grid su-fingrid">' +
              '<div><label>ยอดขาย</label><b>' + rp.sales.toLocaleString('en-US') + ' ' + g.unit + '</b></div>' +
              '<div><label>รายรับ</label><b class="up">+' + SC.ui.money(rp.income) + '</b></div>' +
              '<div><label>ค่าใช้จ่าย</label><b class="down">−' + SC.ui.money(rp.fixed) + '</b></div>' +
              '<div><label>กำไรสุทธิ</label><b class="' + (rp.profit >= 0 ? 'up' : 'down') + '">' +
                (rp.profit >= 0 ? '+' : '') + SC.ui.money(rp.profit) + '</b></div>' +
            '</div>' :
            '<p class="pf-empty su-empty">ยังไม่ปิดเดือนแรก — รายงานจะขึ้นหลังจบสัปดาห์เกม</p>') +
        '</div>';

      // คอลัมน์ 2: อัปเกรดธุรกิจ
      var upCards = SC.hubUpgrades.map(function (u) {
        var own = g.upgrades[u.id];
        var price = u.price > 0 ? SC.ui.money(u.price) : SC.ui.money(u.perTurn) + '/เทิร์น';
        return '<div class="su-card' + (own ? ' own' : '') + '">' +
          '<span class="su-cico">' + u.icon + '</span>' +
          '<div class="su-cmid"><b>' + u.name + '</b><small>' + u.effect + '</small></div>' +
          (own ? '<span class="re-own">✓ แล้ว</span>' :
            '<div class="su-cbtn"><small>' + price + '</small><button class="buy2" data-sup="' + u.id + '">อัปเกรด</button></div>') +
        '</div>';
      }).join('');
      var col2 =
        '<div class="wa-p su-col">' +
          '<div class="wp-title">อัปเกรดธุรกิจ <span class="su-ap">Action Point <b>' + g.ap + ' / ' + g.apMax + '</b></span></div>' +
          '<small class="wa-note">ลงทุนเพื่อเติบโตทางธุรกิจ — ใช้ 1 AP ต่อครั้ง (เต็มใหม่ทุกเทิร์น)</small>' +
          '<div class="su-list">' + upCards + '</div>' +
        '</div>';

      // คอลัมน์ 3: ตลาด
      var mkRows = SC.greenhub.markets().map(function (mk) {
        return '<div class="su-card su-mk' + (mk.open ? ' openmk' : '') + '">' +
          '<span class="su-cico">' + mk.icon + '</span>' +
          '<div class="su-cmid"><b>' + mk.name + '</b>' +
            (mk.need ? '<small>ต้องมีใบ: ' + mk.need.name + ' (Lv.' + mk.need.lv + ')</small>' : '<small>เปิดฟรีตั้งแต่ต้นเกม</small>') +
            '<small>สายตาสังคม ' + mk.eyes + ' · ' + mk.effect + '</small></div>' +
          (mk.open ? '<span class="re-own">✓ เปิดแล้ว</span>' : '<span class="su-lock">🔒 ล็อก</span>') +
        '</div>';
      }).join('');
      // คอลัมน์ 3: ตลาด + ข่าวสารของร้าน
      //   (เดิมการเงิน/ข่าวสารเป็นแท็บในแถบเมนูล่าง — แถบเมนูถูกถอด 2026-07-15 →
      //    การเงินย้ายไปท้ายคอลัมน์ 1 ที่มีที่ว่าง · ข่าวมาต่อท้ายคอลัมน์นี้)
      var feed = g.news.length
        ? '<div class="su-feed">' + g.news.slice(0, 3).map(function (n) {
            return '<div class="su-news"><span>' + n.icon + '</span><div><b>เดือน ' + n.turn + '</b><small>' + n.text + '</small></div></div>';
          }).join('') + '</div>'
        : '<p class="pf-empty su-empty">ยังไม่มีเหตุการณ์</p>';
      var col3 =
        '<div class="wa-p su-col">' +
          '<div class="wp-title">ตลาด <small class="wp-sub">ปลดล็อกด้วยใบรับรองจาก Green Invest</small></div>' +
          '<div class="su-list su-mklist">' + mkRows + '</div>' +
          '<div class="wp-title su-t2">ข่าวสารของร้าน</div>' + feed +
        '</div>';

      body.innerHTML = '<div class="su-chips">' + this._suHud() + '</div>' +
        '<div class="su-cols">' + col1 + col2 + col3 + '</div>';
      this._charts.push(function () {
        self._drawDonut('#suDonut', fpSlices, fp.energy + fp.material + fp.waste + fp.transport,
          { label: 'POINTS', fmt: function (v) { return v.toFixed(0); } });
      });
      this._bindAll('data-sup', function (id) {
        var r = SC.greenhub.buyUpgrade(id);
        SC.ui.toast(r.ok ? '🔧 อัปเกรดสำเร็จ' : r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) self._renderStartup();
      });
    }

    this._charts.forEach(function (fn) { fn(); });
  },

  // ============================================================
  // ♻️ GREEN INVEST (ตึก green) — แคตตาล็อกกรีน + ใบรับรอง (greenhub.js)
  //   อาร์ตใหม่ 2026-07-15 (green invest win new.png): กรอบเปล่า **ไม่มีแท็บ OVERVIEW/MY PORTFOLIO**
  //   (user สั่งไม่เอาแถบเมนู) → หน้าเดียวจบ 3 คอลัมน์ตามตัวอย่าง green invest win.png
  //   ของที่ติดตั้งแล้วดูได้จากสถานะ "✓ ติดตั้ง" ในแคตตาล็อก (ไม่ต้องมีแท็บพอร์ตแยก)
  // ============================================================
  _buildGreen: function () {
    var f = this._frame;
    SC.greenhub.ensure();
    f.innerHTML =
      '<button class="wa-x" data-wclose title="ปิด (Esc)"></button>' +
      '<div class="wa-body gi-body"></div>';
    this._bindClose();
    this._renderGreen();
  },

  _renderGreen: function () {
    var f = this._frame, self = this, g = SC.greenhub.ensure();
    this._charts = [];
    var idx = SC.greenhub.carbonIdx();
    var body = f.querySelector('.gi-body');

    if (!g.biz) { // ยังไม่เริ่มธุรกิจ → ต้องไปเปิดที่ Startup ก่อน
      body.innerHTML =
        '<div class="wa-p gi-noboot">' +
          '<div class="wp-title">🌱 ยังไม่ได้เริ่มธุรกิจ</div>' +
          '<p class="wa-note">Green Invest คือการลงทุนความยั่งยืนให้ “ธุรกิจ” ของคุณ — ไปเปิดธุรกิจที่ Startup Hub ก่อน แล้วค่อยกลับมาลงทุนกรีนเพื่อลดคาร์บอนและปลดล็อกตลาดใหม่</p>' +
          '<button class="wf-btn" id="giGoStart">🏢 ไปที่ STARTUP HUB<small>เดินไปเลือกธุรกิจ</small></button>' +
        '</div>';
      var gs = f.querySelector('#giGoStart');
      if (gs) gs.onclick = function () { self.walkSwitch('startup'); };
      return;
    }

    {
      var fp = SC.greenhub.footprint();
      var fpTotal = fp.energy + fp.material + fp.waste + fp.transport;
      var fpSlices = [
        { label: '⚡ พลังงาน', value: fp.energy, color: '#c98500' },
        { label: '📦 วัสดุ', value: fp.material, color: '#3987e5' },
        { label: '♻️ ของเสีย', value: fp.waste, color: '#199e70' },
        { label: '🚚 ขนส่ง', value: fp.transport, color: '#d95926' },
      ];
      var nc = SC.greenhub.nextCert();

      // คอลัมน์ 1: โปรไฟล์ธุรกิจ + มิเตอร์คาร์บอน (โปรไฟล์เดิมลอยบนอาร์ตเก่า — อาร์ตใหม่ไม่มีโซนนั้น)
      var bizName = g.biz ? SC.hubBusinesses.find(function (x) { return x.id === g.biz; }).name : '';
      var col1 =
        '<div class="wa-p gi-col gi-c1">' +
          '<div class="gi-prof"><span class="su-bigico">' + g.icon + '</span>' +
            '<div><label>COMPANY PROFILE</label><b>' + (g.name || 'ยังไม่เริ่มธุรกิจ') + '</b>' +
            '<small>Lv.' + g.level + (bizName ? ' · ' + bizName : '') + '</small></div></div>' +
          '<div class="wp-title su-t2">CARBON INTENSITY <small class="wp-sub">ต่อหน่วยสินค้า</small></div>' +
          '<b class="wa-big gi-idx">' + idx.toFixed(0) + '%</b>' +
          '<div class="wa-sub">↓ ' + (100 - idx).toFixed(0) + '% จากวันเปิดร้าน (100%)</div>' +
          '<div class="gi-meter"><i style="width:' + Math.min(100, idx).toFixed(0) + '%"></i>' +
            (nc ? '<em style="left:' + nc.cert.idx + '%" title="เป้าใบถัดไป"></em>' : '') + '</div>' +
          (nc ? '<div class="wa-sub">🎯 เป้าใบถัดไป: ≤ ' + nc.cert.idx + '%</div>' : '<div class="wa-sub">🏆 ได้ใบสูงสุดแล้ว</div>') +
          '<div class="wp-title su-t2">FOOTPRINT BREAKDOWN</div>' +
          '<div class="su-donutrow"><div class="su-donut"><canvas id="giDonut"></canvas></div>' +
            '<div class="pf-legend su-leg">' + fpSlices.map(function (sl) {
              return '<div class="pf-leg"><i style="background:' + sl.color + '"></i><span>' + sl.label + '</span><b>' + sl.value.toFixed(0) + '</b></div>';
            }).join('') + '</div></div>' +
          '<div class="gi-tip">💡 TIP: ลงทุนในหมวดที่มีแต้มสูงสุดก่อน จะลดคาร์บอนรวมได้มากที่สุด (ลดซ้อนกันแบบคูณ)</div>' +
        '</div>';

      // คอลัมน์ 2: แคตตาล็อกลงทุนกรีน
      var cats = [['all', 'ทั้งหมด'], ['energy', '⚡'], ['material', '📦'], ['waste', '♻️'], ['transport', '🚚'], ['people', '👥']];
      var chips = cats.map(function (c) {
        return '<button class="gi-chip' + (self._gfilter === c[0] ? ' active' : '') + '" data-gfil="' + c[0] + '">' + c[1] + '</button>';
      }).join('');
      var items = SC.greenCatalog.filter(function (it) { return self._gfilter === 'all' || it.cat === self._gfilter; });
      var cards = items.map(function (it) {
        var own = g.items[it.id];
        var needOk = !it.needs || g.items[it.needs];
        var exclBad = it.excludes && g.items[it.excludes];
        var price = it.price > 0 ? SC.ui.money(it.price) : (it.perTurn ? SC.ui.money(it.perTurn) + '/เทิร์น' : 'ฟรี');
        var eff = it.reduce ? '<b class="up">−' + Math.round(it.reduce * 100) + '%</b> <small>' + SC.greenhub.catName[it.cat] + '</small>' :
          (it.lockEnergy ? '<b class="up">ล็อกพลังงาน→5</b>' : '<b class="up">เงื่อนไขใบ</b>');
        return '<div class="su-card gi-item' + (own ? ' own' : '') + '">' +
          '<span class="su-cico">' + it.icon + '</span>' +
          '<div class="su-cmid"><b>' + it.name + ' <span class="gi-tier">T' + it.tier + '</span></b>' +
            '<small>' + it.benefit + '</small></div>' +
          '<div class="gi-eff">' + eff + '</div>' +
          (own ? '<span class="re-own">✓ ติดตั้ง</span>' :
            (exclBad ? '<span class="su-lock">ซ้ำซ้อน</span>' :
              '<div class="su-cbtn"><small>' + price + '</small><button class="buy2" data-gbuy="' + it.id + '"' + (needOk ? '' : ' disabled') + '>' +
                (needOk ? 'BUY' : '🔒') + '</button></div>')) +
        '</div>';
      }).join('');
      var col2 =
        '<div class="wa-p gi-col gi-c2">' +
          '<div class="wp-title">GREEN INVESTMENTS <span class="su-ap">AP <b>' + g.ap + '/' + g.apMax + '</b></span></div>' +
          '<div class="gi-chips">' + chips + '</div>' +
          '<div class="su-list gi-list">' + cards + '</div>' +
        '</div>';

      // คอลัมน์ 3: ใบรับรอง + ความเสี่ยงข่าวลือ
      var ladder = '<div class="su-card su-mk openmk"><span class="su-cico">🧺</span>' +
        '<div class="su-cmid"><b>ตลาดชุมชน</b><small>ไม่ต้องมีใบ</small></div><span class="re-own">✓</span></div>';
      SC.hubCerts.forEach(function (c) {
        var done = g.certLv >= c.lv;
        var isNext = nc && nc.cert.lv === c.lv;
        ladder += '<div class="su-card su-mk' + (done ? ' openmk' : '') + (isNext ? ' gi-next' : '') + '">' +
          '<span class="su-cico">' + c.icon + '</span>' +
          '<div class="su-cmid"><b>' + c.market + '</b><small>' + c.name + ' · ดัชนี ≤ ' + c.idx + '%</small>' +
            (isNext ? '<div class="gi-meter gi-mini"><i style="width:' + Math.min(100, c.idx / idx * 100).toFixed(0) + '%"></i></div>' : '') +
          '</div>' +
          (done ? '<span class="re-own">✓</span>' : (isNext ? '' : '<span class="su-lock">🔒</span>')) +
        '</div>';
        if (isNext) {
          ladder += '<div class="gi-checks">' + nc.checks.map(function (ck) {
            return '<div class="gi-check ' + (ck.pass ? 'ok' : 'no') + '">' + (ck.pass ? '✓' : '✗') + ' ' + ck.label + '</div>';
          }).join('') +
          '<button class="wf-btn gi-apply" data-gcert="1"' + (nc.ok ? '' : ' disabled') + '>สมัครใบรับรอง — ' + SC.ui.money(nc.cert.fee) + '</button></div>';
        }
      });
      var drama = Math.round(SC.greenhub.dramaChance() * 100);
      var dLv = drama < 8 ? 'ต่ำ' : drama < 20 ? 'ปานกลาง' : 'สูง';
      var col3 =
        '<div class="wa-p gi-col gi-c3">' +
          '<div class="wp-title">CONSENT CERTIFICATES <small class="wp-sub">ใบรับรองที่ปลดล็อกตลาดใหม่</small></div>' +
          '<div class="su-list gi-ladder">' + ladder + '</div>' +
          '<div class="gi-risk"><label>👁️ RUMOR RISK (ความเสี่ยงดราม่า)</label>' +
            '<b>' + drama + ' / 100</b><small>ระดับ: ' + dLv + ' — ยิ่งดัง ยิ่งต้องกรีน</small></div>' +
        '</div>';

      body.innerHTML =
        '<div class="gi-cols">' + col1 + col2 + col3 + '</div>' +
        '<div class="gi-foot">' +
          '<div class="su-chip"><label>💰 เงินสด</label><b>' + SC.ui.money(SC.state.player.cash) + '</b></div>' +
          '<div class="su-chip"><label>💸 ค่าใช้จ่าย/เทิร์น</label><b>' + SC.ui.money(SC.greenhub.curFixed()) + '</b></div>' +
          '<div class="su-chip"><label>🌱 ผลประโยชน์กรีน/เทิร์น</label><b class="up">+' + SC.ui.money(SC.greenhub.greenBenefit()) + '</b></div>' +
          '<button class="wf-btn gi-gohub" id="giGoHub">🏢 GO TO STARTUP HUB<small>กลับไปบริหารธุรกิจ</small></button>' +
        '</div>';

      this._charts.push(function () {
        self._drawDonut('#giDonut', fpSlices, fpTotal, { label: 'POINTS', fmt: function (v) { return v.toFixed(0); } });
      });
      f.querySelector('#giGoHub').onclick = function () { self.walkSwitch('startup'); };
      this._bindAll('data-gfil', function (t) { self._gfilter = t; self._renderGreen(); });
      this._bindAll('data-gbuy', function (id) {
        var r = SC.greenhub.buyItem(id);
        SC.ui.toast(r.ok ? '🌱 ติดตั้งแล้ว — ดัชนีเหลือ ' + SC.greenhub.carbonIdx().toFixed(1) + '%' : r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) self._renderGreen();
      });
      this._bindAll('data-gcert', function () {
        var r = SC.greenhub.applyCert();
        SC.ui.toast(r.ok ? '🏅 ผ่าน audit! ปลดล็อก' + r.cert.market : r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) self._renderGreen();
      });
    }
    this._charts.forEach(function (fn) { fn(); });
  },
};
