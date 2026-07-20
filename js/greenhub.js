// ============================================================
// greenhub.js — โมดูล "Startup Hub × Green Invest" (ตาม greenhub-founder-mode-gdd.md v0.2)
//   MVP ในเกมหลัก: ธุรกิจคาเฟ่ตัวเดียว · กระเป๋าธุรกิจแยกจากเงินสดเกมหลัก (GDD หมวด 16 ข้อ 1)
//   1 สัปดาห์เกมหลัก = 1 เดือน (เทิร์น) ของฮับ — advanceTurn() ถูกเรียกจาก resolve.js
//   สูตรหลักตาม GDD หมวด 12 · เกณฑ์ใบรับรอง 85/65/45/25 (GDD หมวด 8)
// ============================================================

// ---------- แคตตาล็อกลงทุนกรีน (GDD หมวด 7 — คัดชุดที่คาเฟ่ใช้ได้จริง) ----------
//   cat: energy/material/waste/transport/people · reduce: ลดภายในหมวด (ซ้อนแบบคูณ)
//   perTurn: ค่าใช้จ่ายรายเทิร์น (สัญญาเช่า) · fixedSave: ลดค่าใช้จ่ายคงที่/เทิร์น
//   extraIncome: รายได้เสริม/เทิร์น · needs: ต้องมีไอเท็มนี้ก่อน
// * ตัวเลขสเกลเดียวกับเกมหลัก (เงินเริ่ม ฿10,000) — user สั่งรวมกระเป๋าเงิน 2026-07-13 (เดิม ×~50)
SC.greenCatalog = [
  // ⚡ พลังงาน
  { id: 'led',       cat: 'energy',    tier: 1, name: 'หลอดไฟ LED ทั้งร้าน',   icon: '💡', price: 100,  reduce: 0.08, fixedSave: 20, benefit: 'ค่าไฟลดลง ฿20/เทิร์น · คืนทุนไว' },
  { id: 'inverter',  cat: 'energy',    tier: 2, name: 'แอร์/ตู้เย็น Inverter',  icon: '🌡️', price: 400, reduce: 0.15, fixedSave: 60, benefit: 'ค่าไฟลดลง ฿60/เทิร์น' },
  { id: 'solarRent', cat: 'energy',    tier: 2, name: 'เช่าโซลาร์รวมของฮับ',    icon: '☀️', price: 0, perTurn: 160, reduce: 0.30, fixedSave: 100, benefit: 'ค่าไฟลดลง ฿100/เทิร์น · ยกเลิกได้', excludes: 'solarOwn' },
  { id: 'solarOwn',  cat: 'energy',    tier: 3, name: 'โซลาร์เซลล์ของตัวเอง',   icon: '🔆', price: 1600, reduce: 0.45, fixedSave: 160, extraIncome: 20, benefit: 'ค่าไฟลดลง ฿160/เทิร์น + ขายไฟคืนฮับ ฿20', excludes: 'solarRent' },
  { id: 're100',     cat: 'energy',    tier: 3, name: 'สัญญาไฟสะอาด RE100',     icon: '🌬️', price: 0, perTurn: 120, reduce: 0, lockEnergy: 5, benefit: 'ล็อกหมวดพลังงานเหลือ 5 จุด · เงื่อนไขใบ Lv.4' },
  // ♻️ ของเสีย
  { id: 'bins',      cat: 'waste',     tier: 1, name: 'ถังแยกขยะ + อบรมพนักงาน', icon: '🗑️', price: 80,  reduce: 0.10, fixedSave: 10,  benefit: 'ค่าขนขยะลดลง ฿10/เทิร์น' },
  { id: 'compost',   cat: 'waste',     tier: 2, name: 'ถังหมักปุ๋ย',            icon: '🌱', price: 300, reduce: 0.20, extraIncome: 30, benefit: 'ขายปุ๋ยให้ฟาร์มในฮับ +฿30/เทิร์น' },
  { id: 'byproduct', cat: 'waste',     tier: 2, name: 'ดีลของเหลือ → ฟาร์มเห็ด', icon: '🤝', price: 0,     reduce: 0.15, extraIncome: 30, needs: 'bins', benefit: 'รายได้เสริม +฿30/เทิร์น (ต้องมีถังแยกขยะ)' },
  // 📦 วัสดุ
  { id: 'bagasse',   cat: 'material',  tier: 1, name: 'แพ็กเกจชานอ้อย/กระดาษ',  icon: '🥡', price: 60,  reduce: 0.12, baseBoost: 0.05, benefit: 'ลูกค้าสายกรีน ฐานลูกค้า +5%' },
  { id: 'byo',       cat: 'material',  tier: 1, name: 'ส่วนลดนำภาชนะมาเอง',    icon: '🛍️', price: 40,  reduce: 0.08, benefit: 'ลูกค้าประจำเหนียวขึ้น' },
  { id: 'deposit',   cat: 'material',  tier: 2, name: 'ระบบภาชนะมัดจำ-คืน',    icon: '🔄', price: 360, reduce: 0.20, baseBoost: 0.10, benefit: 'ซื้อซ้ำ +10%' },
  { id: 'scaudit',   cat: 'material',  tier: 3, name: 'ตรวจรับรอง Supply Chain', icon: '📜', price: 500, reduce: 0.20, benefit: 'เงื่อนไขบังคับใบ Lv.4' },
  // 🚚 ขนส่ง
  { id: 'routing',   cat: 'transport', tier: 1, name: 'ซอฟต์แวร์รวมรอบส่ง',     icon: '📅', price: 120, reduce: 0.12, fixedSave: 20, benefit: 'ค่าส่งลดลง ฿20/เทิร์น' },
  { id: 'ebike',     cat: 'transport', tier: 1, name: 'จักรยานไฟฟ้าส่งใกล้',    icon: '🚲', price: 240, reduce: 0.15, benefit: 'ค่าส่งโซนใกล้ = 0' },
  { id: 'evshare',   cat: 'transport', tier: 2, name: 'แชร์รถ EV กับเพื่อนบ้าน', icon: '⚡', price: 0, perTurn: 80, reduce: 0.20, benefit: 'ถูกกว่าซื้อรถเอง · ส่งตามรอบเวลา' },
  // 👥 คน & ระบบ (ตัวคูณ/เงื่อนไขใบ)
  { id: 'officer',   cat: 'people',    tier: 2, name: 'Sustainability Officer', icon: '👩‍💼', price: 0, perTurn: 120, benefit: 'โอกาสดราม่า −50% · เงื่อนไขใบ Lv.3' },
  { id: 'tracking',  cat: 'people',    tier: 2, name: 'ซอฟต์แวร์ Carbon Tracking', icon: '💻', price: 200, benefit: 'มิเตอร์เป็นเลขจริง · เงื่อนไขใบ Lv.3' },
];

