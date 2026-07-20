// ============================================================
// markets.js — ตลาดสินทรัพย์ 4 ตึก: Crypto Arena · Gold Vault · Bonds & Fund · Real Estate
//   ข้อมูล + ราคา/ประวัติ + ซื้อขายจริงด้วยเงินสดผู้เล่น + ขยับราคา/จ่ายรายได้รายสัปดาห์
//   *** ข้อมูลจำลองเพื่อการเรียนรู้ ไม่ใช่ราคาเรียลไทม์ ไม่ใช่คำแนะนำลงทุน ***
//   สีต่อสินทรัพย์: โทนเดียวกับชุดที่ผ่าน dataviz validator ใน stocks.js
//   (เขียว/แดงล้วนสงวนไว้บอกกำไร/ขาดทุน)
// ============================================================

// ---------- เหรียญคริปโต (หน้าต่าง Crypto Arena) ----------
//   step = จำนวนขั้นต่ำต่อคลิก (เหรียญแพงซื้อเป็นเศษได้เหมือนของจริง)
SC.coins = [
  { id: 'BTC', name: 'Bitcoin',  sym: 'BTC', icon: '🟠', color: '#c98500', start: 67343, drift: 0.020, vol: 0.10, step: 0.001, dec: 3, supply: 20 },
  { id: 'ETH', name: 'Ethereum', sym: 'ETH', icon: '🔷', color: '#9085e9', start: 3324,  drift: 0.022, vol: 0.13, step: 0.01,  dec: 2, supply: 120 },
  { id: 'BNB', name: 'BNB',      sym: 'BNB', icon: '🟡', color: '#3987e5', start: 502,   drift: 0.015, vol: 0.15, step: 0.1,   dec: 1, supply: 150 },
  { id: 'SOL', name: 'Solana',   sym: 'SOL', icon: '🟣', color: '#38b6c9', start: 152.8, drift: 0.030, vol: 0.20, step: 0.1,   dec: 1, supply: 450 },
  { id: 'ADA', name: 'Cardano',  sym: 'ADA', icon: '🔵', color: '#199e70', start: 12.4,  drift: 0.010, vol: 0.22, step: 1,     dec: 0, supply: 35000 },
  { id: 'DOG', name: 'Dogecoin', sym: 'DOGE', icon: '🐶', color: '#d95926', start: 4.6,  drift: -0.01, vol: 0.35, step: 1,     dec: 0, supply: 140000 },
];

// ---------- ทอง (หน้าต่าง Gold Vault) — ซื้อเป็นกรัม ----------
SC.goldCfg = {
  start: 65, drift: 0.010, vol: 0.04,             // ฿/กรัม (อิง assetsRef GOLD)
  baseCap: 50,                                    // ความจุตู้เซฟเริ่มต้น (กรัม)
  storage: [                                      // อัปเกรดความจุทีละขั้น
    { cap: 150, price: 250 }, { cap: 400, price: 600 }, { cap: 1000, price: 1500 },
  ],
  security: [                                     // อัปเกรดความปลอดภัย (กันเหตุการณ์ขโมยในอนาคต)
    { name: 'กุญแจเสริม', price: 120 }, { name: 'กล้องวงจรปิด', price: 300 }, { name: 'ระบบเลเซอร์', price: 800 },
  ],
};

// ---------- พันธบัตร/หุ้นกู้ (Bonds & Fund) — หน่วยละ ฿100 จ่ายดอกเบี้ยรายสัปดาห์ ----------
SC.bonds = [
  { id: 'GOV10', name: 'พันธบัตรรัฐบาล 10 ปี', icon: '🏛️', face: 100, coupon: 0.032, maturity: 'ปี 2036', risk: 1 },
  { id: 'CORP',  name: 'หุ้นกู้เอกชน AAA',     icon: '🏢', face: 100, coupon: 0.045, maturity: 'ปี 2031', risk: 2 },
  { id: 'INFRA', name: 'หุ้นกู้โครงสร้างพื้นฐาน', icon: '🌉', face: 100, coupon: 0.048, maturity: 'ปี 2033', risk: 2 },
  { id: 'GREEN', name: 'พันธบัตรสีเขียว',      icon: '🌱', face: 100, coupon: 0.053, maturity: 'ปี 2032', risk: 2 },
];

