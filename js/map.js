// ============================================================
// map.js — แมปเมือง "Investor City" ใช้รูป assets/newestmap.png เป็นเมืองเต็มจอ (แมปโล่ง — สไปรต์ตึกคืออาคารทั้งหมด)
//   • ตึก 10 หลังเป็น asset โปร่งใส (assets/tower/cut/*.png — สร้างด้วย tools/cut_towers.py)
//     วางทับ "พอดี" ภาพตึกที่วาดไว้ในรูป (ฐานติดพื้น ไม่ลอย) — หาตำแหน่ง/สเกลด้วย
//     template matching ใน tools/fit_towers_newmap.py (แมปใหม่วาดตึกด้วยสไปรต์ชุดเดียวกัน)
//   • City Hall/trend ถูกถอดออกแล้ว (2026-07-14) — น้ำพุกลางวงเวียนเป็นแค่ฉาก ไม่ใช่ตึกกดได้
//   • hover = เรืองแสง + cursor เท่านั้น · "คลิก" = ตึกเด้งลอยหนึ่งจังหวะ + ตัวละครเดินไปหา (ตามถนน)
//   • ตึกข้อมูล 3 ตึก (chart/fin/news) มีสถานะ free/done/bluffed = badge ✓/🎭 (วงแหวนฐานถูกถอด 2026-07-14)
//   ไฟล์นี้ = เลย์เอาต์ + ฟังก์ชันวาด (logic เดิน/เทิร์นอยู่ที่ world2d.js + turn.js)
//   โหลดรูปแมปไม่ได้ → fallback วาดเมือง 2.5D เองเหมือนเดิม
//   • เอฟเฟกต์ ambient แมปมีชีวิต (2026-07-20 — พอร์ตจาก tier0.html หน้าพรีวิว แล้วลบไฟล์นั้นทิ้ง):
//     เงาเมฆ/นกบิน (บนสุด), น้ำพุพ่น+ระลอก/ประกายน้ำทะเล-คลอง (ใต้ตึก), ควันจรวด Startup/ประกายเหรียญ
//     Gold-Bank/นีออน Crypto (ผูกกับตึกตัวเอง วาดหลังตึกนั้นในลูป depth-sort) — ดูฟังก์ชัน _amb* ท้ายไฟล์
// ============================================================
SC.map = {
  W: 960, H: 540,                 // ขนาดโลก (logical px, 16:9) — พิกัดที่ใช้วาด/คลิกทั้งหมด
  RS: 2,                          // render scale: backing store = W×H×RS → เรนเดอร์คมระดับ 1080p (2 → 1920×1080). ปรับเป็น 3 ได้ถ้าจอ 4K
  bw: 120, bh: 84,                // ขนาดกล่องตึก (ใช้เฉพาะโหมด fallback วาดเอง)
  enterR: 50,                     // รัศมี "เข้าตึก" นับจากจุดฐานตึก (ตึกข้อมูล 4 ตึก)
  spawn: { x: 418, y: 330 },      // จุดเกิด = ถนนวงแหวนตะวันตกเฉียงใต้ของน้ำพุ (snap เข้า roadgrid 2026-07-18)
                                  //   (อยู่บนถนน + พ้นระยะ trigger เข้าตึกทุกหลัง)

  image: 'assets/newestmap.png',  // แมปรูปภาพเมืองเต็ม 16:9 (สำเนา "newest map.png" 2026-07-17) — โหลดไม่ได้ → วาดเอง (fallback)
  _img: null, _calibrate: false, _calIndex: 0,

  // ---- ตึกในเมือง (สไปรต์ = อาคารทั้งหมดของเมือง — ฐานติดพื้นบนล็อตหญ้าว่าง) ----
  //   fx,fy = จุด "ฐานตึก" บนรูป (สัดส่วน 0..1) · h = ความสูงที่วาด (world px) · img = สไปรต์โปร่งใส
  //   newestmap.png (2026-07-17) = เมืองเดิมวาดใหม่แบบ "ล็อตโล่ง" ไม่มีตึกในรูปเลย (ถนน/น้ำพุ/คลอง/หาดตรงกับ
  //     newmap.png เดิมภายในไม่กี่ px — เช็คด้วย blend 50%) → ใช้ตำแหน่ง fx/fy/h ชุดเดิมจาก newmap.png ต่อได้
  //     (ค่าชุดนี้มาจาก template matching/NCC กับ newmap.png เดิม — tools/fit_towers_newmap.py = ของแมปเก่า)
  //   interactive:true = ตึกข้อมูลของ core loop (เดินเข้าเก็บได้) · info เชื่อม SC.config.buildings
  //   จูนฐาน chart/startup/leaderboard/news ใหม่ 2026-07-14: อาร์ตในแมปเป็นคนละเวอร์ชันกับสไปรต์
  //     (สัดส่วนไม่เท่า) → ยึด "ฐานตรง + กว้างเท่าภาพวาด" ส่วนสูงเกินขึ้นไปด้านหลัง = การบังฉากปกติ
  //   bond (Bonds & Fund) = บล็อกบน · fin (Bank & Savings) = บล็อกล่าง (ตรงกับที่วาดในแมปใหม่)
  //   prof = อาชีพเจ้าของ (ใช้ในโหมด fallback) · ปรับตำแหน่งในเกมด้วยปุ่ม 🎯 (เก็บ localStorage)
  city: [
    // แถวบน (ซ้าย → ขวา) — จูน "ฐานชิดถนนฝั่งหน้าตึก" กับ newestmap.png 2026-07-17 (แก้ตึกลอยกลางล็อต:
    //   เลื่อนแต่ละหลังลงไปหาถนนด้านที่หน้าตึกหัน — SE-front: chart/bond/startup/green · SW-front: ที่เหลือ)
    { id: 'chart',      fx: 0.1740, fy: 0.4148, h: 149.8, img: 'assets/tower/cut/chart.png',       emoji: '📈', name: 'หอดูกราฟ',       en: 'Stock Market',   cat: 'info',    prof: 'analyst',    interactive: true, info: 'chart' },
    { id: 'bond',       fx: 0.3136, fy: 0.4722, h: 130.0, img: 'assets/tower/cut/bond.png',        emoji: '📜', name: 'พันธบัตร/กองทุน', en: 'Bonds & Fund',   cat: 'asset',   prof: 'accountant' },
    { id: 'crypto',     fx: 0.4875, fy: 0.3889, h: 145.4, img: 'assets/tower/cut/crypto.png',      emoji: '🪙', name: 'คริปโตอารีนา',    en: 'Crypto Arena',   cat: 'asset',   prof: 'crypto' },
    { id: 'realestate', fx: 0.6229, fy: 0.4556, h: 128,   img: 'assets/tower/cut/realestate.png',  emoji: '🏠', name: 'อสังหา',          en: 'Real Estate',    cat: 'asset',   prof: 'journalist' },
    // gold ย้าย 2026-07-19 (user): ล็อตเขียวหลัง realestate (ฐาน y 191 < 246 → depth-sort วาด realestate ทับหน้าเอง)
    //   ลดสเกล h 126.5→125 (ล็อตแคบกว่าฐานตึกนิดเดียว — envelope พ้นแอสฟัลต์ที่ h นี้พอดี, ประตูห่างถนน ~17px)
    { id: 'gold',       fx: 0.7323, fy: 0.3537, h: 125,   img: 'assets/tower/cut/gold.png',        emoji: '🏆', name: 'โกลด์วอลต์',      en: 'Gold Vault',     cat: 'asset',   prof: 'economist' },
    // กลางเมือง
    { id: 'startup',    fx: 0.2448, fy: 0.6778, h: 140.4, img: 'assets/tower/cut/startup.png',     emoji: '🚀', name: 'สตาร์ทอัพฮับ',    en: 'Startup Hub',    cat: 'asset',   prof: 'vc' },
    // (City Hall/trend ถูกถอดออก 2026-07-14 — user: ไม่มีฟังก์ชันตึก น้ำพุกลางวงเวียนเป็นแค่ฉาก)
    { id: 'green',      fx: 0.7199, fy: 0.6148, h: 122,   img: 'assets/tower/cut/green.png',       emoji: '♻️', name: 'กรีนอินเวสต์',    en: 'Green Invest',   cat: 'asset',   prof: 'vc' },
    // แถวล่าง
    { id: 'fin',        fx: 0.3458, fy: 0.8037, h: 124.4, img: 'assets/tower/cut/fin.png',         emoji: '🏦', name: 'ตึกงบการเงิน',    en: 'Bank & Savings', cat: 'info',    prof: 'accountant', interactive: true, info: 'fin' },
    // (Leaderboard ถูกถอดออก 2026-07-17 — user สั่งไม่วางตึกนี้บน newestmap.png · บล็อกล่างกลางเป็นล็อตว่าง
    //  หน้าต่างส่องพอร์ต _buildLeaderboard + สไปรต์/กรอบอาร์ตยังอยู่บนดิสก์ เผื่อเรียกกลับ)
    { id: 'news',       fx: 0.6500, fy: 0.8111, h: 146.6, img: 'assets/tower/cut/news.png',        emoji: '📰', name: 'สำนักข่าว',       en: 'News',           cat: 'info',    prof: 'journalist', interactive: true, info: 'news' },
  ],

  // ตึกข้อมูล 4 ตึก (walkable/collectable) — derived จาก city ที่ interactive
  buildings: null, // เซ็ตด้านล่าง

  dist: function (ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy);
  },

  buildingAt: function (x, y) {
    for (var i = 0; i < this.buildings.length; i++) {
      var b = this.buildings[i];
      if (this.dist(x, y, b.x, b.y) <= this.enterR) return b;
    }
    return null;
  },

  cityById: function (id) { return this.city.find(function (c) { return c.id === id; }) || null; },

  // สีตัวตึกตามอาชีพเจ้าของ (กลมกลืนกับสีตัวละคร) — ไม่มีเจ้าของใช้เทาน้ำเงิน
  _bodyColor: function (b) {
    var c = b.prof && SC.getCharacter(b.prof);
    return c ? c.color : '#5b6b8c';
  },

  // ---- helpers วาด ----
  _round: function (ctx, x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  _hexToRgb: function (hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 90, g: 107, b: 140 };
  },
  _mix: function (hex, k) { // คูณความสว่าง k (<1 มืด, >1 สว่าง)
    var c = this._hexToRgb(hex);
    var f = function (v) { return Math.max(0, Math.min(255, Math.round(v * k))); };
    return 'rgb(' + f(c.r) + ',' + f(c.g) + ',' + f(c.b) + ')';
  },

  _statusStyle: function (st) {
    if (st === 'free')    return { border: '#36d399', icon: '✓', glow: 'rgba(54,211,153,.55)' };
    if (st === 'done')    return { border: '#4da3ff', icon: '✓', glow: 'rgba(77,163,255,.45)' };
    if (st === 'bluffed') return { border: '#7c5cff', icon: '🎭', glow: 'rgba(124,92,255,.55)' };
    return { border: '#2c374f', icon: '', glow: null };
  },

  // แปลงสัดส่วน fx,fy → พิกัดโลกจริง (รวม override ที่ผู้เล่นปรับด้วยปุ่ม 🎯 จาก localStorage)
  //   คีย์ sc_hotspots_newestmap_v4: bump 2026-07-19 (gold ย้ายไปล็อตหลัง realestate) — กันค่าจูนแมปเก่า override
  applyHotspots: function () {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem('sc_hotspots_newestmap_v4') || '{}'); } catch (e) {}
    var W = this.W, H = this.H;
    this.city.forEach(function (b) {
      var h = saved[b.id];
      b.x = (h ? h.fx : b.fx) * W;
      b.y = (h ? h.fy : b.fy) * H;
    });
  },
  saveHotspot: function (b) {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem('sc_hotspots_newestmap_v4') || '{}'); } catch (e) {}
    saved[b.id] = { fx: b.x / this.W, fy: b.y / this.H };
    try { localStorage.setItem('sc_hotspots_newestmap_v4', JSON.stringify(saved)); } catch (e) {}
  },

  // ขนาดที่ตึกถูกวาด (world px) — กว้างตามสัดส่วนรูปจริงของสไปรต์
  towerSize: function (b) {
    var h = b.h || 150;
    return { w: h * (b._aspect || 1), h: h };
  },
  // ตึกใต้จุด (wx,wy) — เลือกตัวที่อยู่ "หน้าสุด" (ฐาน y มากสุด) เมื่อซ้อนกัน
  towerAt: function (wx, wy) {
    var hit = null;
    for (var i = 0; i < this.city.length; i++) {
      var b = this.city[i], s = this.towerSize(b);
      if (wx >= b.x - s.w / 2 - 4 && wx <= b.x + s.w / 2 + 4 &&
          wy >= b.y - s.h - 8 && wy <= b.y + 12) {
        if (!hit || b.y > hit.y) hit = b;
      }
    }
    return hit;
  },

  // ============================================================
  // นำทางบน "ผิวถนนจริง" ของ newestmap.png (2026-07-18 — user: ห้ามเดินตัดทะลุตึก)
  //   SC.roadGrid (js/roadgrid.js — สร้างจาก tools/make_roadgrid.py) = bitmap ผิวถนน
  //   240×135 เซลล์ × 4 world px · A* 8 ทิศ + ยืดเส้น (string-pulling) → เดินตามถนนโค้งจริง
  //   แทนกราฟโหนด/Dijkstra เดิมทั้งหมด (ถนนแมปนี้โค้ง — เส้นตรงระหว่างแยกหลุดผิวถนน)
  //   ไม่มี roadgrid.js (เช่น harness เก่า) = นำทางแบบเส้นตรง ไม่ clamp
  // ============================================================
  _nav: null,
  _navInit: function () {
    if (this._nav !== null) return this._nav;
    if (typeof SC.roadGrid === 'undefined' || typeof atob !== 'function') { this._nav = false; return false; }
    var g = SC.roadGrid, raw = atob(g.data), bpr = g.w >> 3;
    var walk = new Uint8Array(g.w * g.h);
    for (var y = 0; y < g.h; y++)
      for (var x = 0; x < g.w; x++)
        walk[y * g.w + x] = (raw.charCodeAt(y * bpr + (x >> 3)) >> (7 - (x & 7))) & 1;
    this._nav = { W: g.w, H: g.h, cell: g.cell, walk: walk };
    return this._nav;
  },

  // ยืน (world px) นี้อยู่บนผิวถนนไหม
  isRoad: function (x, y) {
    var nv = this._navInit(); if (!nv) return true;
    var gx = Math.floor(x / nv.cell), gy = Math.floor(y / nv.cell);
    if (gx < 0 || gy < 0 || gx >= nv.W || gy >= nv.H) return false;
    return !!nv.walk[gy * nv.W + gx];
  },

  // จุดบนถนนที่ใกล้ (x,y) สุด — BFS วงกว้างบน grid (snap จุดคลิก/ประตูตึก/ทางกลับถนน)
  nearestRoadPoint: function (x, y) {
    var nv = this._navInit(); if (!nv) return { x: x, y: y, d: 0 };
    var c = nv.cell, W = nv.W, H = nv.H;
    var gx = Math.max(0, Math.min(W - 1, Math.floor(x / c)));
    var gy = Math.max(0, Math.min(H - 1, Math.floor(y / c)));
    if (nv.walk[gy * W + gx]) return { x: x, y: y, d: 0 };
    var q = [gy * W + gx], seen = {}, qi = 0;
    seen[q[0]] = 1;
    while (qi < q.length && q.length < 9000) {
      var u = q[qi++], ux = u % W, uy = (u / W) | 0;
      if (nv.walk[u]) {
        var wx = ux * c + c / 2, wy = uy * c + c / 2;
        return { x: wx, y: wy, d: Math.hypot(wx - x, wy - y) };
      }
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var vx = ux + dx, vy = uy + dy;
        if ((dx || dy) && vx >= 0 && vy >= 0 && vx < W && vy < H) {
          var v = vy * W + vx;
          if (!seen[v]) { seen[v] = 1; q.push(v); }
        }
      }
    }
    return { x: x, y: y, d: 0 };
  },

  // เส้นตรง a→b อยู่บนถนนตลอดแนวไหม (สุ่มทุก 2px — ใช้ยืดเส้นทาง A*)
  _los: function (ax, ay, bx, by) {
    var L = Math.hypot(bx - ax, by - ay), n = Math.max(2, Math.ceil(L / 2));
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      if (!this.isRoad(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
    }
    return true;
  },

  // A* บน grid ถนน → ลิสต์ waypoint (world px, ยืดเส้นแล้ว) — ปลายทางถูก snap เข้าถนนก่อน
  roadAStar: function (sx, sy, tx, ty) {
    var nv = this._navInit();
    if (!nv) return [{ x: tx, y: ty }];
    var c = nv.cell, W = nv.W, H = nv.H, walk = nv.walk;
    var sp = this.nearestRoadPoint(sx, sy), tp = this.nearestRoadPoint(tx, ty);
    var s = Math.floor(sp.y / c) * W + Math.floor(sp.x / c);
    var t = Math.floor(tp.y / c) * W + Math.floor(tp.x / c);
    if (s === t) return [{ x: tp.x, y: tp.y }];
    var open = [s], g = {}, f = {}, came = {}, closed = {};
    g[s] = 0; f[s] = 0;
    var found = false, guard = 0;
    while (open.length && guard++ < 60000) {
      var bi = 0;
      for (var i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      var u = open.splice(bi, 1)[0];
      if (u === t) { found = true; break; }
      if (closed[u]) continue;
      closed[u] = 1;
      var ux = u % W, uy = (u / W) | 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var vx = ux + dx, vy = uy + dy;
        if (vx < 0 || vy < 0 || vx >= W || vy >= H) continue;
        var v = vy * W + vx;
        if (!walk[v] || closed[v]) continue;
        if (dx && dy && (!walk[uy * W + vx] || !walk[vy * W + ux])) continue; // ห้ามลัดทแยงมุมตึก
        var w = (dx && dy) ? 1.414 : 1;
        if (g[v] === undefined || g[u] + w < g[v]) {
          g[v] = g[u] + w; came[v] = u;
          var hx = Math.abs(vx - (t % W)), hy = Math.abs(vy - ((t / W) | 0));
          f[v] = g[v] + Math.max(hx, hy) + 0.414 * Math.min(hx, hy);
          open.push(v);
        }
      }
    }
    if (!found) return [{ x: tp.x, y: tp.y }];
    var cells = [t], cur = t;
    while (cur !== s) { cur = came[cur]; cells.push(cur); }
    cells.reverse();
    var pts = cells.map(function (id) { return { x: (id % W) * c + c / 2, y: ((id / W) | 0) * c + c / 2 }; });
    pts[pts.length - 1] = { x: tp.x, y: tp.y };
    // ยืดเส้น: จาก anchor มองหา waypoint ไกลสุดที่เส้นตรงยังอยู่บนถนนตลอด
    var out = [], anchor = { x: sp.x, y: sp.y }, i0 = 0;
    while (i0 < pts.length) {
      var j = pts.length - 1;
      while (j > i0 && !this._los(anchor.x, anchor.y, pts[j].x, pts[j].y)) j--;
      out.push(pts[j]);
      anchor = pts[j];
      i0 = j + 1;
    }
    return out;
  },

  // เส้นทางเดินตามถนนจากจุด (sx,sy) → ตึก id : [...ตามถนน..., หน้าตึก, ฐานตึก]
  roadRoute: function (sx, sy, id) {
    var b = this.cityById(id); if (!b) return null;
    var door = this.nearestRoadPoint(b.x, b.y);
    var path = this.roadAStar(sx, sy, door.x, door.y) || [{ x: door.x, y: door.y }];
    if (door.d > 1) path.push({ x: b.x, y: b.y }); // ช่วงสั้นสุดท้ายเข้าฐานตึก (ตั้งใจออกนอกถนน)
    return path;
  },

  // เส้นทางตามถนนจากจุดใดๆ → จุดคลิกบนพื้น (snap เข้าถนน) — ใช้ตอนคลิกพื้นเปล่า
  roadRouteToPoint: function (sx, sy, tx, ty) {
    return this.roadAStar(sx, sy, tx, ty);
  },

  // ============================================================
  // วาดทั้งฉาก — opts: { t, statuses, actor, target, reading, bubbles }
  //   มีรูปแมป → ใช้รูปเป็นพื้นหลัง · ไม่มี → วาดเมืองเอง (fallback)
  // ============================================================
  drawScene: function (ctx, opts) {
    if (this._img) return this._drawImageScene(ctx, opts || {});
    return this._drawProceduralScene(ctx, opts || {});
  },

  // ---- โหมดรูปภาพ: map1.png เต็มจอ + ตึก asset 11 หลัง (depth-sort กับตัวละคร) ----
  _drawImageScene: function (ctx, opts) {
    var W = this.W, H = this.H, self = this, t = opts.t || 0, dt = opts.dt || 0.016;
    // วาดรูปแบบ "cover" (เต็มเฟรมไม่บิดสัดส่วน)
    var iw = this._img.width, ih = this._img.height;
    var scale = Math.max(W / iw, H / ih);
    var dw = iw * scale, dh = ih * scale;
    ctx.drawImage(this._img, (W - dw) / 2, (H - dh) / 2, dw, dh);

    // ambient ใต้ตึก: ประกายน้ำทะเล/คลอง + น้ำพุพ่น/ระลอก (วาดก่อนสไปรต์ตึกทั้งหมด) + จับเวลาสปอน "ประกายเหรียญ"
    //   (สปอนครั้งเดียวต่อเฟรมตรงนี้ — วาดจริงผูกกับตึก gold/fin ในลูป depth-sort ด้านล่าง)
    this._ambWater(ctx, t, dt);
    this._ambFountain(ctx, t, dt);
    this._ambGlintSpawn(t, dt);

    // เป้าหมายเดิน (วงกระเพื่อมบนพื้น — วาดก่อนตึก/ตัวละครจะได้อยู่ใต้)
    if (opts.target) {
      ctx.strokeStyle = 'rgba(77,163,255,.9)'; ctx.lineWidth = 2;
      var pr = 12 + Math.sin(t * 6) * 3;
      ctx.beginPath(); ctx.arc(opts.target.x, opts.target.y, pr, 0, Math.PI * 2); ctx.stroke();
    }

    // ตึก + ตัวละคร เรียงตามแกน y ของ "ฐาน" (painter's algorithm — ของล่างวาดทับของบน)
    var statuses = opts.statuses || {};
    var items = this.city.map(function (b) { return { y: b.y, b: b }; });
    if (opts.actor) items.push({ y: opts.actor.y + 14, actor: opts.actor });
    items.sort(function (a, b) { return a.y - b.y; });
    items.forEach(function (it) {
      if (it.actor) return self._drawActor(ctx, it.actor, opts.reading, t);
      var b = it.b;
      // ไม่มีสไปรต์ (trend ใช้น้ำพุในรูปเดิม / โหลดพลาด) → ตึก interactive ยังได้วงแหวน+ป้ายจาก _drawTower
      if (b._img || b.interactive) {
        self._drawTower(ctx, b, statuses[b.id] || 'none', t, dt, opts.hover === b.id);
        // ambient ผูกตึก: วาด "หลัง" สไปรต์ของตึกนั้นทันที (ยังอยู่ตำแหน่ง y เดียวกันในลูป depth-sort)
        if (b.id === 'startup') self._ambSmoke(ctx, b, t, dt);
        else if (b.id === 'crypto') self._ambNeon(ctx, b, t);
        else if (b.id === 'gold' || b.id === 'fin') self._ambGlintDraw(ctx, b.id, dt);
      }
    });

    // ambient บนสุด: เงาเมฆ + นกบิน (ทับตึกทั้งหมด+ตัวละครแล้ว แต่ยังใต้บับเบิล/UI)
    this._ambClouds(ctx, t, dt);
    this._ambBirds(ctx, t, dt);

    (opts.bubbles || []).forEach(function (bb) { self._drawBubble(ctx, bb); });
    if (this._calibrate) this._drawCalibrate(ctx);
  },

  // ============================================================
  // เอฟเฟกต์ ambient แมปมีชีวิต (พอร์ตจาก tier0.html 2026-07-20 — โค้ด canvas ล้วน ไม่ใช้ asset ใหม่)
  //   จุดยึดวัดจากช็อต ?debug=1 ของ tier0.html ที่ 960×540 (=world 1:1) กับ newestmap.png
  //   เรียกจาก _drawImageScene: น้ำ/น้ำพุ/สปอนประกายเหรียญ = ก่อนลูปตึก (ใต้สไปรต์) ·
  //   ควันจรวด/นีออน/วาดประกายเหรียญ = แทรกหลัง _drawTower ของตึกเจ้าของในลูป depth-sort ·
  //   เมฆ/นก = หลังลูปตึกทั้งหมด (บนสุด)
  // ============================================================
  _AMB_SEA: [ // ทะเลฝั่งซ้าย (โซนน้ำกว้าง สุ่มทั้งกล่องได้) [x,y,w,h]
    [4, 62, 150, 80], [0, 152, 52, 178], [0, 345, 88, 188],
  ],
  _AMB_CANAL: [ // เส้นกลางคลองทแยง (ไล่ขวาบน→ล่าง) — สุ่มบนเส้น ± ตั้งฉากเล็กน้อย
    [894, 278], [840, 279], [780, 315], [705, 366], [652, 430], [646, 491],
  ],
  _AMB_FTN: { sx: 469.5, sy: 239, by: 270 }, // ปากพ่นน้ำพุ(sx,sy) = ยอดแหลม (จูนขวา +4.5 ตามช็อตซูม 2026-07-20) / ผิวน้ำอ่าง(by)

  _amb: null,
  _ambState: function () {
    if (this._amb) return this._amb;
    this._amb = {
      clouds: [], flocks: [],           // เงาเมฆ / นกบิน
      drops: [], rips: [],              // น้ำพุ: หยดน้ำ / ระลอก
      winks: [],                        // ประกายน้ำทะเล-คลอง
      puffs: [], puffT: 0,              // ควันจรวด Startup
      gls: [], glT: 0,                  // ประกายเหรียญ Gold/Bank
    };
    return this._amb;
  },

  _ambMkCloud: function (x) {
    var r = 68 + Math.random() * 66, lobes = [];
    for (var i = 0; i < 3; i++)
      lobes.push({ dx: (Math.random() - .5) * r * 1.7, dy: (Math.random() - .5) * r * .55, r: r * (.5 + Math.random() * .4) });
    return { x: x, y: 100 + Math.random() * 370, v: 4.5 + Math.random() * 5, r: r, lobes: lobes };
  },
  // เงาเมฆลอยผ่านเมือง
  _ambClouds: function (ctx, t, dt) {
    var A = this._ambState(), self = this;
    if (!A.clouds.length) for (var i = 0; i < 3; i++) A.clouds.push(this._ambMkCloud(Math.random() * (this.W + 360) - 180));
    A.clouds.forEach(function (c, i) {
      c.x += c.v * dt;
      if (c.x - c.r * 2 > self.W + 40) A.clouds[i] = self._ambMkCloud(-c.r * 2 - 40);
      c.lobes.forEach(function (L) {
        var g = ctx.createRadialGradient(c.x + L.dx, c.y + L.dy, L.r * .15, c.x + L.dx, c.y + L.dy, L.r);
        g.addColorStop(0, 'rgba(9,22,40,0.11)'); g.addColorStop(1, 'rgba(9,22,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(c.x + L.dx, c.y + L.dy, L.r, L.r * .62, 0, 0, 6.284); ctx.fill();
      });
    });
  },

  _ambMkFlock: function () {
    var dir = Math.random() < .5 ? 1 : -1, n = 3 + (Math.random() * 3 | 0), birds = [];
    for (var i = 0; i < n; i++)
      birds.push({ ox: -i * (11 + Math.random() * 4) * dir, oy: (i % 2 ? 6 : 0) + Math.random() * 5, ph: Math.random() * 6.28 });
    return { x: dir > 0 ? -70 : this.W + 70, y: 42 + Math.random() * 105, v: (25 + Math.random() * 15) * dir, birds: birds };
  },
  // นกบินเป็นฝูง
  _ambBirds: function (ctx, t, dt) {
    var A = this._ambState(), self = this;
    if (!A.flocks.length) {
      A.flocks.push(this._ambMkFlock()); A.flocks.push(this._ambMkFlock());
      A.flocks[1].x += A.flocks[1].v > 0 ? -this.W * .5 : this.W * .5;
    }
    ctx.strokeStyle = 'rgba(24,34,56,0.85)'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    A.flocks.forEach(function (f, i) {
      f.x += f.v * dt;
      if ((f.v > 0 && f.x - 90 > self.W) || (f.v < 0 && f.x + 90 < 0)) A.flocks[i] = self._ambMkFlock();
      f.birds.forEach(function (b) {
        var bx = f.x + b.ox, by = f.y + b.oy + Math.sin(t * 1.7 + b.ph) * 2;
        var flap = Math.sin(t * 9 + b.ph) * 3.1;
        ctx.beginPath();
        ctx.moveTo(bx - 4.6, by - flap);
        ctx.quadraticCurveTo(bx - 1.2, by + 1.2, bx, by);
        ctx.quadraticCurveTo(bx + 1.2, by + 1.2, bx + 4.6, by - flap);
        ctx.stroke();
      });
    });
  },

  // น้ำพุพ่นน้ำ + ระลอก (วาดก่อนตึก)
  _ambFountain: function (ctx, t, dt) {
    var A = this._ambState(), F = this._AMB_FTN;
    for (var e = 0; e < 3; e++) if (A.drops.length < 130)
      A.drops.push({ x: F.sx + (Math.random() - .5) * 4, y: F.sy, vx: (Math.random() - .5) * 46, vy: -(44 + Math.random() * 26), life: 0 });
    for (var i = A.drops.length - 1; i >= 0; i--) {
      var d = A.drops[i];
      d.vy += 150 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.life += dt;
      if (d.y >= F.by + (Math.random() * 5)) {
        if (A.rips.length < 22) A.rips.push({ x: d.x, y: F.by + 2 + Math.random() * 4, r: 1, max: 5.5 + Math.random() * 4 });
        A.drops.splice(i, 1); continue;
      }
      ctx.fillStyle = 'rgba(214,242,255,' + (0.8 * Math.max(0, 1 - d.life / 1.5)).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(d.x, d.y, 1.1, 0, 6.284); ctx.fill();
    }
    for (var j = A.rips.length - 1; j >= 0; j--) {
      var R = A.rips[j]; R.r += 7.5 * dt;
      if (R.r >= R.max) { A.rips.splice(j, 1); continue; }
      ctx.strokeStyle = 'rgba(232,250,255,' + (0.5 * (1 - R.r / R.max)).toFixed(3) + ')';
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.ellipse(R.x, R.y, R.r, R.r * 0.38, 0, 0, 6.284); ctx.stroke();
    }
  },

  _ambStar: function (ctx, x, y, s, a, col) {
    ctx.strokeStyle = 'rgba(' + col + ',' + a.toFixed(3) + ')'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - s, y); ctx.lineTo(x + s, y);
    ctx.moveTo(x, y - s); ctx.lineTo(x, y + s);
    ctx.stroke();
  },
  // ประกายน้ำทะเล/คลอง (วาดก่อนตึก) — คลองทแยงใช้เส้นกลาง+ตั้งฉาก ±8px (กล่องสี่เหลี่ยมเดิมหลุดไปโดนถนน/หญ้า)
  _ambWater: function (ctx, t, dt) {
    var A = this._ambState();
    if (A.winks.length < 34 && Math.random() < 0.55) {
      var px, py;
      if (Math.random() < 0.45) {                       // ทะเลซ้าย
        var z = this._AMB_SEA[(Math.random() * this._AMB_SEA.length) | 0];
        px = z[0] + Math.random() * z[2]; py = z[1] + Math.random() * z[3];
      } else {                                          // คลอง: จุดบนเส้นกลาง + เยื้องตั้งฉากในความกว้างคลอง
        var P = this._AMB_CANAL, i0 = (Math.random() * (P.length - 1)) | 0, u = Math.random();
        var dx = P[i0 + 1][0] - P[i0][0], dy = P[i0 + 1][1] - P[i0][1];
        var L = Math.sqrt(dx * dx + dy * dy) || 1, off = (Math.random() - .5) * 16;
        px = P[i0][0] + dx * u - dy / L * off; py = P[i0][1] + dy * u + dx / L * off;
      }
      A.winks.push({ x: px, y: py, life: 0, max: .8 + Math.random() * .8, s: 1.6 + Math.random() * 1.8 });
    }
    for (var i = A.winks.length - 1; i >= 0; i--) {
      var wk = A.winks[i]; wk.life += dt;
      var p = wk.life / wk.max;
      if (p >= 1) { A.winks.splice(i, 1); continue; }
      this._ambStar(ctx, wk.x, wk.y, wk.s * (0.75 + 0.25 * Math.sin(t * 6)), Math.sin(p * Math.PI) * 0.9, '255,255,255');
    }
  },

  // ควันจรวด Startup — b = ตึก startup (เรียกจากลูป depth-sort ทันทีหลังวาดสไปรต์ตึกนี้)
  _ambSmoke: function (ctx, b, t, dt) {
    var A = this._ambState();
    var px = b.x + b.h * 0.045, py = b.y - b.h * 0.595; // ก้อนควันใต้จรวดที่วาดไว้ในสไปรต์
    A.puffT -= dt;
    if (A.puffT <= 0 && A.puffs.length < 9) {
      A.puffs.push({ x: px + (Math.random() - .5) * 6, y: py, life: 0, max: 2.3 + Math.random() * .6, vx: 1.5 + Math.random() * 2 });
      A.puffT = 0.5 + Math.random() * 0.25;
    }
    for (var i = A.puffs.length - 1; i >= 0; i--) {
      var q = A.puffs[i]; q.life += dt;
      var p = q.life / q.max;
      if (p >= 1) { A.puffs.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y -= (8 - p * 4) * dt;
      ctx.fillStyle = 'rgba(236,241,246,' + (0.26 * (1 - p)).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(q.x, q.y, 2.4 + p * 6.5, 0, 6.284); ctx.fill();
    }
  },

  // ประกายเหรียญ Gold/Bank — สปอนครั้งเดียวต่อเฟรม (เรียกก่อนลูปตึก) เลือกตึกเจ้าของสุ่ม gold/fin
  _ambGlintSpawn: function (t, dt) {
    var A = this._ambState();
    A.glT -= dt;
    if (A.glT <= 0) {
      var pick = Math.random() < .55 ? 'gold' : 'fin';
      var b = this.cityById(pick);
      if (b) A.gls.push({ bid: pick, x: b.x + (Math.random() - .5) * b.h * 0.7, y: b.y - b.h * (0.12 + Math.random() * 0.55), life: 0, max: .65, s: 2.4 + Math.random() * 2 });
      A.glT = 0.8 + Math.random() * 0.9;
    }
  },
  // วาด/อัปเดตอายุเฉพาะประกายที่เป็นของตึก bid นี้ (เรียกหลัง _drawTower ของ gold และของ fin แยกกัน
  //   คนละครั้งต่อเฟรม — อายุ/ลบ particle จึงเกิดขึ้นครั้งเดียวต่อเฟรมพอดี)
  _ambGlintDraw: function (ctx, bid, dt) {
    var A = this._ambState();
    for (var i = A.gls.length - 1; i >= 0; i--) {
      var g = A.gls[i]; if (g.bid !== bid) continue;
      g.life += dt;
      var p = g.life / g.max;
      if (p >= 1) { A.gls.splice(i, 1); continue; }
      var a = Math.sin(p * Math.PI);
      this._ambStar(ctx, g.x, g.y, g.s, a * 0.95, '255,226,120');
      this._ambStar(ctx, g.x, g.y, g.s * 0.45, a * 0.9, '255,255,255');
    }
  },

  // ไฟนีออน Crypto Arena — b = ตึก crypto (เรียกจากลูป depth-sort ทันทีหลังวาดสไปรต์ตึกนี้)
  _ambNeon: function (ctx, b, t) {
    var cx = b.x, cy = b.y - b.h * 0.58, r = b.h * 0.42;
    var a = 0.085 + 0.05 * Math.sin(t * 2.1) + 0.02 * Math.sin(t * 7.3);
    ctx.globalCompositeOperation = 'lighter';
    var g1 = ctx.createRadialGradient(cx, cy, r * .1, cx, cy, r);
    g1.addColorStop(0, 'rgba(172,120,255,' + a.toFixed(3) + ')'); g1.addColorStop(1, 'rgba(172,120,255,0)');
    ctx.fillStyle = g1; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.284); ctx.fill();
    var g2 = ctx.createRadialGradient(cx - r * .3, cy + r * .25, 2, cx - r * .3, cy + r * .25, r * .5);
    g2.addColorStop(0, 'rgba(110,220,255,' + (a * .8).toFixed(3) + ')'); g2.addColorStop(1, 'rgba(110,220,255,0)');
    ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(cx - r * .3, cy + r * .25, r * .5, 0, 6.284); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  },

  // ---- ตึก asset หนึ่งหลัง: เงา + เด้งลอย "เฉพาะตอนถูกคลิก" + ป้ายชื่อ + สถานะ ----
  //   hover ไม่ยกตัว (แค่เรืองแสง + cursor จาก world2d) — ตึกต้องนั่งติดพื้นตรงอาคารในรูปเสมอ
  //   b._img == null (trend/โหลดพลาด) → ข้ามสไปรต์ วาดเฉพาะวงแหวน+badge+ป้ายชื่อ
  _drawTower: function (ctx, b, status, t, dt, hovered) {
    var s = this._statusStyle(status);
    var sz = this.towerSize(b), w = sz.w, h = sz.h;

    // เด้งลอยหนึ่งจังหวะตอนถูกคลิก (_popT เซ็ตจาก world2d) — บอกผู้เล่นว่ากำลังเดินไปตึกไหน
    var lift = 0;
    if (b._popT != null) {
      var k = (t - b._popT) / 0.6;
      if (k >= 0 && k < 1) lift = Math.sin(Math.PI * k) * 14 * (1 - k * 0.35);
      else b._popT = null;
    }

    if (b._img) {
      // เงาสัมผัสพื้นแบบนุ่ม (radial ไล่จาง) กว้างเกือบเท่าฐานตึก — บนแมปล็อตโล่ง (newestmap ไม่มีเงาวาดในรูป)
      //   เงาแข็งวงเล็กอันเดิมอ่านเป็น "ตึกลอย" · ตึกเด้งขึ้น (lift) → เงาหด+จาง ให้เห็นว่ายกจากพื้น
      var shk = Math.max(0, 1 - lift * 0.028);
      var srx = w * 0.46 * (0.88 + 0.12 * shk), sry = Math.max(9, w * 0.125);
      ctx.save();
      ctx.translate(b.x, b.y + 2);
      ctx.scale(1, sry / srx);
      var sg = ctx.createRadialGradient(0, 0, srx * 0.15, 0, 0, srx);
      sg.addColorStop(0, 'rgba(10,18,30,' + (0.30 * shk + 0.05).toFixed(3) + ')');
      sg.addColorStop(0.7, 'rgba(10,18,30,' + (0.16 * shk + 0.03).toFixed(3) + ')');
      sg.addColorStop(1, 'rgba(10,18,30,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(0, 0, srx, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // (วงแหวนเรียกที่ฐานตึกข้อมูลถูกถอดออก 2026-07-14 — user: เอาวงกลมเหลืองกระพริบออก
    //  สถานะยังเหลือ badge ✓/🎭 มุมตึก + เรืองแสงรอบสไปรต์)

    // เหตุการณ์ปิดตึก (EVENTS_SPEC ข้อ 9): สไปรต์ tower_broken หรือ brightness 0.45 + ป้าย "ปิดซ่อม N รอบ"
    //   (ระหว่างคัตซีนอุกกาบาต ตึกที่ลูกยังตกไม่ถึงยังวาดเป็นตึกปกติ — isPendingHit)
    var closedRounds = (SC.events && SC.events.isClosed && SC.events.isClosed(b.id) &&
      !(SC.events.isPendingHit && SC.events.isPendingHit(b.id))) ? SC.state.events.closed[b.id] : 0;

    if (b._img) {
      // ตัวตึก (hover/สถานะ → เรืองแสงรอบสไปรต์ ไม่ขยับตัวตึก)
      ctx.save();
      if (closedRounds > 0) {
        var src = b._brokenImg || b._img;
        if (!b._brokenImg && ctx.filter !== undefined) ctx.filter = 'brightness(0.45)';
        ctx.drawImage(src, b.x - w / 2, b.y - h - lift, w, h);
        if (ctx.filter !== undefined) ctx.filter = 'none';
      } else {
        if (hovered || lift > 1) { ctx.shadowColor = 'rgba(255,244,180,.9)'; ctx.shadowBlur = 14; }
        else if (s.glow) { ctx.shadowColor = s.glow; ctx.shadowBlur = 12; }
        ctx.drawImage(b._img, b.x - w / 2, b.y - h - lift, w, h);
      }
      ctx.restore();
    }

    // ป้าย "🚧 ปิดซ่อม N รอบ" + ควันเบาๆ เหนือตึกที่ปิด
    if (closedRounds > 0) {
      var puf = (Math.sin(t * 3 + b.x) * 0.5 + 0.5);
      ctx.globalAlpha = 0.30 + 0.25 * puf;
      ctx.fillStyle = 'rgba(120,120,130,1)';
      ctx.beginPath(); ctx.arc(b.x - w * 0.18, b.y - h * 0.9 - lift - puf * 6, 9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(b.x + w * 0.06, b.y - h * 0.98 - lift - puf * 9, 7, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      var lbl = '🚧 ปิดซ่อม ' + closedRounds + ' รอบ';
      ctx.font = 'bold 12px "Segoe UI"';
      var tw2 = ctx.measureText(lbl).width + 14;
      var ly = b.y - (b._img ? h : 46) - lift - 12;
      ctx.fillStyle = 'rgba(180,60,40,.92)'; this._round(ctx, b.x - tw2 / 2, ly, tw2, 18, 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(lbl, b.x, ly + 13);
    }

    // ป้ายสถานะมุมขวาบนของตึก (✓ เก็บแล้ว / 🎭 บลัฟ) — ไม่มีสไปรต์ (trend) → ลอยเหนือน้ำพุเตี้ยๆ
    if (b.interactive && s.icon) {
      var bx = b.x + w * 0.32, by = b._img ? (b.y - h - lift + 12) : (b.y - 52);
      ctx.fillStyle = 'rgba(14,22,38,.85)';
      ctx.beginPath(); ctx.arc(bx, by, 11, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = s.border; ctx.stroke();
      ctx.fillStyle = '#eaf1fb'; ctx.textAlign = 'center'; ctx.font = 'bold 12px "Segoe UI Emoji"';
      ctx.fillText(s.icon, bx, by + 4);
    }

    // (ป้ายชื่อใต้ฐานตึกถูกเอาออกแล้ว — user สั่ง 2026-07-05: แมปสะอาด ใช้ hover เรืองแสง +
    //  วงแหวน/badge บอกสถานะพอ · ชื่อตึกไปโชว์บนแบนเนอร์หน้าต่างตอนคลิกเข้าแทน)
  },

  // จุดตึกข้อมูลแบบวงกลม (fallback กรณีสไปรต์ตึกโหลดไม่ได้)
  _drawHotspot: function (ctx, b, status, t) {
    var s = this._statusStyle(status);
    var r = 24 + Math.sin(t * 4 + b.x) * 2.5;
    ctx.save();
    if (s.glow) { ctx.shadowColor = s.glow; ctx.shadowBlur = 16; }
    ctx.strokeStyle = s.border; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    // ไอคอนในดิสก์
    ctx.fillStyle = 'rgba(14,22,38,.72)';
    ctx.beginPath(); ctx.arc(b.x, b.y, 16, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'center'; ctx.font = '18px "Segoe UI Emoji"';
    ctx.fillText(b.emoji, b.x, b.y + 6);
    // ป้ายชื่อเหนือจุด
    ctx.font = 'bold 11px "Segoe UI"';
    var tw = ctx.measureText(b.name).width + 12;
    ctx.fillStyle = 'rgba(14,22,38,.82)'; this._round(ctx, b.x - tw / 2, b.y - r - 20, tw, 17, 7); ctx.fill();
    ctx.fillStyle = '#eaf1fb'; ctx.fillText(b.name, b.x, b.y - r - 8);
    if (s.icon) { ctx.font = '13px "Segoe UI Emoji"'; ctx.fillText(s.icon, b.x + 13, b.y - 11); }
  },

  _drawCalibrate: function (ctx) {
    var self = this, cur = this.city[this._calIndex];
    ctx.fillStyle = 'rgba(8,12,22,.55)'; ctx.fillRect(0, 0, this.W, 46);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px "Segoe UI"'; ctx.textAlign = 'center';
    ctx.fillText('🎯 คลิกจุด "ฐานตึก" ในรูปเพื่อวาง "' + (cur ? cur.name : '') + '" · (' + (this._calIndex + 1) + '/' + this.city.length + ') · กด 🎯 อีกครั้งเพื่อจบ', this.W / 2, 28);
    this.city.forEach(function (b, i) {
      ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
      ctx.strokeStyle = (i === self._calIndex) ? '#f7c948' : 'rgba(255,255,255,.5)';
      ctx.beginPath(); ctx.arc(b.x, b.y, 26, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    });
  },

  // ---- โหมดวาดเอง (fallback เดิม) — opts: { t, statuses, actor, target, reading, bubbles } ----
  _drawProceduralScene: function (ctx, opts) {
    var W = this.W, H = this.H, self = this;
    var t = opts.t || 0;

    this._drawSky(ctx, t);
    this._drawSea(ctx, t);
    this._drawLand(ctx);
    this._drawRoads(ctx);
    this._drawPlaza(ctx, t);

    // ตึก + ตัวละครอาชีพข้างตึก (เรียงตาม y ให้ตึกล่างทับตึกบน = ความลึก)
    var statuses = opts.statuses || {};
    var ordered = this.city.slice().sort(function (a, b) { return a.y - b.y; });
    ordered.forEach(function (b) {
      self._drawBuilding(ctx, b, statuses[b.id] || 'none', t);
      if (b.prof) self._drawTowerNpc(ctx, b, t);
    });

    // ambient: บอลลูน + นก
    this._drawBalloon(ctx, t);
    this._drawBirds(ctx, t);

    // เป้าหมายเดิน
    if (opts.target) {
      ctx.strokeStyle = 'rgba(77,163,255,.85)'; ctx.lineWidth = 2;
      var pr = 12 + Math.sin(t * 6) * 3;
      ctx.beginPath(); ctx.arc(opts.target.x, opts.target.y, pr, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(opts.target.x, opts.target.y, 3, 0, Math.PI * 2); ctx.stroke();
    }

    // ตัวละครผู้เล่น/บอท
    if (opts.actor) this._drawActor(ctx, opts.actor, opts.reading, t);

    // bubbles (tell / ข้อความ)
    (opts.bubbles || []).forEach(function (bb) { self._drawBubble(ctx, bb); });
  },

  _drawSky: function (ctx, t) {
    var W = this.W, H = this.H;
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#7ec8f2');
    g.addColorStop(0.45, '#a8d8f0'); g.addColorStop(1, '#dff0d8');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // ภูเขาไกลๆ
    ctx.fillStyle = 'rgba(120,150,170,.35)';
    ctx.beginPath(); ctx.moveTo(0, 120);
    for (var x = 0; x <= W; x += 80) ctx.lineTo(x, 90 + Math.sin(x * 0.02) * 30);
    ctx.lineTo(W, 160); ctx.lineTo(0, 160); ctx.closePath(); ctx.fill();
    // เมฆลอย (ขยับตลอดแบบช้าๆ)
    var clouds = [{ y: 40, s: 1.1, sp: 8, o: 0 }, { y: 80, s: 0.8, sp: 5, o: 300 }, { y: 55, s: 1.0, sp: 6.5, o: 620 }];
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      var cx = ((t * c.sp + c.o) % (W + 240)) - 120;
      this._cloud(ctx, cx, c.y, c.s);
    }
  },
  _cloud: function (ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.arc(20, 4, 20, 0, Math.PI * 2);
    ctx.arc(44, 2, 15, 0, Math.PI * 2); ctx.arc(22, -8, 14, 0, Math.PI * 2);
    ctx.fill(); ctx.restore();
  },

  _drawSea: function (ctx, t) {
    var H = this.H;
    // ทะเลแถบซ้าย (เหมือน gamer1.png ที่มีทะเล/ชายฝั่ง)
    var g = ctx.createLinearGradient(0, 0, 90, 0);
    g.addColorStop(0, '#2b7fb8'); g.addColorStop(1, 'rgba(43,127,184,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 150, 90, H - 150);
    // คลื่นระยิบ (ขยับตาม sin)
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
    for (var y = 180; y < H; y += 26) {
      ctx.beginPath();
      for (var x = 4; x < 84; x += 8) {
        var yy = y + Math.sin((x + t * 40) * 0.15) * 2.2;
        if (x === 4) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  },

  _drawLand: function (ctx) {
    var W = this.W, H = this.H;
    // พื้นเมือง (หญ้า/พื้นถนนโทนเขียว-เทา)
    var g = ctx.createLinearGradient(0, 150, 0, H);
    g.addColorStop(0, '#8fce7a'); g.addColorStop(1, '#7bbf6a');
    ctx.fillStyle = g; ctx.fillRect(90, 150, W - 90, H - 150);
    // หย่อมหญ้าเข้ม
    ctx.fillStyle = 'rgba(90,170,80,.35)';
    for (var i = 0; i < 26; i++) {
      var x = 120 + (i * 137) % (W - 160), y = 175 + (i * 97) % (H - 200);
      ctx.beginPath(); ctx.ellipse(x, y, 26, 12, 0, 0, Math.PI * 2); ctx.fill();
    }
  },

  _drawRoads: function (ctx) {
    var self = this;
    // ถนนกริดเชื่อมตึก (แนวนอน 3 แถว + แนวตั้ง 5 คอลัมน์) โทนเทาอ่อน
    var rows = [118, 300, 470], cols = [110, 300, 480, 660, 850];
    ctx.strokeStyle = '#c9d2d9'; ctx.lineWidth = 26; ctx.lineCap = 'round';
    rows.forEach(function (y) { ctx.beginPath(); ctx.moveTo(70, y); ctx.lineTo(self.W - 40, y); ctx.stroke(); });
    cols.forEach(function (x) { ctx.beginPath(); ctx.moveTo(x, 90); ctx.lineTo(x, self.H - 40); ctx.stroke(); });
    // เส้นแบ่งกลางถนน (ประ เหลือง)
    ctx.strokeStyle = 'rgba(247,201,72,.8)'; ctx.lineWidth = 2; ctx.setLineDash([12, 12]);
    rows.forEach(function (y) { ctx.beginPath(); ctx.moveTo(70, y); ctx.lineTo(self.W - 40, y); ctx.stroke(); });
    cols.forEach(function (x) { ctx.beginPath(); ctx.moveTo(x, 90); ctx.lineTo(x, self.H - 40); ctx.stroke(); });
    ctx.setLineDash([]);
  },

  _drawPlaza: function (ctx, t) {
    var sx = this.spawn.x, sy = this.spawn.y;
    // ลานวงกลม
    ctx.fillStyle = '#bfe0f0';
    ctx.beginPath(); ctx.arc(sx, sy, 58, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#9fc6da'; ctx.lineWidth = 4; ctx.stroke();
    // น้ำพุ (วงกระเพื่อมขยับตลอด)
    ctx.fillStyle = '#7fc8e8';
    ctx.beginPath(); ctx.arc(sx, sy, 30, 0, Math.PI * 2); ctx.fill();
    for (var i = 0; i < 3; i++) {
      var rr = 8 + ((t * 18 + i * 8) % 24);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 - rr / 60) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, rr, 0, Math.PI * 2); ctx.stroke();
    }
    // นกฮูก City Hall (เด้งขึ้นลงนิดๆ)
    var bob = Math.sin(t * 2) * 2;
    ctx.font = '30px "Segoe UI Emoji"'; ctx.textAlign = 'center';
    ctx.fillText('🦉', sx, sy - 6 + bob);
    ctx.fillStyle = '#3a4d63'; ctx.font = 'bold 11px "Segoe UI"';
    ctx.fillText('น้ำพุกลางเมือง', sx, sy + 44);
  },

  // ---- ตึกเดี่ยว (2.5D กล่อง + หลังคา + ป้าย) ----
  _drawBuilding: function (ctx, b, status, t) {
    var self = this, W = this.bw, H = this.bh;
    var x = b.x - W / 2, y = b.y - H / 2;
    var base = this._bodyColor(b);
    var s = this._statusStyle(status);

    // เงา
    ctx.fillStyle = 'rgba(0,0,0,.20)';
    ctx.beginPath(); ctx.ellipse(b.x, b.y + H / 2 + 4, W / 2 - 4, 10, 0, 0, Math.PI * 2); ctx.fill();

    // glow ตึกข้อมูลที่ active
    if (s.glow) {
      ctx.save(); ctx.shadowColor = s.glow; ctx.shadowBlur = 18;
      ctx.fillStyle = s.glow; this._round(ctx, x - 3, y - 3, W + 6, H + 6, 16); ctx.fill();
      ctx.restore();
    }

    // ตัวตึก
    ctx.fillStyle = this._mix(base, 0.85);
    this._round(ctx, x, y, W, H, 12); ctx.fill();
    // หลังคา (แถบสว่างด้านบน)
    ctx.fillStyle = this._mix(base, 1.25);
    this._round(ctx, x, y, W, 20, 12); ctx.fill();
    ctx.fillRect(x, y + 12, W, 8);

    // หน้าต่างกระพริบ (ambient)
    for (var wi = 0; wi < 3; wi++) {
      for (var hj = 0; hj < 2; hj++) {
        var lit = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2 + wi * 1.7 + hj * 2.3 + b.x));
        ctx.fillStyle = 'rgba(255,240,180,' + lit + ')';
        ctx.fillRect(x + 16 + wi * 30, y + 30 + hj * 20, 16, 12);
      }
    }

    // ขอบสถานะ (ตึกข้อมูล)
    if (b.interactive) {
      ctx.lineWidth = 3; ctx.strokeStyle = s.border;
      this._round(ctx, x, y, W, H, 12); ctx.stroke();
      if (s.icon) { ctx.font = '15px "Segoe UI Emoji"'; ctx.textAlign = 'center'; ctx.fillText(s.icon, x + W - 14, y + 16); }
    }

    // ป้ายไอคอน (ลอยเหนือหลังคานิดๆ) — ป้ายชื่อเอาออกแล้วเหมือนโหมดรูป (คงไอคอนไว้พอจำตึกได้)
    var fb = Math.sin(t * 2.5 + b.x) * 1.5;
    ctx.textAlign = 'center'; ctx.font = '26px "Segoe UI Emoji"';
    ctx.fillText(b.emoji, b.x, y - 6 + fb);
  },

  // ---- ตัวละครอาชีพยืนข้างตึก (โมเดลขึ้นกับอาชีพที่ผูกกับตึกนั้น — GDD ข้อ 5) ----
  _drawTowerNpc: function (ctx, b, t) {
    var c = SC.getCharacter(b.prof);
    if (!c) return;
    var nx = b.x + this.bw / 2 + 12;         // ยืนข้างขวาของตึก
    var ny = b.y + 6 + Math.sin(t * 3 + b.x) * 3; // เด้งเบาๆ ตลอด (natural)
    // เงา
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(nx, ny + 15, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
    // ตัว (ดิสก์สีอาชีพ + emoji)
    ctx.fillStyle = c.color;
    ctx.beginPath(); ctx.arc(nx, ny, 13, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
    ctx.textAlign = 'center'; ctx.font = '15px "Segoe UI Emoji"';
    ctx.fillText(c.emoji, nx, ny + 5);
  },

  _drawBalloon: function (ctx, t) {
    var W = this.W;
    var x = ((t * 10) % (W + 160)) - 80;
    var y = 60 + Math.sin(t * 0.8) * 8;
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath(); ctx.ellipse(x, y, 12, 15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 5, y + 12); ctx.lineTo(x, y + 22); ctx.lineTo(x + 5, y + 12); ctx.stroke();
    ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 4, y + 22, 8, 5);
  },

  _drawBirds: function (ctx, t) {
    ctx.strokeStyle = 'rgba(60,70,90,.6)'; ctx.lineWidth = 1.5;
    for (var i = 0; i < 3; i++) {
      var bx = ((t * 22 + i * 130) % (this.W + 120)) - 60;
      var by = 70 + i * 18 + Math.sin(t * 3 + i) * 4;
      var f = 4 + Math.sin(t * 8 + i) * 2;
      ctx.beginPath(); ctx.moveTo(bx - 6, by); ctx.lineTo(bx, by - f); ctx.lineTo(bx + 6, by); ctx.stroke();
    }
  },

  // ---- ตัวละครผู้เล่น/บอท (ควบคุมเดินได้) ----
  //   ใช้ sprite เดิน 4 ทิศ (character1.png ผ่าน SC.sprite) ถ้าโหลดสำเร็จ · ไม่สำเร็จ → fallback วงกลม+emoji เดิม
  _drawActor: function (ctx, a, reading, t) {
    var moving = a.moving;
    // เดินจริงใช้ท่าขาสลับจาก sprite แทนแล้ว เหลือแค่ idle sway เบาๆ ตอนยืนนิ่ง (ไม่ทับกับแอนิเมชันเดิน)
    var bob = moving ? 0 : Math.sin((t || 0) * 2) * 1.5;
    var ay = a.y - bob;

    // เงา
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(a.x, a.y + 16, 16, 6, 0, 0, Math.PI * 2); ctx.fill();

    var sprite = SC.sprite, spriteH = 60, feetY = ay + 16, drewSprite = false;
    if (sprite.ready) {
      var frame = moving ? Math.floor((a.animT || 0) * sprite.fps) : 0;
      drewSprite = sprite.draw(ctx, a.x, feetY, a.dir || 'down', frame, spriteH, a.sheet); // a.sheet = ชีทย้อมสีตามดีไซน์
    }

    var headY; // ขอบบนสุดของตัวละคร (ไว้อ้างอิงวางป้ายชื่อ/วงแหวน)
    if (drewSprite) {
      headY = feetY - spriteH;
      // ป้ายอาชีพ (สี+emoji) ติดมุมล่างขวา — คงเอกลักษณ์สี/ไอคอนอาชีพไว้ แม้ทุกคนใช้กราฟิกตัวละครเดียวกัน
      var bx = a.x + 15, by = feetY + 2;
      ctx.fillStyle = a.color || '#4da3ff';
      ctx.beginPath(); ctx.arc(bx, by, 10, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
      ctx.textAlign = 'center'; ctx.font = '11px "Segoe UI Emoji"';
      ctx.fillText(a.emoji || '🙂', bx, by + 4);
    } else {
      // fallback: วงกลมสี + emoji (กรณีโหลด assets/character1.png ไม่สำเร็จ)
      ctx.fillStyle = a.color || '#4da3ff';
      ctx.beginPath(); ctx.arc(a.x, ay, 18, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
      ctx.textAlign = 'center'; ctx.font = '20px "Segoe UI Emoji"';
      ctx.fillText(a.emoji || '🙂', a.x, ay + 7);
      headY = ay - 18;
    }

    // ป้ายชื่อ
    if (a.label) {
      ctx.font = 'bold 12px "Segoe UI"';
      var tw = ctx.measureText(a.label).width + 14;
      ctx.fillStyle = 'rgba(14,19,32,.85)'; this._round(ctx, a.x - tw / 2, headY - 26, tw, 18, 8); ctx.fill();
      ctx.fillStyle = '#e7ecf5'; ctx.fillText(a.label, a.x, headY - 13);
    }
    // วงแหวนอ่านข้อมูล (progress)
    if (reading != null) {
      var rcy = drewSprite ? feetY - spriteH / 2 : ay, rr = drewSprite ? 34 : 26;
      ctx.lineWidth = 4; ctx.strokeStyle = '#f7c948';
      ctx.beginPath(); ctx.arc(a.x, rcy, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * reading); ctx.stroke();
    }
  },

  _drawBubble: function (ctx, bb) {
    ctx.font = '12px "Segoe UI"'; ctx.textAlign = 'center';
    var w = ctx.measureText(bb.text).width + 18, h = 22;
    var x = bb.x - w / 2, y = bb.y - h;
    var fill = bb.kind === 'good' ? 'rgba(54,211,153,.96)'
      : bb.kind === 'bad' ? 'rgba(247,107,107,.96)' : 'rgba(124,92,255,.96)';
    ctx.fillStyle = fill; this._round(ctx, x, y, w, h, 9); ctx.fill();
    ctx.beginPath(); ctx.moveTo(bb.x - 5, y + h); ctx.lineTo(bb.x + 5, y + h); ctx.lineTo(bb.x, y + h + 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0e1320'; ctx.fillText(bb.text, bb.x, y + 15);
  },
};

// derive ตึกข้อมูล walkable (4 ตึก interactive) จาก city
SC.map.buildings = SC.map.city.filter(function (b) { return b.interactive; });
// พิกัดโลกเริ่มต้นจาก fx,fy (ทำงานได้ทั้งโหมดรูปและ fallback) — override จาก 🎯 apply ตอน ensure()
SC.map.city.forEach(function (b) { b.x = b.fx * SC.map.W; b.y = b.fy * SC.map.H; });