// ---------- ธุรกิจเริ่มต้น 4 แบบ (เลือกตอนเทิร์นแรก — user 2026-07-13) ----------
//   base = footprint รายหมวด (ผลรวม = คาร์บอนตั้งต้น · ฟาร์มต่ำสุด) · startCost หักจากเงินสดหลัก
SC.hubBusinesses = [
  { id: 'cafe',       name: 'คาเฟ่',      icon: '☕', unit: 'แก้ว', startCost: 800,  base: { energy: 40, material: 30, waste: 20, transport: 10 }, custBase: 120, capacity: 200, profitPerUnit: 4, fixed: 380, desc: 'ทุนต่ำ กำไร/ชิ้นน้อย ลูกค้าเยอะ' },
  { id: 'restaurant', name: 'ร้านอาหาร',  icon: '🍜', unit: 'จาน', startCost: 1400, base: { energy: 35, material: 25, waste: 50, transport: 15 }, custBase: 80,  capacity: 140, profitPerUnit: 9, fixed: 560, desc: 'ทุนกลาง กำไร/ชิ้นสูง ของเสียเยอะ' },
  { id: 'retail',     name: 'ค้าปลีก',    icon: '🏪', unit: 'ชิ้น', startCost: 2000, base: { energy: 30, material: 45, waste: 20, transport: 25 }, custBase: 260, capacity: 420, profitPerUnit: 2, fixed: 460, desc: 'ทุนสูง มาร์จิ้นบาง วอลุ่มมาก' },
  { id: 'farm',       name: 'ฟาร์ม',      icon: '🌾', unit: 'กก.', startCost: 1200, base: { energy: 15, material: 12, waste: 18, transport: 20 }, custBase: 90,  capacity: 160, profitPerUnit: 6, fixed: 440, desc: 'คาร์บอนต่ำอยู่แล้ว รายได้นิ่ง' },
];