// ---------- กองทุนรวม (Bonds & Fund) — ซื้อเป็นหน่วย NAV ขยับรายสัปดาห์ ----------
SC.funds = [
  { id: 'GROWTH',  name: 'กองทุนหุ้นเติบโต',   icon: '📈', color: '#3987e5', nav: 10, drift: 0.0020, vol: 0.050, expect: '+10.4%/ปี', min: 100, note: 'โตแรง เสี่ยงสูง' },
  { id: 'BALANCE', name: 'กองทุนผสมสมดุล',     icon: '⚖️', color: '#9085e9', nav: 10, drift: 0.0012, vol: 0.030, expect: '+6.2%/ปี',  min: 100, note: 'หุ้นผสมตราสารหนี้' },
  { id: 'INCOME',  name: 'กองทุนรายได้ประจำ',  icon: '🪙', color: '#c98500', nav: 10, drift: 0.0008, vol: 0.015, expect: '+4.1%/ปี',  min: 100, note: 'จ่ายปันผล 3%/ปี', div: 0.03 },
  { id: 'INDEX',   name: 'กองทุนดัชนีตลาด',    icon: '🧺', color: '#38b6c9', nav: 10, drift: 0.0017, vol: 0.040, expect: '+8.9%/ปี',  min: 100, note: 'ค่าธรรมเนียมต่ำ ตามดัชนี' },
];

// ---------- อสังหา (Real Estate Hub) — ค่าเช่าเข้าเงินสดทุกสัปดาห์ ----------
SC.properties = [
  { id: 'OLDROOM', name: 'ห้องเช่าย่านเก่า',      icon: '🚪', type: 'ที่อยู่อาศัย', color: '#3987e5', start: 350,  rent: 4,  drift: 0.010, vol: 0.030 },
  { id: 'CONDO',   name: 'คอนโดสตูดิโอกลางเมือง', icon: '🏙️', type: 'ที่อยู่อาศัย', color: '#3987e5', start: 480,  rent: 6,  drift: 0.015, vol: 0.030 },
  { id: 'TOWNH',   name: 'ทาวน์เฮาส์ชานเมือง',    icon: '🏡', type: 'ที่อยู่อาศัย', color: '#3987e5', start: 720,  rent: 8,  drift: 0.012, vol: 0.025 },
  { id: 'SHOP',    name: 'ร้านค้าตึกแถว',          icon: '🏪', type: 'พาณิชย์',     color: '#c98500', start: 1100, rent: 14, drift: 0.015, vol: 0.040 },
  { id: 'OFFICE',  name: 'ออฟฟิศให้เช่าชั้นลอย',   icon: '🏢', type: 'พาณิชย์',     color: '#c98500', start: 1800, rent: 24, drift: 0.018, vol: 0.045 },
  { id: 'LAND',    name: 'ที่ดินริมแม่น้ำ',        icon: '🌾', type: 'ที่ดิน',      color: '#9085e9', start: 950,  rent: 0,  drift: 0.030, vol: 0.070 },
];

