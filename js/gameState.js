// ============================================================
// gameState.js — state กลางของเกม + helper คำนวณพอร์ต
//   อัปเดตตาม GAME_SPEC.md: การ์ดอาชีพลับ 2 ใบ · เงินเริ่ม ฿10,000 ·
//   ธนาคาร (ฝาก/หนี้) · การ์ดข่าววงใน · สถานะเครดิตพัง/อายัด ·
//   ไม่มีสรุประหว่างเกม — ตัดสินครั้งเดียวตอนจบ (มูลค่าสุทธิสูงสุดชนะ)
// ============================================================
SC.state = null;

// holdings ว่าง (หุ้นทุกตัว = 0)
SC.emptyHoldings = function () {
  var h = {};
  SC.stocks.forEach(function (s) { h[s.id] = 0; });
  return h;
};

// ราคาเริ่มต้นของหุ้นทุกตัว
SC.startPrices = function () {
  var p = {};
  SC.stocks.forEach(function (s) { p[s.id] = s.start; });
  return p;
};

// มูลค่าสุทธิ = เงินสด + เงินฝาก + หุ้น + สินทรัพย์ทุกตัว ณ ราคาปิด − หนี้คงค้าง
//   (เกณฑ์ตัดสินผู้ชนะตาม GAME_SPEC ข้อ 1)
SC.portfolioValue = function (actor, prices) {
  var v = actor.cash + (actor.deposit || 0) - (actor.debt || 0);
  SC.stocks.forEach(function (s) { v += actor.holdings[s.id] * prices[s.id]; });
  if (actor.assets && SC.markets) v += SC.markets.assetsValue(actor);
  return v;
};

// ---------- ประวัติราคา (ใช้วาดกราฟในหน้าต่าง Stock Market) ----------
SC.PRE_WEEKS = 12; // จุดย้อนหลังก่อนเริ่มเกม (กราฟรอบ 1 ไม่โล่ง)

SC._seedHistory = function () {
  var H = {};
  SC.stocks.forEach(function (st) {
    var pts = [st.start], p = st.start;
    for (var i = 0; i < SC.PRE_WEEKS; i++) {
      var r = st.drift + (Math.random() * 2 - 1) * st.vol;
      p = Math.max(1, p / (1 + r));
      pts.unshift(p);
    }
    H[st.id] = pts;
  });
  return H;
};

// ปริมาณซื้อขายจำลองประจำรอบ (โชว์ในตาราง — หุ้นผันผวนสูงวอลุ่มเหวี่ยงกว่า)
SC.rollVolumes = function () {
  var v = {};
  SC.stocks.forEach(function (st) {
    v[st.id] = Math.round((60 + Math.random() * 180) * (1 + st.vol * 3)) * 1000;
  });
  return v;
};

// อัปเดตราคาประจำรอบ (เรียกจาก resolve.endRound) — เก็บลงประวัติ + สุ่มวอลุ่มใหม่
SC.pushWeekPrices = function (newPrices) {
  var s = SC.state;
  s.prices = newPrices;
  if (!s.history) s.history = SC._seedHistory();
  SC.stocks.forEach(function (st) { s.history[st.id].push(newPrices[st.id]); });
  s.volumes = SC.rollVolumes();
};

// ---------- ซื้อ/ขายหุ้น (หน้าต่าง Stock Market + บอท) ----------
SC.trade = {
  buy: function (actor, id, qty) {
    var s = SC.state, price = s.prices[id], cost = price * qty;
    if (!(qty > 0)) return { ok: false, msg: 'จำนวนไม่ถูกต้อง' };
    if (cost > actor.cash) return { ok: false, msg: 'เงินสดไม่พอ' };
    if (actor.avgCost) {
      var old = actor.holdings[id] || 0;
      actor.avgCost[id] = old > 0 ? ((actor.avgCost[id] || price) * old + cost) / (old + qty) : price;
    }
    actor.cash -= cost;
    actor.holdings[id] += qty;
    return { ok: true, cost: cost };
  },
  sell: function (actor, id, qty) {
    var s = SC.state, price = s.prices[id];
    if (!(qty > 0)) return { ok: false, msg: 'จำนวนไม่ถูกต้อง' };
    if ((actor.holdings[id] || 0) < qty) return { ok: false, msg: 'หุ้นไม่พอขาย' };
    var gain = price * qty;
    actor.holdings[id] -= qty;
    actor.cash += gain;
    if (actor.avgCost && actor.holdings[id] === 0) delete actor.avgCost[id];
    return { ok: true, gain: gain };
  },
};