// ---------- อัปเกรดสายธุรกิจ (GDD หมวด 5.1 — คาเฟ่) ----------
SC.hubUpgrades = [
  { id: 'machine2', name: 'เครื่อง/สายผลิตตัวที่ 2', icon: '⚙️', price: 600,  effect: 'เพดานผลิต +150 ชิ้น',            capAdd: 150 },
  { id: 'barista',  name: 'จ้างพนักงานเพิ่ม',        icon: '🧑‍🍳', price: 0, perTurn: 120, effect: 'เพดานผลิต +80 ชิ้น + เมนูพิเศษ', capAdd: 80 },
  { id: 'decor',    name: 'ตกแต่งร้านใหม่',          icon: '🛋️', price: 400,  effect: 'ชื่อเสียง +10 · ฐานลูกค้า +10%',  repAdd: 10, baseBoost: 0.10 },
  { id: 'menu',     name: 'ออกสินค้าซิกเนเจอร์',     icon: '🍮', price: 200,  effect: 'กำไร/ชิ้น +฿2',                  profitAdd: 2 },
  { id: 'branch',   name: 'สาขาที่ 2 (ปลายเกม)',     icon: '🏪', price: 3000, effect: 'ฐานลูกค้า ×1.8 · fixed +฿300',    baseMult: 1.8, fixedAdd: 300 },
];

// ---------- บันไดใบรับรอง → ตลาด (GDD หมวด 8 · ค่าธรรมเนียมสเกลเกมหลัก) ----------
SC.hubCerts = [
  { lv: 1, name: 'ใบรับรองกรีนของฮับ', market: 'ตลาดนัดกรีน',   icon: '🌿', idx: 85, fee: 100,  needItems: 2,  effect: 'ฐานลูกค้า +25%',  eyes: 30 },
  { lv: 2, name: 'ฉลากเขียว (รัฐ)',    market: 'ห้างสรรพสินค้า', icon: '🏬', idx: 65, fee: 300,  needCats: 3,   effect: 'ฐานลูกค้า ×2',     eyes: 55 },
  { lv: 3, name: 'ฉลากคาร์บอน',        market: 'ตลาด B2B',      icon: '🤝', idx: 45, fee: 600,  needs: ['officer', 'tracking'], needEnergy: true, effect: 'ออเดอร์คงที่ +฿400/เทิร์น', eyes: 75 },
  { lv: 4, name: 'มาตรฐานสากล',        market: 'ตลาดส่งออก',    icon: '🌍', idx: 25, fee: 1200, needs: ['scaudit', 're100'], needCats: 4, effect: 'ราคาขาย +30%', eyes: 100 },
];