SC.markets = {
  PRE: 12, // จุดประวัติย้อนหลัง (เท่ากราฟหุ้น)

  // ---------- init state (lazy — เผื่อ state เก่าที่ยังไม่มี) ----------
  ensure: function () {
    var s = SC.state; if (!s) return null;
    if (!s.player.assets) {
      s.player.assets = { coins: {}, gold: 0, goldCapLv: 0, goldSecLv: 0, bonds: {}, funds: {}, props: {} };
    }
    if (!s.markets) {
      var seed = this._seed;
      s.markets = {
        coin: {}, gold: null, fund: {}, prop: {},
        log: [],            // ธุรกรรมล่าสุด (โชว์ใน Real Estate / Bonds)
        income: null,       // รายได้สัปดาห์ล่าสุด {rent, coupon, div}
      };
      SC.coins.forEach(function (c) { s.markets.coin[c.id] = seed(c.start, c.drift, c.vol); });
      s.markets.gold = seed(SC.goldCfg.start, SC.goldCfg.drift, SC.goldCfg.vol);
      SC.funds.forEach(function (f) { s.markets.fund[f.id] = seed(f.nav, f.drift, f.vol); });
      SC.properties.forEach(function (p) { s.markets.prop[p.id] = seed(p.start, p.drift, p.vol); });
    }
    return s.markets;
  },

  // ประวัติย้อนหลัง: เดินถอยหลังจากราคาตั้งต้น (จุดสุดท้าย = ราคาปัจจุบัน)
  _seed: function (start, drift, vol) {
    var pts = [start], p = start;
    for (var i = 0; i < SC.markets.PRE; i++) {
      var r = drift + (Math.random() * 2 - 1) * vol;
      p = Math.max(0.01, p / (1 + r));
      pts.unshift(p);
    }
    return pts;
  },

  price: function (hist) { return hist[hist.length - 1]; },
  change: function (hist) { // [diff, pct] เทียบสัปดาห์ก่อน
    var last = hist[hist.length - 1], prev = hist.length > 1 ? hist[hist.length - 2] : last;
    return [last - prev, prev ? (last - prev) / prev * 100 : 0];
  },

  coinPrice: function (id) { return this.price(SC.state.markets.coin[id]); },
  goldPrice: function () { return this.price(SC.state.markets.gold); },
  fundNav: function (id) { return this.price(SC.state.markets.fund[id]); },
  propPrice: function (id) { return this.price(SC.state.markets.prop[id]); },

  goldCap: function (a) {
    var lv = a.goldCapLv || 0;
    return lv > 0 ? SC.goldCfg.storage[lv - 1].cap : SC.goldCfg.baseCap;
  },

  // มูลค่าสินทรัพย์นอกตลาดหุ้นทั้งหมดของ actor (ผู้เล่นเท่านั้นที่มี)
  assetsValue: function (actor) {
    var a = actor.assets; if (!a || !SC.state || !SC.state.markets) return 0;
    var m = SC.state.markets, self = this, v = 0;
    SC.coins.forEach(function (c) { v += (a.coins[c.id] || 0) * self.price(m.coin[c.id]); });
    v += (a.gold || 0) * this.price(m.gold);
    SC.bonds.forEach(function (b) { v += (a.bonds[b.id] || 0) * b.face; });
    SC.funds.forEach(function (f) { v += (a.funds[f.id] || 0) * self.price(m.fund[f.id]); });
    SC.properties.forEach(function (p) { if (a.props[p.id]) v += self.price(m.prop[p.id]); });
    return v;
  },

  // ---------- ซื้อ/ขาย (ทุกอย่างใช้เงินสดกระเป๋าหลักผู้เล่น) ----------
  _log: function (kind, name, side, amount) {
    var m = this.ensure();
    m.log.unshift({ week: SC.state.week, kind: kind, name: name, side: side, amount: amount });
    if (m.log.length > 12) m.log.pop();
  },

  tradeCoin: function (id, qty, side) {
    var s = SC.state, a = s.player.assets, px = this.coinPrice(id);
    var c = SC.coins.find(function (x) { return x.id === id; });
    if (!(qty > 0)) return { ok: false, msg: 'จำนวนไม่ถูกต้อง' };
    if (side === 'sell') {
      if ((a.coins[id] || 0) < qty - 1e-9) return { ok: false, msg: 'เหรียญไม่พอขาย' };
      a.coins[id] = Math.max(0, (a.coins[id] || 0) - qty);
      s.player.cash += px * qty;
      this._log('crypto', c.name, 'ขาย', px * qty);
      return { ok: true, gain: px * qty };
    }
    var cost = px * qty;
    if (cost > s.player.cash) return { ok: false, msg: 'เงินสดไม่พอ' };
    s.player.cash -= cost;
    a.coins[id] = (a.coins[id] || 0) + qty;
    this._log('crypto', c.name, 'ซื้อ', cost);
    return { ok: true, cost: cost };
  },

  tradeGold: function (grams, side) {
    var s = SC.state, a = s.player.assets, px = this.goldPrice();
    if (!(grams > 0)) return { ok: false, msg: 'จำนวนไม่ถูกต้อง' };
    if (side === 'sell') {
      if ((a.gold || 0) < grams - 1e-9) return { ok: false, msg: 'ทองไม่พอขาย' };
      a.gold -= grams;
      s.player.cash += px * grams;
      this._log('gold', 'ทองคำ', 'ขาย', px * grams);
      return { ok: true, gain: px * grams };
    }
    if ((a.gold || 0) + grams > this.goldCap(a) + 1e-9) return { ok: false, msg: 'ตู้เซฟเต็ม — อัปเกรดความจุก่อน' };
    var cost = px * grams;
    if (cost > s.player.cash) return { ok: false, msg: 'เงินสดไม่พอ' };
    s.player.cash -= cost;
    a.gold = (a.gold || 0) + grams;
    this._log('gold', 'ทองคำ', 'ซื้อ', cost);
    return { ok: true, cost: cost };
  },

  upgradeGold: function (kind) { // 'cap' | 'sec'
    var s = SC.state, a = s.player.assets;
    var lv = kind === 'cap' ? (a.goldCapLv || 0) : (a.goldSecLv || 0);
    var list = kind === 'cap' ? SC.goldCfg.storage : SC.goldCfg.security;
    if (lv >= list.length) return { ok: false, msg: 'อัปเกรดสูงสุดแล้ว' };
    var it = list[lv];
    if (it.price > s.player.cash) return { ok: false, msg: 'เงินสดไม่พอ' };
    s.player.cash -= it.price;
    if (kind === 'cap') a.goldCapLv = lv + 1; else a.goldSecLv = lv + 1;
    return { ok: true, item: it };
  },

  tradeBond: function (id, units, side) {
    var s = SC.state, a = s.player.assets;
    var b = SC.bonds.find(function (x) { return x.id === id; });
    if (!(units > 0)) return { ok: false, msg: 'จำนวนไม่ถูกต้อง' };
    if (side === 'sell') {
      if ((a.bonds[id] || 0) < units) return { ok: false, msg: 'หน่วยไม่พอขาย' };
      a.bonds[id] -= units;
      s.player.cash += b.face * units;
      this._log('bond', b.name, 'ขาย', b.face * units);
      return { ok: true, gain: b.face * units };
    }
    var cost = b.face * units;
    if (cost > s.player.cash) return { ok: false, msg: 'เงินสดไม่พอ' };
    s.player.cash -= cost;
    a.bonds[id] = (a.bonds[id] || 0) + units;
    this._log('bond', b.name, 'ซื้อ', cost);
    return { ok: true, cost: cost };
  },

  tradeFund: function (id, amount, side) { // amount = จำนวนเงิน (ซื้อ) หรือหน่วย (ขาย)
    var s = SC.state, a = s.player.assets, nav = this.fundNav(id);
    var f = SC.funds.find(function (x) { return x.id === id; });
    if (side === 'sell') {
      var units = amount;
      if ((a.funds[id] || 0) < units - 1e-9) return { ok: false, msg: 'หน่วยไม่พอขาย' };
      a.funds[id] -= units;
      s.player.cash += nav * units;
      this._log('fund', f.name, 'ขาย', nav * units);
      return { ok: true, gain: nav * units };
    }
    if (amount < f.min) return { ok: false, msg: 'ขั้นต่ำ ' + SC.ui.money(f.min) };
    if (amount > s.player.cash) return { ok: false, msg: 'เงินสดไม่พอ' };
    s.player.cash -= amount;
    a.funds[id] = (a.funds[id] || 0) + amount / nav;
    this._log('fund', f.name, 'ซื้อ', amount);
    return { ok: true, cost: amount, units: amount / nav };
  },

  tradeProp: function (id, side) {
    var s = SC.state, a = s.player.assets, px = this.propPrice(id);
    var p = SC.properties.find(function (x) { return x.id === id; });
    if (side === 'sell') {
      if (!a.props[id]) return { ok: false, msg: 'ยังไม่ได้เป็นเจ้าของ' };
      delete a.props[id];
      s.player.cash += px;
      this._log('prop', p.name, 'ขาย', px);
      return { ok: true, gain: px };
    }
    if (a.props[id]) return { ok: false, msg: 'เป็นเจ้าของอยู่แล้ว' };
    var owner = SC.propOwner(id);
    if (owner) return { ok: false, msg: 'มีเจ้าของแล้ว (' + SC.actorName(owner) + ')' };
    if (px > s.player.cash) return { ok: false, msg: 'เงินสดไม่พอ' };
    s.player.cash -= px;
    a.props[id] = true;
    this._log('prop', p.name, 'ซื้อ', px);
    return { ok: true, cost: px };
  },

  // ---------- ประจำสัปดาห์ (เรียกจาก resolve.js) ----------
  //   ราคาขยับทุกตลาด + จ่ายรายได้ (ค่าเช่า/ดอกเบี้ย/ปันผลกองทุน) → คืน summary
  stepWeek: function () {
    var s = SC.state; if (!s) return null;
    var m = this.ensure(), self = this;
    // สูตร correlation (EVENTS_SPEC ข้อ 4) ผ่าน SC.events.stepAsset — id ต้องตรง registry (gold ใช้ 'GOLD')
    function step(hist, id, drift, vol) {
      var last = hist[hist.length - 1];
      var np = SC.events ? SC.events.stepAsset(last, id, drift, vol) : Math.max(0.01, last * (1 + drift + (Math.random() * 2 - 1) * vol));
      hist.push(np);
    }
    SC.coins.forEach(function (c) { step(m.coin[c.id], c.id, c.drift, c.vol); });
    step(m.gold, 'GOLD', SC.goldCfg.drift, SC.goldCfg.vol);
    SC.funds.forEach(function (f) { step(m.fund[f.id], f.id, f.drift, f.vol); });
    SC.properties.forEach(function (p) { step(m.prop[p.id], p.id, p.drift, p.vol); });

    // ตัวคูณเหตุการณ์ตอนจ่ายรายได้ (ค่าเช่า × rentMult · ปันผลกองทุน × divMult)
    var rentM = SC.events ? SC.events.rentMult() : 1;
    var divM = SC.events ? SC.events.divMult() : 1;

    // รายได้เข้าเงินสด "ทุกคน" (ผู้เล่น+บอทถือสินทรัพย์ได้เหมือนกันตามสเปกใหม่)
    var all = [s.player].concat(s.bots || []);
    all.forEach(function (actor) {
      var a = actor.assets; if (!a) return;
      var rent = 0, coupon = 0, div = 0;
      SC.properties.forEach(function (p) { if (a.props[p.id]) rent += p.rent * rentM; });
      SC.bonds.forEach(function (b) { coupon += (a.bonds[b.id] || 0) * b.face * b.coupon / 52; });
      SC.funds.forEach(function (f) {
        if (f.div) div += (a.funds[f.id] || 0) * self.price(m.fund[f.id]) * f.div / 52 * divM;
      });
      var total = rent + coupon + div;
      actor.cash += total;
      if (actor.isPlayer) m.income = { rent: rent, coupon: coupon, div: div, total: total };
    });
    return m.income;
  },
};
