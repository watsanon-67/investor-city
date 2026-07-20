// ============================================================
// designer.js — หน้า "ออกแบบตัวละครของคุณ" (ธีมเดียวกับ assets/character1.png)
//   ผู้เล่นเลือกสี หมวก/เสื้อ/กางเกง/ผิว/ผม + ตั้งชื่อ ก่อนเริ่มเกม (เก็บ localStorage)
//   บอทแต่ละตัวได้ดีไซน์สุ่มไม่ซ้ำกัน → ทุกคนบนแมปหน้าตาเป็นของตัวเอง
//   การย้อมสีจริงอยู่ที่ SC.sprite.makeVariant (sprite.js) — ไฟล์นี้คือ UI + จัดเก็บ
// ============================================================
SC.designer = {
  // จานสีของแต่ละส่วน (โทนคุมให้เข้ากับสไตล์การ์ตูนของชีทเดิม)
  parts: [
    { key: 'cap',    label: '🧢 หมวก',   colors: ['#50a080', '#d05a5a', '#e0993c', '#4d7fd0', '#8f5fd0', '#e86fa8', '#4a4f5c', '#ececec'] },
    { key: 'jacket', label: '🧥 เสื้อ',   colors: ['#306070', '#2a3f66', '#7a3030', '#3c7a4a', '#6b4fa0', '#a0662c', '#50535e', '#c05a84'] },
    { key: 'pants',  label: '👖 กางเกง', colors: ['#405050', '#2e3a52', '#4a3527', '#3a3f47', '#5a2f2f', '#365040', '#7d6b4f', '#8a8f99'] },
    { key: 'skin',   label: '🖐️ สีผิว',  colors: ['#f6ccb0', '#f0b0a0', '#e0a080', '#c98a62', '#a06a45', '#7a4f32'] },
    { key: 'hair',   label: '💇 สีผม',   colors: ['#605040', '#2e2620', '#8a5a2e', '#c8973f', '#b04a2e', '#707784'] },
  ],
  // ค่าเริ่มต้น = สีของชีทต้นฉบับ (ย้อมด้วยค่านี้ ≈ หน้าตาเดิม)
  DEFAULT: { name: '', cap: '#50a080', jacket: '#306070', pants: '#405050', skin: '#f0b0a0', hair: '#605040' },

  // ---------- จัดเก็บดีไซน์ผู้เล่น ----------
  get: function () {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem('sc_design') || '{}'); } catch (e) {}
    var out = {}, DF = this.DEFAULT;
    for (var k in DF) out[k] = saved[k] != null ? saved[k] : DF[k];
    return out;
  },
  save: function (d) {
    try { localStorage.setItem('sc_design', JSON.stringify(d)); } catch (e) {}
  },
  key: function (d) { return [d.cap, d.jacket, d.pants, d.skin, d.hair].join('|'); },

  // สุ่มดีไซน์ (ให้บอท / ปุ่มสุ่ม) — เลี่ยง key ที่ใช้ไปแล้วเพื่อไม่ให้หน้าตาซ้ำ
  randomDesign: function (avoidKeys) {
    avoidKeys = avoidKeys || [];
    var d = null;
    for (var tries = 0; tries < 24; tries++) {
      d = { name: '' };
      this.parts.forEach(function (p) {
        d[p.key] = p.colors[Math.floor(Math.random() * p.colors.length)];
      });
      if (avoidKeys.indexOf(this.key(d)) < 0) break;
    }
    return d;
  },

  // ---------- พรีวิวตัวละครบน canvas (เดินวน 4 ทิศ + เงาใต้เท้า) ----------
  //   getDesign = ฟังก์ชันคืนดีไซน์ปัจจุบัน (อ่านสดทุกเฟรม → เปลี่ยนสีเห็นผลทันที)
  //   หยุดเองเมื่อ canvas หลุดจาก DOM (เปลี่ยนหน้า) — คืนฟังก์ชัน stop เผื่ออยากหยุดเอง
  preview: function (canvas, getDesign, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var dirs = ['down', 'left', 'up', 'right'];
    var state = { stopped: false, t: 0, last: performance.now() };

    function loop(now) {
      if (state.stopped || !canvas.isConnected) return;
      var dt = Math.min(0.05, (now - state.last) / 1000);
      state.last = now; state.t += dt;

      var W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      var h = H * 0.78, x = W / 2, feetY = H * 0.92;
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.ellipse(x, feetY + h * 0.02, h * 0.22, h * 0.055, 0, 0, Math.PI * 2); ctx.fill();

      if (SC.sprite.ready) {
        var sheet = SC.sprite.makeVariant(getDesign()); // cache ตาม key → เร็ว
        var dir = opts.dir || dirs[Math.floor(state.t / 1.6) % dirs.length];
        var frame = opts.still ? 0 : Math.floor(state.t * SC.sprite.fps);
        SC.sprite.draw(ctx, x, feetY, dir, frame, h, sheet);
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    return function () { state.stopped = true; };
  },

  // กันชื่อผู้เล่นพัง HTML (ชื่อถูกแทรกใน innerHTML หลายที่)
  _cleanName: function (v) {
    return String(v || '').replace(/[<>&"']/g, '').trim().slice(0, 12);
  },

  // ---------- หน้าจอออกแบบ ----------
  render: function (onBack) {
    var self = this;
    var d = this.get();
    SC.ui.renderHUD();

    var rows = this.parts.map(function (p) {
      var sw = p.colors.map(function (c) {
        return '<button class="swatch" data-part="' + p.key + '" data-color="' + c + '" style="background:' + c + '" title="' + c + '"></button>';
      }).join('');
      return '<div class="design-row"><label>' + p.label + '</label><div class="swatches">' + sw + '</div></div>';
    }).join('');

    SC.ui.screen().innerHTML =
      '<div class="designer">' +
        '<h2>🎨 ออกแบบตัวละครของคุณ</h2>' +
        '<p class="muted">เลือกสีแต่ละส่วนตามใจ — สไตล์เดียวกับตัวละครต้นแบบ · บอทแต่ละตัวก็มีชุดของตัวเอง</p>' +
        '<div class="designer-layout">' +
          '<div class="designer-preview"><canvas id="dzCanvas" width="260" height="320"></canvas></div>' +
          '<div class="designer-controls">' +
            '<div class="design-row"><label>📛 ชื่อ</label>' +
              '<input id="dzName" class="dz-name" maxlength="12" placeholder="ชื่อในเกม (ไม่ใส่ = ใช้ชื่ออาชีพ)" value="' + this._cleanName(d.name) + '"></div>' +
            rows +
            '<div class="design-actions">' +
              '<button class="btn btn-sm" id="dzRandom">🎲 สุ่มชุด</button>' +
              '<button class="btn btn-sm" id="dzReset">↩️ ชุดต้นแบบ</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="phase-foot"><button class="btn btn-lg btn-go" id="dzDone">✅ เสร็จแล้ว — บันทึก</button></div>' +
      '</div>';

    function refreshSwatches() {
      Array.prototype.forEach.call(SC.ui.screen().querySelectorAll('.swatch'), function (btn) {
        var on = d[btn.getAttribute('data-part')] === btn.getAttribute('data-color');
        btn.classList.toggle('active', on);
      });
    }
    refreshSwatches();

    Array.prototype.forEach.call(SC.ui.screen().querySelectorAll('.swatch'), function (btn) {
      btn.onclick = function () {
        d[btn.getAttribute('data-part')] = btn.getAttribute('data-color');
        self.save(d); refreshSwatches();
      };
    });
    SC.ui.el('dzName').oninput = function () { d.name = self._cleanName(this.value); self.save(d); };
    SC.ui.el('dzRandom').onclick = function () {
      var r = self.randomDesign([self.key(d)]);
      self.parts.forEach(function (p) { d[p.key] = r[p.key]; });
      self.save(d); refreshSwatches();
    };
    SC.ui.el('dzReset').onclick = function () {
      self.parts.forEach(function (p) { d[p.key] = self.DEFAULT[p.key]; });
      self.save(d); refreshSwatches();
    };
    SC.ui.el('dzDone').onclick = function () { self.save(d); onBack(); };

    SC.sprite.load().then(function () {
      var cvs = SC.ui.el('dzCanvas');
      if (!cvs || !cvs.isConnected) return;
      if (!SC.sprite.ready) {
        var ctx = cvs.getContext('2d');
        ctx.fillStyle = '#8a96ad'; ctx.font = '13px "Segoe UI"'; ctx.textAlign = 'center';
        ctx.fillText('โหลด assets/character1.png ไม่สำเร็จ', cvs.width / 2, cvs.height / 2);
        return;
      }
      self.preview(cvs, function () { return d; });
    });
  },
};