// ใครเป็นเจ้าของอสังหาแปลงนี้ (บอทถือได้แล้ว — แปลงหนึ่งมีเจ้าของได้คนเดียวทั้งเมือง)
SC.propOwner = function (propId) {
  var s = SC.state; if (!s) return null;
  var all = [s.player].concat(s.bots);
  for (var i = 0; i < all.length; i++) {
    if (all[i].assets && all[i].assets.props[propId]) return all[i];
  }
  return null;
};

// ---------- เริ่มเกมใหม่ ----------
SC.newGame = function (numBots) {
  if (typeof numBots !== 'number') numBots = SC.config.numBots;
  var cfg = SC.config;
  var design = SC.designer.get(); // ดีไซน์จากหน้า 🎨 ออกแบบตัวละคร
  var player = {
    isPlayer: true,
    id: 'player',
    charId: SC.characters[0].id,  // ใช้เฉพาะรูปร่างบนแมพ (อาชีพจริงอยู่ในการ์ดลับ)
    name: design.name || 'คุณ',
    emoji: '🫵',
    design: design,
    cash: cfg.startingCash,
    deposit: 0, debt: 0,
    holdings: SC.emptyHoldings(),
    avgCost: {},
    cards: [], lostCards: [],     // การ์ดอาชีพลับ 2 ใบ + ใบที่เปิดทิ้งถาวร
    news: [],                     // การ์ดข่าววงในในมือ
    brokenCredit: 0,              // เครดิตพังอีกกี่รอบ
    frozenNext: false, frozen: false, // โดนอายัด (มีผลเทิร์นถัดไป)
  };

  SC.state = {
    week: 1,                      // = "รอบ" ปัจจุบัน
    numBots: numBots,
    player: player,
    bots: SC.botBrain.createBots(numBots),
    prices: SC.startPrices(),
    history: SC._seedHistory(),
    volumes: SC.rollVolumes(),
    startValue: cfg.startingCash,
    gameOver: false,
    profDeck: [],                 // กองการ์ดอาชีพ (จั่ว/สับกลับ)
    newsDeck: [],                 // กองการ์ดข่าววงใน
    pubNews: [],                  // ข่าวสาธารณะ+ข่าวลือที่ยังแสดง
    feed: [],                     // ฟีดเหตุการณ์สาธารณะ (ใครโจมตีใคร/ผล challenge)
    timeline: [],                 // ไทม์ไลน์การโกหก/challenge ทั้งเกม (เฉลยจอจบ)
    visits: {},                   // actorId → {buildingId: ครั้ง} (สาธารณะ — บอทใช้เดาพอร์ต)
    order: null,                  // ลำดับเทิร์น (สุ่มตอนเริ่ม แล้วคงที่)
  };

  // ระบบเหตุการณ์สุ่ม (events.js) — สร้าง s.events ตอนเริ่มเกม
  if (SC.events) SC.events.initState(SC.state);

  // แจกการ์ดอาชีพลับคนละ 2 ใบจากกอง 24
  var all = [player].concat(SC.state.bots);
  SC.state.profDeck = SC.deck.build();
  all.forEach(function (a) {
    for (var i = 0; i < cfg.cardsPerPlayer; i++) {
      a.cards.push({ prof: SC.deck.draw(), faceUp: false });
    }
    SC.state.visits[a.id] = {};
  });

  // ตลาดสินทรัพย์ + กองข่าว + แจกข่าววงในฟรีคนละ 1 ใบ
  SC.markets.ensure();
  SC.state.newsDeck = SC.newsSys.buildDeck(40);
  all.forEach(function (a) { SC.newsSys.drawTo(a); });

  // ลำดับเทิร์นสุ่มครั้งเดียว แล้วคงที่ทั้งเกม
  SC.state.order = SC._shuffle(all.slice());

  return SC.state;
};

// ---------- เริ่มรอบใหม่ ----------
SC.startRound = function () {
  SC.newsSys.rollPublic(); // เปิดข่าวสาธารณะ 1-2 ใบต้นรอบ
};
