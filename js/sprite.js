// ============================================================
// sprite.js — สไปรต์เดินของตัวละคร (assets/character1.png)
//   ชีท 6 คอลัมน์ (เฟรมเดิน) × 4 แถว (ทิศทาง: ลง/ขึ้น/ซ้าย/ขวา)
//   โหลดครั้งเดียว ใช้ร่วมกันทุกตัวละคร (map.js วาด, world2d.js ขยับเฟรม)
// ============================================================
window.SC = window.SC || {};

SC.sprite = {
  src: 'assets/character1.png',
  cols: 6, rows: 4,
  fps: 9,                       // ความเร็วสลับเฟรมตอนเดิน (เฟรม/วินาที)
  dirRow: { down: 0, up: 1, left: 2, right: 3 },

  img: null, ready: false, fw: 0, fh: 0,

  load: function () {
    var self = this;
    if (this._p) return this._p;
    this._p = new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        self.img = img;
        self.fw = img.naturalWidth / self.cols;
        self.fh = img.naturalHeight / self.rows;
        self.ready = true;
        resolve();
      };
      img.onerror = function () { self.ready = false; resolve(); }; // ไม่มีรูป → ผู้เรียกใช้ fallback เอง
      img.src = self.src;
    });
    return this._p;
  },

  // วาดตัวละครหันทิศ dir เฟรมที่ frame (index ใดๆ, จะ wrap เอง) สูง h px · ยืนเท้าอยู่ที่ (x, feetY)
  //   sheet (optional) = ชีทย้อมสีจาก makeVariant — ไม่ส่ง = ใช้ชีทต้นฉบับ
  draw: function (ctx, x, feetY, dir, frame, h, sheet) {
    if (!this.ready) return false;
    var row = this.dirRow.hasOwnProperty(dir) ? this.dirRow[dir] : 0;
    var col = ((frame % this.cols) + this.cols) % this.cols;
    var scale = h / this.fh, w = this.fw * scale;
    ctx.drawImage(sheet || this.img, col * this.fw, row * this.fh, this.fw, this.fh, x - w / 2, feetY - h, w, h);
    return true;
  },

  // ============================================================
  // ย้อมสีชีทตามดีไซน์ (designer.js) — จำแนกพิกเซลเป็นโซน แล้วเปลี่ยน hue/sat
  //   โดยคงเฉดแสง-เงา (lightness offset) ไว้ → ได้สไตล์เดียวกับชีทต้นฉบับเป๊ะ
  //   โซนอิงจากสีจริงใน character1.png:
  //     หมวก = เขียวอิ่ม (hue 125-183) · เสื้อ = ฟ้าน้ำเงินอิ่ม (183-255)
  //     ผิว = ส้มอ่อนสว่าง · ผม = น้ำตาล (เฉพาะครึ่งบนเฟรม — ครึ่งล่างคือรองเท้า ไม่แตะ)
  //     กางเกง = เทาอมฟ้า sat ต่ำ ครึ่งล่างเฟรม · เส้นขอบดำ/เสื้อเชิ้ตขาว ไม่แตะ
  // ============================================================
  _variants: {},

  makeVariant: function (design) {
    if (!this.ready || !design || this._tainted) return null;
    var key = [design.cap, design.jacket, design.pants, design.skin, design.hair].join('|');
    if (this._variants[key]) return this._variants[key];

    var cv = document.createElement('canvas');
    cv.width = this.img.naturalWidth; cv.height = this.img.naturalHeight;
    var cx = cv.getContext('2d');
    cx.drawImage(this.img, 0, 0);
    var im;
    try {
      im = cx.getImageData(0, 0, cv.width, cv.height);
    } catch (e) {
      // เปิดผ่าน file:// → canvas โดน taint อ่านพิกเซลไม่ได้ → ใช้ชีทต้นฉบับ (ไม่ย้อมสี)
      this._tainted = true;
      return null;
    }
    var d = im.data;
    var fh = cv.height / this.rows, W = cv.width;

    // สีเป้าหมายแต่ละโซน + lightness ฐานของโซนเดิม (วัดจากสีหลักในชีทต้นฉบับ)
    var T = {
      cap:    this._prepTarget(design.cap,    0.470),
      jacket: this._prepTarget(design.jacket, 0.314),
      pants:  this._prepTarget(design.pants,  0.282),
      skin:   this._prepTarget(design.skin,   0.784),
      hair:   this._prepTarget(design.hair,   0.314),
    };

    for (var i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 20) continue;                       // โปร่งใส
      var hsl = this._toHsl(d[i], d[i + 1], d[i + 2]);
      var h = hsl[0], s = hsl[1], l = hsl[2];
      if (l < 0.09 || l > 0.93) continue;                // เส้นขอบดำ / ขาว (เสื้อเชิ้ต, ตา)

      var y = ((i / 4) / W) | 0, yf = (y % fh) / fh;     // ตำแหน่งแนวตั้งในเฟรม (0=หัว 1=เท้า)
      var t = null;
      if (h >= 125 && h <= 183 && s >= 0.15) t = T.cap;
      else if (h > 183 && h <= 255 && s >= 0.13) {
        // ฟ้าอิ่ม = เสื้อ · ฟ้าหม่น (sat ต่ำ) ช่วงขา = กางเกง (กันจุดสีเสื้อเปื้อนขา)
        t = (yf >= 0.52 && s < 0.27) ? T.pants : T.jacket;
      }
      else if ((h < 55 || h >= 330) && s >= 0.22 && l >= 0.45) t = T.skin;
      else if ((h < 55 || h >= 330) && s >= 0.38 && l >= 0.36 && yf < 0.62) t = T.skin; // เงาผิวโทนเข้ม (หน้า/มือ)
      else if ((h < 55 || h >= 330) && s >= 0.08 && l < 0.45) { if (yf < 0.55) t = T.hair; } // ล่าง = รองเท้า คงไว้
      else if (s <= 0.14 && l >= 0.13 && l <= 0.58 && yf >= 0.5) t = T.pants;
      if (!t) continue;

      var nl = Math.max(0.04, Math.min(0.97, t.l + (l - t.l0))); // คงเฉดแสง-เงาเดิม
      var rgb = this._toRgb(t.h, t.s, nl);
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
    }
    cx.putImageData(im, 0, 0);
    this._variants[key] = cv;
    return cv;
  },

  _prepTarget: function (hex, baseL) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    var r = m ? parseInt(m[1], 16) : 128, g = m ? parseInt(m[2], 16) : 128, b = m ? parseInt(m[3], 16) : 128;
    var hsl = this._toHsl(r, g, b);
    return { h: hsl[0], s: hsl[1], l: hsl[2], l0: baseL };
  },

  _toHsl: function (r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2, h = 0, s = 0;
    if (max !== min) {
      var dd = max - min;
      s = l > 0.5 ? dd / (2 - max - min) : dd / (max + min);
      if (max === r) h = ((g - b) / dd + (g < b ? 6 : 0)) * 60;
      else if (max === g) h = ((b - r) / dd + 2) * 60;
      else h = ((r - g) / dd + 4) * 60;
    }
    return [h, s, l];
  },

  _toRgb: function (h, s, l) {
    h = ((h % 360) + 360) % 360;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs((h / 60) % 2 - 1));
    var m = l - c / 2, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  },
};
