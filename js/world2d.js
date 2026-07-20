// ============================================================
// world2d.js — เอนจิน 2D บน canvas (แทนโลก 3D เดิม)
//   ให้ API กลาง SC.world เหมือนเดิม → turn.js เรียกใช้ได้โดยไม่ต้องแก้
//   วาดเมือง Investor City (map.js) + เดินได้จริง + ambient animation ตลอด
//   ข้อดี: เปิด index.html ตรงๆ ได้ (ไม่ต้องรัน local server เหมือน ES module 3D)
// ============================================================
(function () {
  var _now = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };

  var world = {
    ready: false,
    container: null, canvas: null, ctx: null,
    actor: null, statuses: {},
    keys: {}, locked: false, moving: false, calibrateOn: false, hoverId: null,
    target: null, playerPath: null, playerPathI: 0,
    _walkTargetId: null, arrivedId: null, // ตึกที่คลิกให้เดินไป → เซ็ต arrivedId เมื่อถึง (turn.js เปิดหน้าต่าง)
    botPath: null, botIndex: 1, botDwellUntil: 0,
    bubbles: [], _t: 0,

    // โหลดรูปแมป + สไปรต์ตึกทุกหลังที่มี img (trend ไม่มี — ใช้น้ำพุในรูป) + สไปรต์ตัวละคร แล้วค่อย ready
    //   แมปโหลดไม่ได้ = วาดเมืองเอง · สไปรต์ตึกโหลดไม่ได้ = จุดวงกลม fallback เฉพาะตึกข้อมูล
    ensure: function () {
      var self = this;
      if (!this._readyPromise) {
        var loads = [SC.sprite.load()];
        loads.push(new Promise(function (resolve) {
          if (SC.map.image) {
            var img = new Image();
            img.onload = function () { SC.map._img = img; resolve(); };
            img.onerror = function () { SC.map._img = null; resolve(); }; // fallback วาดเอง
            img.src = SC.map.image;
          } else { resolve(); }
        }));
        SC.map.city.forEach(function (b) {
          if (!b.img) return;
          loads.push(new Promise(function (resolve) {
            var img = new Image();
            img.onload = function () { b._img = img; b._aspect = img.width / img.height; resolve(); };
            img.onerror = function () { b._img = null; resolve(); };
            img.src = b.img;
          }));
          // สไปรต์ตึกปิดซ่อม (assets/events/tower_broken/<id>.png) — ไม่มีไฟล์ = ใช้ brightness 0.45 แทน
          if (b.id === 'gold') return; // gold ปิดไม่ได้
          loads.push(new Promise(function (resolve) {
            var bi = new Image();
            bi.onload = function () { b._brokenImg = bi; resolve(); };
            bi.onerror = function () { b._brokenImg = null; resolve(); };
            bi.src = 'assets/events/tower_broken/' + b.id + '.png';
          }));
        });
        this._readyPromise = Promise.all(loads).then(function () {
          SC.map.applyHotspots();
          self.ready = true;
        });
      }
      return this._readyPromise;
    },

    // โหมดปรับตำแหน่งตึกให้ตรงกับอาคารในรูป (คลิกวาง "ฐานตึก" ทีละหลัง → เก็บ localStorage)
    toggleCalibrate: function () {
      if (!SC.map._img) { SC.ui.toast('โหมดนี้ใช้กับแมปรูปภาพ — ต้องโหลด assets/map1.png สำเร็จก่อน', 'warn'); return; }
      this.calibrateOn = !this.calibrateOn;
      SC.map._calibrate = this.calibrateOn;
      if (this.calibrateOn) { SC.map._calIndex = 0; this.lockMovement(true); SC.ui.toast('🎯 คลิกวางฐานตึกทีละหลังตามลำดับ', ''); }
      else { this.lockMovement(false); SC.ui.toast('✅ บันทึกตำแหน่งตึกแล้ว', 'good'); }
    },

    mountInto: function (container) {
      this.container = container;
      // RS ไดนามิก: backing store ≥ ขนาดที่แสดงจริง (แมปเต็มจอแบบ cover = max(vw, vh×16/9)) × devicePixelRatio
      //   จอ 1080p DPR1 → 2 (เท่าเดิม) · แล็ปท็อป DPR 1.25-1.5 → 3 · จอ 2K/4K → 4 — กันภาพนุ่มจากการยืด canvas
      var dpr = window.devicePixelRatio || 1;
      var cssW = Math.max(window.innerWidth || 0, (window.innerHeight || 0) * (SC.map.W / SC.map.H));
      SC.map.RS = Math.max(2, Math.min(4, Math.ceil((cssW || SC.map.W * 2) * dpr / SC.map.W)));
      var RS = SC.map.RS;
      var canvas = document.createElement('canvas');
      // backing store = โลก logical × RS · CSS ย่อ/ขยายเอง (คลิกใช้ getBoundingClientRect ไม่ขึ้นกับ backing size)
      canvas.width = SC.map.W * RS; canvas.height = SC.map.H * RS;
      canvas.className = 'map-canvas';
      // แทรกเป็นลูกคนแรก เพื่อให้ overlay (ปุ่มเครื่องมือแมป ฯลฯ) อยู่บนสุด
      container.insertBefore(canvas, container.firstChild);
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in this.ctx) this.ctx.imageSmoothingQuality = 'high';
      this.bubbles = [];
    },

    setBuildings: function (statuses) { this.statuses = statuses || {}; },

    // person (optional) = ผู้เล่น/บอทเจ้าของเทิร์น — ใช้ดีไซน์ของ "คนนั้น" ย้อมสีชีท
    //   (บลัฟเปลี่ยนอาชีพที่อ้างได้ แต่หน้าตา/ชุดเป็นของตัวเองเสมอ)
    spawnActor: function (modelKey, person) {
      var id = String(modelKey).replace('Char_', '');
      var c = SC.getCharacter(id) || { emoji: '🙂', color: '#4da3ff' };
      var sheet = (person && person.design && SC.sprite.ready) ? SC.sprite.makeVariant(person.design) : null;
      this.actor = {
        x: SC.map.spawn.x, y: SC.map.spawn.y, emoji: c.emoji, color: c.color, label: null,
        sheet: sheet,
        moving: false, dir: 'down', animT: 0,
      };
      this.target = null; this.playerPath = null; this.moving = false; this.locked = false;
      this._walkTargetId = null; this.arrivedId = null;
    },

    // ----- input ผู้เล่น -----
    _worldXY: function (ev) {
      var r = this.canvas.getBoundingClientRect();
      var cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      var cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      return { x: (cx - r.left) / r.width * SC.map.W, y: (cy - r.top) / r.height * SC.map.H };
    },
    enablePlayerInput: function () {
      var el = this.canvas, self = this;
      this._onPoint = function (ev) {
        if (ev.cancelable) ev.preventDefault();
        var p = self._worldXY(ev), wx = p.x, wy = p.y;
        // โหมดปรับตำแหน่ง: คลิกวางฐานตึกปัจจุบันแล้วเลื่อนไปหลังถัดไป
        if (self.calibrateOn && SC.map._img) {
          var cb = SC.map.city[SC.map._calIndex];
          if (cb) { cb.x = wx; cb.y = wy; SC.map.saveHotspot(cb); SC.map._calIndex = (SC.map._calIndex + 1) % SC.map.city.length; }
          return;
        }
        if (self.locked) return;
        // 1) แตะตึกไหนก็ได้ → ตึกเด้งลอยขึ้นรับ แล้วตัวละครเดินไปหน้าตึก (L-shape ตามถนน)
        var tb = SC.map._img ? SC.map.towerAt(wx, wy) : null;
        if (!tb) { // โหมดวาดเอง: ใช้รัศมีจากจุดตึกเหมือนเดิม
          for (var i = 0; i < SC.map.city.length; i++) {
            var b = SC.map.city[i];
            if (SC.map.dist(wx, wy, b.x, b.y) <= SC.map.bw * 0.7) { tb = b; break; }
          }
        }
        if (tb) { tb._popT = self._t; self.walkPathTo(tb.id); return; }
        // 2) แตะพื้น → เดิน "ตามถนน" ไปจุดที่ใกล้จุดคลิกสุดบนผิวถนน (ห้ามตัดทะลุตึก 2026-07-18)
        var a2 = self.actor;
        self.target = null; self._walkTargetId = null;
        self.playerPath = SC.map.roadRouteToPoint(a2.x, a2.y, wx, wy);
        self.playerPathI = 0;
      };
      // hover ตึก (เดสก์ท็อป): เรืองแสง + cursor ชี้เท่านั้น (ไม่ยกตัว — ตึกลอยเฉพาะตอนคลิก)
      this._onMove = function (ev) {
        var p = self._worldXY(ev);
        var tb = SC.map._img ? SC.map.towerAt(p.x, p.y) : null;
        self.hoverId = tb ? tb.id : null;
        el.style.cursor = tb ? 'pointer' : '';
      };
      this._onKeyDown = function (e) { self.keys[e.key.toLowerCase()] = true; };
      this._onKeyUp = function (e) { self.keys[e.key.toLowerCase()] = false; };
      el.addEventListener('mousedown', this._onPoint);
      el.addEventListener('touchstart', this._onPoint, { passive: false });
      el.addEventListener('mousemove', this._onMove);
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);
    },
    disableInput: function () {
      var el = this.canvas;
      if (el && this._onPoint) { el.removeEventListener('mousedown', this._onPoint); el.removeEventListener('touchstart', this._onPoint); }
      if (el && this._onMove) { el.removeEventListener('mousemove', this._onMove); el.style.cursor = ''; }
      if (this._onKeyDown) { window.removeEventListener('keydown', this._onKeyDown); window.removeEventListener('keyup', this._onKeyUp); }
      this.keys = {}; this.hoverId = null;
    },

    lockMovement: function (b) { this.locked = b; if (b) this.target = null; },

    // เดินไปตึก "ตามถนนจริง" — เส้นทาง A* บน roadgrid (SC.map.roadRoute)
    //   จำ id ตึกเป้าหมายไว้ → เดินถึงปลายทางแล้วเซ็ต arrivedId (turn.js เอาไปเปิดหน้าต่างตึก)
    walkPathTo: function (id) {
      var b = SC.map.cityById(id); if (!b) return;
      var a = this.actor;
      this.target = null;
      this.playerPath = SC.map.roadRoute(a.x, a.y, id) || [{ x: b.x, y: b.y }];
      this.playerPathI = 0;
      this._walkTargetId = id;
    },

    // ดึง id ตึกที่เพิ่งเดินถึง (อ่านแล้วเคลียร์ — กันเปิดหน้าต่างซ้ำ)
    consumeArrival: function () {
      var id = this.arrivedId;
      this.arrivedId = null;
      return id;
    },

    bounceBuilding: function (id) { var b = SC.map.cityById(id); if (b) b._popT = this._t; },

    // เส้นทางบอท: ต่อ roadRoute ของแต่ละตึกเป็นทอดๆ — dwell (แวะพัก) เฉพาะจุดที่เป็น "ตึก"
    //   onArrive(buildingId) = callback ตอนเดินถึงตึกแต่ละหลัง (บอททำธุรกรรมตรงนี้ — ผู้เล่นเห็นแค่เส้นทาง)
    setBotPath: function (buildingIds, onArrive) {
      var sp = SC.map.spawn;
      var pts = [{ x: sp.x, y: sp.y, dwell: false }];
      var cur = { x: sp.x, y: sp.y };
      buildingIds.forEach(function (id) {
        var seg = SC.map.roadRoute(cur.x, cur.y, id);
        var b = SC.map.cityById(id);
        if (!seg) { if (b) seg = [{ x: b.x, y: b.y }]; else return; }
        seg.forEach(function (p, i) { pts.push({ x: p.x, y: p.y, dwell: i === seg.length - 1, bid: i === seg.length - 1 ? id : null }); });
        if (b) cur = { x: b.x, y: b.y };
      });
      this.botPath = pts;
      this.botIndex = 1; this.botDwellUntil = 0;
      this._botOnArrive = onArrive || null;
    },

    // บอทเดินครบทุกจุดในคิวแล้วหรือยัง (ใช้จบเทิร์นบอทแบบบีบเวลา — GAME_SPEC 7.5)
    botFinished: function () {
      return !this.botPath || this.botIndex >= this.botPath.length;
    },

    // ----- bubble -----
    addBubble: function (text, kind) {
      this.bubbles.push({ text: text, kind: kind || '', until: _now() + 2000 });
    },
    clearBubbles: function () { this.bubbles = []; },

    // ----- หนึ่งเฟรม -----
    tick: function (dt, mode) {
      this._t += dt;
      var a = this.actor; if (!a) return;
      var mv = { x: 0, y: 0 };

      if (mode === 'player' && !this.locked) {
        var vx = 0, vy = 0;
        if (this.keys['arrowup'] || this.keys['w']) vy -= 1;
        if (this.keys['arrowdown'] || this.keys['s']) vy += 1;
        if (this.keys['arrowleft'] || this.keys['a']) vx -= 1;
        if (this.keys['arrowright'] || this.keys['d']) vx += 1;
        var freeMove = false;
        if (vx || vy) {
          this.target = null; this.playerPath = null; this._walkTargetId = null; // เดินเองยกเลิกเป้าตึก
          var m = Math.hypot(vx, vy); mv = { x: vx / m, y: vy / m };
          freeMove = true; // WASD = โดน clamp ให้อยู่ในแนวถนน (_step)
        } else if (this.playerPath && this.playerPath.length) {
          var wp = this.playerPath[this.playerPathI];
          var dx = wp.x - a.x, dy = wp.y - a.y, d = Math.hypot(dx, dy);
          if (d > 6) mv = { x: dx / d, y: dy / d };
          else {
            this.playerPathI++;
            if (this.playerPathI >= this.playerPath.length) {
              this.playerPath = null;
              // เดินครบเส้นทางที่คลิกตึกไว้ → แจ้ง arrival ให้ turn.js เปิดหน้าต่างตึกนั้น
              if (this._walkTargetId) { this.arrivedId = this._walkTargetId; this._walkTargetId = null; }
            }
          }
        } else if (this.target) {
          var tx = this.target.x - a.x, ty = this.target.y - a.y, td = Math.hypot(tx, ty);
          if (td > 4) mv = { x: tx / td, y: ty / td }; else this.target = null;
        }
        var spd = SC.config.walkSpeed * (SC.events ? SC.events.speed() : 1);
        this._step(a, mv, spd * dt, freeMove);
      } else if (mode === 'bot') {
        var t = _now();
        if (t >= this.botDwellUntil && this.botPath && this.botIndex < this.botPath.length) {
          var tg = this.botPath[this.botIndex], bx = tg.x - a.x, by = tg.y - a.y, bd = Math.hypot(bx, by);
          // แวะพักเฉพาะจุดหมายที่เป็นตึก (dwell) — โหนดถนนระหว่างทางเดินผ่านเลย
          if (bd <= 6) {
            this.botDwellUntil = tg.dwell ? t + 600 : t;
            if (tg.dwell && tg.bid && this._botOnArrive) this._botOnArrive(tg.bid);
            this.botIndex++;
          }
          else { mv = { x: bx / bd, y: by / bd }; this._step(a, mv, SC.config.botWalkSpeed * (SC.events ? SC.events.speed() : 1) * dt); }
        }
      }

      a.moving = !!(mv.x || mv.y);

      // ทิศทางที่หัน + เฟรมเดิน (ใช้กับ sprite ใน map.js) — หันตามแกนที่ขยับมากกว่า, ค้างทิศเดิมตอนหยุด
      if (a.moving) {
        a.dir = Math.abs(mv.x) > Math.abs(mv.y) ? (mv.x < 0 ? 'left' : 'right') : (mv.y < 0 ? 'up' : 'down');
        a.animT += dt;
      } else {
        a.animT = 0;
      }

      // prune bubbles + สร้าง list สำหรับวาด (ซ้อนเหนือหัว actor)
      var tnow = _now(), stack = [];
      this.bubbles = this.bubbles.filter(function (b) { return b.until > tnow; });
      for (var i = 0; i < this.bubbles.length; i++) {
        stack.push({ text: this.bubbles[i].text, kind: this.bubbles[i].kind, x: a.x, y: a.y - 44 - (this.bubbles.length - 1 - i) * 26 });
      }

      // เรนเดอร์ในพิกัด logical เหมือนเดิม แต่สเกลขึ้น RS เท่า → เต็ม backing store ความละเอียดสูง
      var RS = SC.map.RS || 1;
      this.ctx.setTransform(RS, 0, 0, RS, 0, 0);
      this.ctx.clearRect(0, 0, SC.map.W, SC.map.H);
      SC.map.drawScene(this.ctx, {
        t: this._t, dt: dt, statuses: this.statuses, actor: a, target: this.target,
        bubbles: stack, hover: this.hoverId,
      });
    },

    // clampRoad = เดินเอง (WASD): บังคับอยู่บนผิวถนน (SC.map.isRoad) — เส้นทางคลิก (playerPath/botPath)
    //   ไม่ clamp เพราะ A* วิ่งบนถนนอยู่แล้ว + ช่วงสุดท้ายเข้าฐานตึกตั้งใจออกนอกถนน
    _step: function (a, mv, sp, clampRoad) {
      var nx = a.x + mv.x * sp, ny = a.y + mv.y * sp;
      if (clampRoad && (mv.x || mv.y) && !SC.map.isRoad(nx, ny)) {
        // ถนนแมปนี้ส่วนใหญ่เป็นแนวทแยง — ลองไถลทิศหมุน ±45° ก่อน แล้วค่อยไถลตามแกน
        var C = 0.7071, ok = false;
        var cands = [
          { x: (mv.x - mv.y) * C, y: (mv.x + mv.y) * C },   // หมุน +45°
          { x: (mv.x + mv.y) * C, y: (mv.y - mv.x) * C },   // หมุน −45°
          { x: mv.x, y: 0 }, { x: 0, y: mv.y },
        ];
        for (var ci = 0; ci < cands.length; ci++) {
          var cx = a.x + cands[ci].x * sp, cy = a.y + cands[ci].y * sp;
          if ((cands[ci].x || cands[ci].y) && SC.map.isRoad(cx, cy)) { nx = cx; ny = cy; ok = true; break; }
        }
        if (!ok) {
          // ดูดกลับเข้าเซลล์ถนนใกล้จุดที่อยากไป (กันติดตายตามขอบเฉียง/มุมเซลล์)
          var pr = SC.map.nearestRoadPoint(nx, ny);
          if (pr.d > 0 && pr.d <= 14) { nx = pr.x; ny = pr.y; }
          else if (SC.map.isRoad(a.x, a.y)) { nx = a.x; ny = a.y; } // ชนขอบ — หยุด
          else {
            // ยืนนอกถนนอยู่ (เช่นหน้าตึกหลังปิดหน้าต่าง) — ยอมเฉพาะก้าวที่พาเข้าใกล้ถนน
            var cd = SC.map.nearestRoadPoint(a.x, a.y).d;
            var nd = SC.map.nearestRoadPoint(nx, ny).d;
            if (nd >= cd) { nx = a.x; ny = a.y; }
          }
        }
      }
      a.x = Math.max(40, Math.min(SC.map.W - 20, nx));
      a.y = Math.max(100, Math.min(SC.map.H - 22, ny));
    },
  };

  SC.world = world;
})();