SC.greenhub = {
  // ---------- init (lazy) ----------
  //   * เงินธุรกิจ = เงินสดหลัก (player.cash) — ไม่มีกระเป๋าแยกแล้ว (user 2026-07-13)
  //   * ยังไม่เลือกธุรกิจ (biz=null) จนกว่าจะกดเลือกที่ Startup — advanceTurn ข้ามถ้ายังไม่เริ่ม
  ensure: function () {
    var s = SC.state; if (!s) return null;
    if (!s.greenhub) {
      s.greenhub = {
        biz: null, name: '', icon: '🏢', unit: 'ชิ้น', level: 1, xp: 0,
        turn: 1,
        ap: 2, apMax: 2,
        base: null, custBase: 0, capacity: 0, profitPerUnit: 0, fixed: 0,
        rep: 0, eyes: 20,                   // ชื่อเสียง / สายตาสังคม (ตลาดชุมชน = 20)
        items: {}, upgrades: {},
        certLv: 0,
        news: [],
        lastReport: null,
        salesPenalty: 0,                    // เทิร์นที่เหลือของผลข่าวลบ (ยอด −15%)
      };
    }
    return s.greenhub;
  },
  hasBiz: function () { var g = this.ensure(); return !!(g && g.biz); },

  // เลือก/เปิดธุรกิจครั้งแรก — หักทุนตั้งต้นจากเงินสดหลัก
  startBusiness: function (id) {
    var g = this.ensure(), p = SC.state.player;
    if (g.biz) return { ok: false, msg: 'เริ่มธุรกิจไปแล้ว' };
    var b = SC.hubBusinesses.find(function (x) { return x.id === id; });
    if (!b) return { ok: false, msg: 'ไม่พบธุรกิจ' };
    if (p.cash < b.startCost) return { ok: false, msg: 'เงินสดไม่พอเปิด' + b.name + ' (ต้อง ' + SC.ui.money(b.startCost) + ')' };
    p.cash -= b.startCost;
    g.biz = b.id; g.name = b.name + 'ของฉัน'; g.icon = b.icon; g.unit = b.unit;
    g.base = { energy: b.base.energy, material: b.base.material, waste: b.base.waste, transport: b.base.transport };
    g.custBase = b.custBase; g.capacity = b.capacity; g.profitPerUnit = b.profitPerUnit; g.fixed = b.fixed;
    g.news = [{ turn: 1, icon: b.icon, text: 'เปิด' + b.name + '! ลงทุนตั้งต้น ' + SC.ui.money(b.startCost) + ' (หักจากเงินสด) · ตลาดชุมชนเปิดขายได้เลย' }];
    if (SC.ui.renderHUD) SC.ui.renderHUD();
    return { ok: true, biz: b };
  },

  catName: { energy: '⚡ พลังงาน', material: '📦 วัสดุ', waste: '♻️ ของเสีย', transport: '🚚 ขนส่ง', people: '👥 คน & ระบบ' },

  // ---------- ค่าอนุพันธ์ (สูตร GDD หมวด 12) ----------
  // ดัชนี CO₂/หน่วย = Σ ทุกหมวด [คะแนนฐานหมวด × Π(1 − %ลดของไอเท็มในหมวด)]
  carbonIdx: function () {
    var g = this.ensure(), self = this, total = 0;
    if (!g.base) return 0;
    ['energy', 'material', 'waste', 'transport'].forEach(function (cat) {
      var v = g.base[cat];
      SC.greenCatalog.forEach(function (it) {
        if (g.items[it.id] && it.cat === cat && it.reduce) v *= (1 - it.reduce);
      });
      if (cat === 'energy' && g.items.re100) v = Math.min(v, 5); // RE100 ล็อกพลังงานเหลือ 5 จุด
      total += v;
    });
    return total; // เริ่ม 100 → ต่ำ = สะอาด
  },
  footprint: function () { // แตกรายหมวด (โดนัท Green Invest)
    var g = this.ensure(), out = { energy: 0, material: 0, waste: 0, transport: 0 };
    if (!g.base) return out;
    ['energy', 'material', 'waste', 'transport'].forEach(function (cat) {
      var v = g.base[cat];
      SC.greenCatalog.forEach(function (it) {
        if (g.items[it.id] && it.cat === cat && it.reduce) v *= (1 - it.reduce);
      });
      if (cat === 'energy' && g.items.re100) v = Math.min(v, 5);
      out[cat] = v;
    });
    return out;
  },
  custMult: function () { // ตัวคูณตลาด + บูสต์ฐานลูกค้าจากไอเท็ม/อัปเกรด
    var g = this.ensure(), m = 1;
    if (g.certLv >= 1) m *= 1.25;
    if (g.certLv >= 2) m *= 2;
    SC.greenCatalog.forEach(function (it) { if (g.items[it.id] && it.baseBoost) m *= (1 + it.baseBoost); });
    SC.hubUpgrades.forEach(function (u) {
      if (g.upgrades[u.id]) {
        if (u.baseBoost) m *= (1 + u.baseBoost);
        if (u.baseMult) m *= u.baseMult;
      }
    });
    if (SC.events) m *= SC.events.custMult(g.biz);   // เหตุการณ์ custMult (ท่องเที่ยว/เทศกาล/อินฟลู ฯลฯ)
    return m;
  },
  curCapacity: function () {
    var g = this.ensure(), c = g.capacity;
    SC.hubUpgrades.forEach(function (u) { if (g.upgrades[u.id] && u.capAdd) c += u.capAdd; });
    return c;
  },
  curProfitPerUnit: function () {
    var g = this.ensure(), p = g.profitPerUnit;
    SC.hubUpgrades.forEach(function (u) { if (g.upgrades[u.id] && u.profitAdd) p += u.profitAdd; });
    return p;
  },
  curFixed: function () { // ค่าใช้จ่ายคงที่หลังหักส่วนลดไอเท็มกรีน + สัญญารายเทิร์น
    var g = this.ensure(), f = g.fixed;
    SC.hubUpgrades.forEach(function (u) { if (g.upgrades[u.id] && u.fixedAdd) f += u.fixedAdd; });
    var save = 0, per = 0;
    SC.greenCatalog.forEach(function (it) {
      if (!g.items[it.id]) return;
      if (it.fixedSave) save += it.fixedSave;
      if (it.perTurn) per += it.perTurn;
    });
    SC.hubUpgrades.forEach(function (u) { if (g.upgrades[u.id] && u.perTurn) per += u.perTurn; });
    var base = Math.max(40, f - save) + per;   // พื้นค่าใช้จ่ายขั้นต่ำ (สเกลเกมหลัก — เดิม 2000)
    if (SC.events) base *= SC.events.fixedMult();   // เหตุการณ์ supplierHike ×1.25
    return base;
  },
  extraIncome: function () {
    var g = this.ensure(), v = 0;
    SC.greenCatalog.forEach(function (it) { if (g.items[it.id] && it.extraIncome) v += it.extraIncome; });
    return v;
  },
  expectedSales: function () { // ยอดขายคาด/เทิร์น = min(ฐาน×ตลาด×(1+ชื่อเสียง/500), เพดาน)
    var g = this.ensure();
    var mult = (g.salesPenalty > 0 ? 0.85 : 1);
    return Math.min(g.custBase * this.custMult() * (1 + g.rep / 500) * mult, this.curCapacity());
  },
  dramaChance: function () { // GDD 10.1 (ไม่มีธง greenwash ใน MVP — ไม่มีระบบ Claims)
    return Math.min(0.45, 0.15 * (this.carbonIdx() / 100) * (this.ensure().eyes / 100));
  },
  greenBenefit: function () { // ผลประโยชน์กรีนรวม/เทิร์น (โชว์แถบล่าง Green Invest)
    var g = this.ensure(), v = this.extraIncome();
    SC.greenCatalog.forEach(function (it) { if (g.items[it.id] && it.fixedSave) v += it.fixedSave; });
    return v;
  },

  // ---------- ตลาด (ผูกใบรับรอง) ----------
  markets: function () {
    var g = this.ensure();
    var rows = [{ name: 'ตลาดชุมชน', icon: '🧺', need: null, eyes: 20, effect: 'ฐานลูกค้า ×1', open: true }];
    SC.hubCerts.forEach(function (c) {
      rows.push({ name: c.market, icon: c.icon, need: c, eyes: c.eyes, effect: c.effect, open: g.certLv >= c.lv });
    });
    return rows;
  },

  // เช็คเงื่อนไขใบถัดไป → { cert, ok, checks:[{label, pass}] }
  nextCert: function () {
    var g = this.ensure();
    if (g.certLv >= SC.hubCerts.length) return null;
    var c = SC.hubCerts[g.certLv];
    var idx = this.carbonIdx();
    var checks = [];
    checks.push({ label: 'ดัชนีคาร์บอน ≤ ' + c.idx + '% (ตอนนี้ ' + idx.toFixed(1) + '%)', pass: idx <= c.idx });
    if (c.needItems) {
      var n = Object.keys(g.items).length;
      checks.push({ label: 'อัปเกรดกรีน ≥ ' + c.needItems + ' ชิ้น (มี ' + n + ')', pass: n >= c.needItems });
    }
    if (c.needCats) {
      var cats = {};
      SC.greenCatalog.forEach(function (it) { if (g.items[it.id] && it.reduce) cats[it.cat] = true; });
      var nc = Object.keys(cats).length;
      checks.push({ label: 'ครอบคลุม ≥ ' + c.needCats + ' หมวด (มี ' + nc + ')', pass: nc >= c.needCats });
    }
    if (c.needEnergy) checks.push({ label: 'มีพลังงานสะอาด (โซลาร์เอง หรือ RE100)', pass: !!(g.items.solarOwn || g.items.re100) });
    if (c.needs) c.needs.forEach(function (idIt) {
      var it = SC.greenCatalog.find(function (x) { return x.id === idIt; });
      checks.push({ label: 'มี ' + it.name, pass: !!g.items[idIt] });
    });
    checks.push({ label: 'ค่าสมัคร ' + SC.ui.money(c.fee), pass: SC.state.player.cash >= c.fee });
    return { cert: c, ok: checks.every(function (x) { return x.pass; }), checks: checks };
  },

  // ---------- แอ็กชันผู้เล่น (ใช้ 1 AP ต่อครั้ง — GDD หมวด 9) ----------
  _spendAp: function () {
    var g = this.ensure();
    if (g.ap <= 0) return false;
    g.ap--; return true;
  },

  // ตึกสตาร์ทอัพถูกปิด (อุกกาบาต) → ใช้ AP ไม่ได้ระหว่างปิด (รายได้ยังเข้า)
  apLocked: function () { return !!(SC.events && SC.events.apLocked()); },

  buyItem: function (id) {
    var g = this.ensure(), p = SC.state.player;
    if (!g.biz) return { ok: false, msg: 'ยังไม่ได้เริ่มธุรกิจ' };
    if (this.apLocked()) return { ok: false, msg: '☄️ สตาร์ทอัพฮับปิดซ่อม — ใช้ AP ไม่ได้ชั่วคราว' };
    var it = SC.greenCatalog.find(function (x) { return x.id === id; });
    if (!it || g.items[id]) return { ok: false, msg: 'มีไอเท็มนี้แล้ว' };
    if (it.needs && !g.items[it.needs]) return { ok: false, msg: 'ต้องมี ' + SC.greenCatalog.find(function (x) { return x.id === it.needs; }).name + ' ก่อน' };
    if (it.excludes && g.items[it.excludes]) return { ok: false, msg: 'ซ้ำซ้อนกับของที่มีอยู่' };
    if (it.price > p.cash) return { ok: false, msg: 'เงินสดไม่พอ' };
    if (g.ap <= 0) return { ok: false, msg: 'Action Point หมด — รอเทิร์นถัดไป' };
    g.ap--;
    p.cash -= it.price;
    if (SC.ui.renderHUD) SC.ui.renderHUD();
    g.items[id] = true;
    if (id === 'solarOwn' && g.items.solarRent) delete g.items.solarRent; // ซื้อเองแล้วยกเลิกเช่า
    this._push('🛒', 'ติดตั้ง "' + it.name + '" — ดัชนีคาร์บอนเหลือ ' + this.carbonIdx().toFixed(1) + '%');
    return { ok: true };
  },

  buyUpgrade: function (id) {
    var g = this.ensure(), p = SC.state.player;
    if (!g.biz) return { ok: false, msg: 'ยังไม่ได้เริ่มธุรกิจ' };
    if (this.apLocked()) return { ok: false, msg: '☄️ สตาร์ทอัพฮับปิดซ่อม — ใช้ AP ไม่ได้ชั่วคราว' };
    var u = SC.hubUpgrades.find(function (x) { return x.id === id; });
    if (!u || g.upgrades[id]) return { ok: false, msg: 'อัปเกรดนี้แล้ว' };
    if (u.price > p.cash) return { ok: false, msg: 'เงินสดไม่พอ' };
    if (g.ap <= 0) return { ok: false, msg: 'Action Point หมด — รอเทิร์นถัดไป' };
    g.ap--;
    p.cash -= u.price;
    if (SC.ui.renderHUD) SC.ui.renderHUD();
    g.upgrades[id] = true;
    if (u.repAdd) g.rep = Math.min(100, g.rep + u.repAdd);
    this._push('🔧', 'อัปเกรด "' + u.name + '" สำเร็จ');
    return { ok: true };
  },

  applyCert: function () {
    var g = this.ensure(), p = SC.state.player;
    if (!g.biz) return { ok: false, msg: 'ยังไม่ได้เริ่มธุรกิจ' };
    if (this.apLocked()) return { ok: false, msg: '☄️ สตาร์ทอัพฮับปิดซ่อม — ใช้ AP ไม่ได้ชั่วคราว' };
    var nc = this.nextCert();
    if (!nc) return { ok: false, msg: 'ได้ใบสูงสุดแล้ว' };
    if (!nc.ok) return { ok: false, msg: 'เงื่อนไขยังไม่ครบ — ดู checklist' };
    if (g.ap <= 0) return { ok: false, msg: 'Action Point หมด — รอเทิร์นถัดไป' };
    g.ap--;
    p.cash -= nc.cert.fee;
    if (SC.ui.renderHUD) SC.ui.renderHUD();
    g.certLv = nc.cert.lv;
    g.eyes = Math.max(g.eyes, nc.cert.eyes);
    this._push('🏅', 'ผ่าน audit! ได้ "' + nc.cert.name + '" → ปลดล็อก' + nc.cert.market + ' (' + nc.cert.effect + ')');
    return { ok: true, cert: nc.cert };
  },

  _push: function (icon, text) {
    var g = this.ensure();
    g.news.unshift({ turn: g.turn, icon: icon, text: text });
    if (g.news.length > 14) g.news.pop();
  },

  // ---------- ปิดเดือน (เรียกจาก resolve.js ทุกสัปดาห์เกมหลัก) ----------
  advanceTurn: function () {
    var g = this.ensure();
    if (!g.biz) return;                 // ยังไม่ได้เริ่มธุรกิจ = ไม่มีรายรับ/รายจ่าย
    var p = SC.state.player;
    var sales = Math.round(this.expectedSales());
    var b2b = g.certLv >= 3 ? 400 : 0;
    var priceBoost = g.certLv >= 4 ? 1.30 : 1;
    var income = sales * this.curProfitPerUnit() * priceBoost + this.extraIncome() + b2b;
    var profit = Math.round(income - this.curFixed());
    p.cash += profit;                   // กำไร/ขาดทุนเข้า-ออกเงินสดหลักโดยตรง
    g.custBase = Math.round(g.custBase * 1.03); // โตธรรมชาติ +3%/เทิร์น
    if (g.salesPenalty > 0) g.salesPenalty--;

    // เฟสเหตุการณ์ (GDD หมวด 10 — ชุดย่อ)
    var idx = this.carbonIdx();
    if (Math.random() < this.dramaChance()) {
      var evs = [
        { icon: '📢', text: 'ม็อบเล็กๆ ประท้วงหน้าร้านเรื่องขยะ — ยอดขายเทิร์นหน้า −15%', pen: 2, rep: -10 },
        { icon: '#️⃣', text: 'ติดแฮชแท็กร้านไม่กรีนในโซเชียล — ชื่อเสียง −15', pen: 1, rep: -15 },
        { icon: '🗑️', text: 'ลูกค้ารีวิวขยะล้นหลังร้าน — ชื่อเสียง −8', pen: 1, rep: -8 },
      ];
      var ev = evs[Math.floor(Math.random() * evs.length)];
      if (g.items.officer) ev = { icon: ev.icon, text: ev.text + ' (Officer ช่วยลดผลกระทบครึ่งหนึ่ง)', pen: Math.ceil(ev.pen / 2), rep: Math.round(ev.rep / 2) };
      g.rep = Math.max(-100, g.rep + ev.rep);
      g.salesPenalty = Math.max(g.salesPenalty, ev.pen);
      this._push(ev.icon, ev.text);
    } else if ((idx <= 60 || g.rep >= 20) && Math.random() < 0.25) {
      var pos = [
        { icon: '🤳', text: 'Influencer สายกรีนรีวิวร้านให้ฟรี — ชื่อเสียง +10', rep: 10 },
        { icon: '📈', text: 'กระแส ESG บูม ลูกค้าแวะร้านเพิ่ม — ฐานลูกค้า +3%', base: 1.03 },
        { icon: '🎤', text: 'ฮับเชิญขึ้นเวที showcase — ชื่อเสียง +15', rep: 15 },
      ];
      var pv = pos[Math.floor(Math.random() * pos.length)];
      if (pv.rep) g.rep = Math.min(100, g.rep + pv.rep);
      if (pv.base) g.custBase = Math.round(g.custBase * pv.base);
      this._push(pv.icon, pv.text);
    }

    g.lastReport = { turn: g.turn, sales: sales, income: Math.round(income), fixed: this.curFixed(), profit: profit };
    this._push('📊', 'ปิดเดือน ' + g.turn + ': ขาย ' + sales.toLocaleString('en-US') + ' ' + g.unit + ' · กำไรสุทธิ ' + (profit >= 0 ? '+' : '') + SC.ui.money(profit));
    g.turn++;
    g.ap = g.apMax;
    g.xp += Math.max(0, Math.round(profit / 20));   // สเกลเกมหลัก (เดิม /1000)
    while (g.xp >= g.level * 100) { g.xp -= g.level * 100; g.level++; }
  },
};
