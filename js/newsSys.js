// ============================================================
// newsSys.js — ระบบข่าว (GAME_SPEC ข้อ 4)
//   • ข่าวสาธารณะ: เปิดต้นรอบ 1-2 ใบ มีผลราคาจริงเสมอเมื่อครบกำหนด
//   • ข่าววงใน (การ์ดลับ): จริง 60 : ปลอม 40 — จริงขยับราคาเมื่อครบกำหนด ปลอมเฉลยเฉยๆ
//   • ข่าวลือผู้เล่นปล่อย (฿1,000): โชว์ปนข่าวสาธารณะแยกไม่ออก แต่ไม่มีผลราคาเลย
//   • บริการตึกข่าว: ซื้อข่าว ฿500 · fact-check ฿700 · ปล่อยข่าวลือ ฿1,000 (จ่ายเข้าระบบ)
// ============================================================
SC.newsSys = {
  // สินทรัพย์ที่ข่าวชี้เป้าได้ — kind บอกว่า apply ราคายังไงตอนครบกำหนด
  TARGETS: [
    { key: 'PTT',   name: 'หุ้น PTT',    kind: 'stock' },
    { key: 'CPALL', name: 'หุ้น CPALL',  kind: 'stock' },
    { key: 'AOT',   name: 'หุ้น AOT',    kind: 'stock' },
    { key: 'KBANK', name: 'หุ้น KBANK',  kind: 'stock' },
    { key: 'MEME',  name: 'หุ้น MEME',   kind: 'stock' },
    { key: 'BTC',   name: 'Bitcoin',     kind: 'coin' },
    { key: 'ETH',   name: 'Ethereum',    kind: 'coin' },
    { key: 'SOL',   name: 'Solana',      kind: 'coin' },
    { key: 'GOLD',  name: 'ทองคำ',       kind: 'gold' },
  ],

  _POS: ['ดีลใหญ่หนุน', 'งบไตรมาสทะลุคาด', 'กองทุนต่างชาติกวาดซื้อ', 'ปลดล็อกกฎระเบียบ รับข่าวบวก', 'กระแสแรง แห่เก็งกำไร'],
  _NEG: ['โดนสอบบัญชี', 'งบร่วงผิดคาด', 'ผู้บริหารเทขายหุ้น', 'โดนแฮ็ก/ฟ้องร้องครั้งใหญ่', 'ดีมานด์หด คาดขาดทุน'],

  target: function (key) {
    return this.TARGETS.find(function (t) { return t.key === key; });
  },

  _headline: function (key, dir, size) {
    var t = this.target(key);
    var pool = dir > 0 ? this._POS : this._NEG;
    var txt = pool[Math.floor(Math.random() * pool.length)];
    return (dir > 0 ? '📈 ' : '📉 ') + t.name + ' — ' + txt + ' (' + (dir > 0 ? '+' : '−') + Math.round(size * 100) + '%)';
  },

  // ---------- กองการ์ดข่าววงใน ----------
  buildDeck: function (n) {
    var cards = [], self = this;
    for (var i = 0; i < (n || 40); i++) {
      var t = this.TARGETS[Math.floor(Math.random() * this.TARGETS.length)];
      var dir = Math.random() < 0.5 ? 1 : -1;
      var size = 0.08 + Math.random() * 0.17;             // 8-25%
      cards.push({
        id: 'nw' + i,
        asset: t.key, dir: dir, size: size,
        dueOffset: 1 + Math.floor(Math.random() * 3),      // มีผลอีก 1-3 รอบหลังจั่ว
        isReal: Math.random() < SC.config.newsRealRatio,   // flag ลับ 60:40
        headline: self._headline(t.key, dir, size),
        dueRound: 0, checked: false,
      });
    }
    return SC._shuffle(cards);
  },

  // จั่วการ์ดข่าวเข้ามือ actor (กำหนดรอบมีผล ณ ตอนจั่ว) — กองหมด = null
  drawTo: function (actor) {
    var s = SC.state;
    if (!s.newsDeck.length) return null;
    var c = s.newsDeck.pop();
    c.dueRound = s.week + c.dueOffset;
    actor.news.push(c);
    return c;
  },

  // ---------- ข่าวสาธารณะ (ต้นรอบ) ----------
  rollPublic: function () {
    var s = SC.state, n = 1 + (Math.random() < 0.5 ? 1 : 0);
    for (var i = 0; i < n; i++) {
      var t = this.TARGETS[Math.floor(Math.random() * this.TARGETS.length)];
      var dir = Math.random() < 0.5 ? 1 : -1;
      var size = 0.05 + Math.random() * 0.12;             // 5-17% เบากว่าข่าววงใน
      s.pubNews.push({
        asset: t.key, dir: dir, size: size,
        dueRound: s.week + 1 + Math.floor(Math.random() * 2),
        headline: this._headline(t.key, dir, size),
        rumor: false, round: s.week,
      });
    }
  },

  // ข่าวสาธารณะ+ข่าวลือที่ยังไม่ครบกำหนด (โชว์ปนกัน แยกไม่ออกตามสเปก)
  activePublic: function () {
    var s = SC.state;
    return s.pubNews.filter(function (nw) { return nw.dueRound > s.week || nw.rumor; });
  },

  // ---------- บริการตึกข่าว (ใช้ได้ 1 อย่าง/การเข้า 1 ครั้ง — คุมที่หน้าต่าง) ----------
  buyNews: function (actor) {
    var cost = SC.config.newsBuy;
    if (actor.cash < cost) return { ok: false, msg: 'เงินสดไม่พอ (ต้องมี ' + SC.ui.money(cost) + ')' };
    if (!SC.state.newsDeck.length) return { ok: false, msg: 'กองข่าวหมดแล้ว' };
    actor.cash -= cost;                                    // จ่ายเข้าระบบ
    return { ok: true, card: this.drawTo(actor) };
  },

  factCheck: function (actor, cardId) {
    var cost = SC.config.newsFactcheck;
    if (actor.cash < cost) return { ok: false, msg: 'เงินสดไม่พอ (ต้องมี ' + SC.ui.money(cost) + ')' };
    var c = actor.news.find(function (x) { return x.id === cardId; });
    if (!c) return { ok: false, msg: 'ไม่พบการ์ดข่าว' };
    actor.cash -= cost;
    c.checked = true;                                      // เจ้าตัวเห็น isReal ได้แล้ว (คนเดียว)
    return { ok: true, card: c };
  },

  plantRumor: function (actor, assetKey, dir, size) {
    var cost = SC.config.newsPlantRumor;
    if (actor.cash < cost) return { ok: false, msg: 'เงินสดไม่พอ (ต้องมี ' + SC.ui.money(cost) + ')' };
    actor.cash -= cost;
    var s = SC.state;
    s.pubNews.push({
      asset: assetKey, dir: dir, size: size,
      dueRound: s.week + 1 + Math.floor(Math.random() * 2),
      headline: this._headline(assetKey, dir, size),
      rumor: true, round: s.week,                          // ไม่มีผลราคา — โชว์รอบถัดไปแบบนิรนาม
    });
    return { ok: true };
  },

  // ---------- ประมวลผลท้ายรอบ: ข่าวครบกำหนด ----------
  //   คืน { factors: {assetKey: ตัวคูณรวม}, reveals: [ข้อความเฉลย] } — resolve เอาไป apply ราคา
  collectDue: function () {
    var s = SC.state, factors = {}, reveals = [];
    function hit(key, dir, size) {
      factors[key] = (factors[key] || 1) * (1 + dir * size);
    }
    // ข่าวสาธารณะจริงครบกำหนด (ข่าวลือ = โชว์เฉยๆ ไม่มีผล ไม่เฉลย)
    s.pubNews = s.pubNews.filter(function (nw) {
      if (nw.rumor) return nw.round >= s.week - 2;         // ข่าวลือค้างฟีด ~2 รอบแล้วหาย
      if (nw.dueRound > s.week) return true;
      hit(nw.asset, nw.dir, nw.size);
      return false;
    });
    // ข่าววงในในมือทุกคน (ผู้เล่น+บอท) ครบกำหนด → จริงขยับราคา + ระบบเฉลยให้ทุกคนเห็น
    [s.player].concat(s.bots).forEach(function (a) {
      a.news = a.news.filter(function (c) {
        if (c.dueRound > s.week) return true;
        if (c.isReal) hit(c.asset, c.dir, c.size);
        reveals.push('เฉลยข่าว: "' + c.headline + '" — ' + (c.isReal ? 'จริง ✓ ราคาขยับแล้ว' : 'ปลอม ✗ ไม่มีอะไรเกิดขึ้น'));
        return false;
      });
    });
    return { factors: factors, reveals: reveals };
  },

  // apply ตัวคูณข่าวเข้า "ตลาดสินทรัพย์" (เหรียญ/ทอง) — เรียกหลัง markets.stepWeek
  //   (ฝั่งหุ้น resolve คูณเข้า newPrices เองก่อน pushWeekPrices)
  applyToMarkets: function (factors) {
    var s = SC.state, self = this;
    if (!s.markets) return;
    Object.keys(factors).forEach(function (key) {
      var t = self.target(key);
      if (t.kind === 'coin' && s.markets.coin[key]) {
        var h = s.markets.coin[key];
        h[h.length - 1] = Math.max(0.01, h[h.length - 1] * factors[key]);
      } else if (t.kind === 'gold') {
        var g = s.markets.gold;
        g[g.length - 1] = Math.max(0.01, g[g.length - 1] * factors[key]);
      }
    });
  },
};
