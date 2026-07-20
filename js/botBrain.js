// ============================================================
// botBrain.js — บอท rule-based ตาม GAME_SPEC ข้อ 7
//   กฎเหล็ก: บอทห้ามโกง — เห็นเฉพาะข้อมูลสาธารณะ + ของตัวเอง
//   (การ์ด/พอร์ตคนอื่นรู้ได้เฉพาะจากส่องลีดเดอร์บอร์ด/ท่านักสืบ/เดาจากพฤติกรรม)
// ============================================================
SC.botBrain = {

  // ---------- บุคลิก 4 แบบ (7.2) — สุ่มแจกตอนเริ่มเกม ไม่บอกผู้เล่น ----------
  PERSONALITIES: {
    shark:    { key: 'shark',    name: 'ฉลามเจ้าเล่ห์',    lieRate: 0.45, challengeThreshold: 0.70, aggression: 0.85 },
    turtle:   { key: 'turtle',   name: 'เต่าปลอดภัย',      lieRate: 0.10, challengeThreshold: 0.90, aggression: 0.25 },
    gambler:  { key: 'gambler',  name: 'นักพนัน',          lieRate: 0.30, challengeThreshold: 0.45, aggression: 0.60 },
    observer: { key: 'observer', name: 'นักสังเกตการณ์',   lieRate: 0.15, challengeThreshold: 0.60, aggression: 0.50 },
  },

  // ---------- สร้างบอท (แทน SC.bot.createBots เดิม) ----------
  createBots: function (count) {
    var cfg = SC.config;
    var keys = SC._shuffle(Object.keys(this.PERSONALITIES).slice());
    var callsigns = ['อัลฟา', 'บราโว่', 'ชาร์ลี', 'เดลต้า', 'เอคโค่'];
    var emojis = ['🤠', '🧐', '😎', '🤖', '🦊'];
    var usedDesigns = [SC.designer.key(SC.designer.get())];
    var bots = [];
    for (var i = 0; i < count; i++) {
      var pk = keys[i % keys.length];
      var base = this.PERSONALITIES[pk];
      var noise = function () { return (Math.random() * 2 - 1) * cfg.bot.personalityNoise; };
      var design = SC.designer.randomDesign(usedDesigns);
      usedDesigns.push(SC.designer.key(design));
      bots.push({
        isPlayer: false,
        id: 'bot' + i,
        name: 'บอท ' + (callsigns[i] || ('#' + (i + 1))),
        emoji: emojis[i % emojis.length],
        charId: SC.characters[i % SC.characters.length].id, // ใช้เฉพาะรูปร่าง/สีตัวละครบนแมพ
        design: design,
        cash: cfg.startingCash,
        deposit: 0, debt: 0,
        holdings: SC.emptyHoldings(),
        assets: { coins: {}, gold: 0, goldCapLv: 0, goldSecLv: 0, bonds: {}, funds: {}, props: {} },
        cards: [], lostCards: [], news: [],
        brokenCredit: 0, frozenNext: false,
        brain: {
          key: pk, name: base.name,
          lieRate: Math.max(0.02, base.lieRate + noise()),
          challengeThreshold: Math.max(0.2, base.challengeThreshold + noise()),
          aggression: Math.max(0.05, base.aggression + noise()),
          grudge: {},            // actorId → เคยตีฉันกี่ครั้ง
          hacked: {},            // actorId → อาชีพที่แอบเห็นด้วยท่านักสืบ (ข้อมูลส่วนตัว)
          scouted: {},           // actorId → {round, vals} จากการส่องลีดเดอร์บอร์ด
        },
      });
    }
    return bots;
  },

  // ---------- ความจำสาธารณะ (7.3) — ทุกคนเห็นเหมือนกัน เก็บกลางที่ state ----------
  _pub: function () {
    var s = SC.state;
    if (!s.botPub) s.botPub = { claims: {}, wins: {} }; // claims: actorId → [profId...] · wins: actorId → true (เคยชนะ challenge)
    return s.botPub;
  },
  noteClaim: function (actor, profId) {
    var p = this._pub();
    if (!p.claims[actor.id || 'player']) p.claims[actor.id || 'player'] = [];
    var arr = p.claims[actor.id || 'player'];
    if (arr.indexOf(profId) < 0) arr.push(profId);
  },
  noteChallenge: function () {},
  noteChallengeResult: function (claimer, profId, wasTrue) {
    var p = this._pub(), id = claimer.id || 'player';
    if (wasTrue) {
      p.wins[id] = true;
      // เขาพิสูจน์แล้วสับใบกลับกอง — การอ้างอาชีพนั้นถือว่าเคลียร์ (ตัวตนกลับมาลับ)
      if (p.claims[id]) p.claims[id] = p.claims[id].filter(function (x) { return x !== profId; });
    }
  },
  noteReveal: function () {},   // การ์ดเปิด/ทิ้ง เห็นได้จาก lostCards/faceUp ตรงๆ อยู่แล้ว
  noteHack: function (attacker, target, seenProf) {
    if (attacker.brain) {
      attacker.brain.hacked[target.id || 'player'] = seenProf;
      attacker.brain.scouted[target.id || 'player'] = { round: SC.state.week, vals: SC.attacks.categoryValues(target), debt: target.debt };
    }
  },
  noteAttack: function (attacker, target) {
    if (target.brain) target.brain.grudge[attacker.id || 'player'] = (target.brain.grudge[attacker.id || 'player'] || 0) + 1;
  },
  noteScout: function (bot, target) { // บอทเดินไปส่องลีดเดอร์บอร์ด (เห็นพอร์ตละเอียด 1 คน)
    bot.brain.scouted[target.id || 'player'] = { round: SC.state.week, vals: SC.attacks.categoryValues(target), debt: target.debt };
  },

  // ---------- สูตรความมั่นใจว่า "เป้ากำลังโกหก" (7.3) ----------
  suspicion: function (bot, claimer, profId) {
    var p = this._pub(), id = claimer.id || 'player';
    var sus = 0.30;
    var claims = (p.claims[id] || []).filter(function (x) { return x !== profId; });
    if (claims.length >= 2) sus += 0.30;                       // อ้างมาแล้วหลายอาชีพ เกินมือที่ถือได้
    var pub = SC.publicProfCount(profId);
    var mine = bot.cards.filter(function (c) { return c.prof === profId; }).length;
    if (pub >= SC.config.cardsPerProfession) sus += 0.40;      // เปิดครบ 3 ใบแล้ว เป็นไปไม่ได้
    if (mine > 0 && pub + mine >= SC.config.cardsPerProfession) sus += 0.25; // ที่เหลือในระบบอยู่ในมือฉันหมด
    var seen = bot.brain.hacked[id];
    if (seen && seen !== profId) sus += 0.20;                  // เคยแอบเห็นการ์ดเขา ไม่ใช่ใบที่อ้าง
    if (p.wins[id]) sus -= 0.20;                               // เพิ่งชนะ challenge น่าเชื่อถือขึ้น
    return sus;
  },

  // ---------- ตอบโต้เมื่อโดนโจมตี (7.4) — คืน 'accept' | 'challenge' | 'counter' ----------
  respondToAttack: function (bot, attacker, claimProf, opts) {
    var counterProf = SC.counterOf(claimProf);
    var canMove = SC.canUseMoves(bot);
    if (canMove && SC.hasProf(bot, counterProf)) return 'counter';     // ถือจริง = เคาน์เตอร์เสมอ
    var damage = this._estimateDamage(bot, claimProf, opts);
    if (canMove && damage > SC.config.challengePenalty * 1.5 && Math.random() < bot.brain.lieRate) return 'counter'; // เคาน์เตอร์มั่ว
    if (this.suspicion(bot, attacker, claimProf) >= bot.brain.challengeThreshold) return 'challenge';
    return 'accept';
  },

  // ผู้โจมตีเป็นบอท เจอเคาน์เตอร์ — ยอมหรือ challenge
  respondToCounter: function (bot, target, counterProf) {
    return this.suspicion(bot, target, counterProf) >= bot.brain.challengeThreshold ? 'challenge' : 'accept';
  },

  // ความเสียหายโดยประมาณจากท่า (บอทรู้พอร์ตตัวเองเต็มๆ — ไม่โกง)
  _estimateDamage: function (bot, claimProf, opts) {
    var cfg = SC.config, v = SC.attacks.categoryValues(bot);
    switch (claimProf) {
      case 'whale':  return v.crypto * cfg.dumpOnRate;
      case 'short': {
        var mx = Math.max(v.stock, v.crypto, v.gold, v.bond, v.fund, v.prop, v.deposit);
        return Math.min(mx * cfg.shortPortRate, cfg.shortPortCap);
      }
      case 'tiger':  return v.prop > 0 ? Math.min(cfg.landGrabRefuseFee, v.prop * cfg.landGrabDiscount) : 0;
      case 'banker': return bot.debt * cfg.debtSqueezeRatio * 0.5; // จ่ายหนี้ตัวเอง ไม่ใช่เสียเปล่า — นับครึ่ง
      case 'mafia':  return cfg.extortAmount * 0.8;
      case 'sec':    return 600;   // เสียเทิร์นธุรกรรม
      case 'hacker': return (opts && opts.mode === 'info') ? 400 : cfg.hackStealAmount;
      case 'media':  return 250;
    }
    return 300;
  },

  // ============================================================
  // เฟสโจมตีของบอท (7.4) — คืน null = ข้ามรับเงินเดือน · หรือ {claim, target, opts}
  // ============================================================
  chooseAction: function (bot) {
    var s = SC.state, self = this;
    if (!SC.canUseMoves(bot) || bot.frozen) return null;

    // aggression ปรับตามสถานการณ์: ตกอันดับท้าย +, เครดิตพัง −
    var agg = bot.brain.aggression;
    var rank = this._rankOf(bot);
    var total = 1 + s.bots.length;
    if (rank > total / 2) agg += 0.15;
    if (bot.brokenCredit > 0) agg -= 0.30;
    if (Math.random() >= agg) return null;

    var others = [s.player].concat(s.bots).filter(function (a) { return a !== bot; });
    var best = null, bestScore = -Infinity;
    SC.professions.forEach(function (p) {
      others.forEach(function (t) {
        // เงื่อนไขความรู้ (7.4 ข้อ 4): ท่าที่ต้องรู้พอร์ต/หนี้เป้า ใช้เฉพาะเป้าที่เคยส่อง/hack
        //   หรือเดาจากพฤติกรรม (เห็น avatar เข้าตึกนั้น) — ห้ามใช้ข้อมูลจริงจาก engine ในการเลือก
        if (!self._believesEligible(bot, p.id, t)) return;
        // ระบบ validate ของจริงตอนกดใช้ (เทียบปุ่ม disable ใน UI) — เป้าไม่เข้าเงื่อนไขก็ตกไป
        if (!SC.attacks.canTarget(p.id, bot, t)) return;
        var has = SC.hasProf(bot, p.id);
        var score = self._attackValue(bot, p.id, t);
        score += has ? 1.5 : -(1 - bot.brain.lieRate) * 2.5;   // โกหก = โดนหักตามนิสัย
        score += (total - self._rankOf(t)) * 0.3;               // เป้าอันดับสูง น่าตี
        score += (bot.brain.grudge[t.id || 'player'] || 0) * 0.5; // ความแค้น
        if (bot.brain.scouted[t.id || 'player']) score += 0.3;  // มีข้อมูล = เล็งแม่น
        score += (Math.random() - 0.5) * 0.6;                   // noise
        if (score > bestScore) { bestScore = score; best = { claim: p.id, target: t, opts: {} }; }
      });
    });
    if (!best || bestScore < 0.5) return null;
    if (best.claim === 'hacker') {
      best.opts.mode = (bot.brain.key === 'observer' && !bot.brain.scouted[best.target.id || 'player']) ? 'info' : 'money';
    }
    return best;
  },

  // บอท "เชื่อว่า" เป้าเข้าเงื่อนไขท่าไหม — จากข้อมูลที่ส่อง/hack/พฤติกรรมเท่านั้น
  _believesEligible: function (bot, profId, target) {
    var tid = target.id || 'player';
    var sc = bot.brain.scouted[tid];
    var visits = (SC.state.visits && SC.state.visits[tid]) || {};
    switch (profId) {
      case 'whale':  return sc ? sc.vals.crypto > 0 : (visits.crypto || 0) > 0;
      case 'tiger':  return sc ? sc.vals.prop > 0 : (visits.realestate || 0) > 0;
      case 'banker': return sc ? sc.debt > 0 : (visits.fin || 0) > 0;   // เห็นเข้าธนาคารบ่อย = เดาว่ามีหนี้
      case 'short':  return sc ? true : (visits.chart || visits.crypto || visits.gold || visits.fin || 0) > 0;
      default: return true; // media/mafia/sec/hacker ใช้กับใครก็ได้
    }
  },

  // มูลค่าคาดหวังของท่า (จากมุมมองข้อมูลที่บอทมี)
  _attackValue: function (bot, profId, target) {
    var cfg = SC.config, tid = target.id || 'player';
    var sc = bot.brain.scouted[tid];
    switch (profId) {
      case 'whale':  return ((sc ? sc.vals.crypto : 1200) * cfg.dumpOnRate * 0.5) / 400;
      case 'short':  return Math.min((sc ? Math.max(sc.vals.stock, sc.vals.crypto, sc.vals.deposit, sc.vals.prop) : 1200) * cfg.shortPortRate, cfg.shortPortCap) / 400;
      case 'tiger':  return 1.2;
      case 'banker': return 0.8;   // กดคู่แข่ง ไม่ได้เงินเข้าตัว
      case 'mafia':  return cfg.extortAmount / 500;
      case 'sec':    return this._rankOf(target) === 1 ? 1.6 : 0.7; // อายัดตัวเต็งคุ้มสุด
      case 'hacker': return 1.4;
      case 'media':  return 0.9;
    }
    return 0.5;
  },

  _rankOf: function (actor) {
    var s = SC.state;
    var all = [s.player].concat(s.bots).map(function (a) {
      return { a: a, v: SC.portfolioValue(a, s.prices) + (a.deposit || 0) - (a.debt || 0) };
    }).sort(function (x, y) { return y.v - x.v; });
    return all.findIndex(function (r) { return r.a === actor; }) + 1;
  },

  // ============================================================
  // เฟสแมพของบอท — วางคิว 2-4 กิจกรรมตามบุคลิก (เดินจริง ไม่ teleport)
  //   คืน [{building, act}] — act ถูก exec ตอนเดินถึงตึก (ผู้เล่นเห็นแค่เส้นทาง)
  // ============================================================
  planMap: function (bot) {
    var s = SC.state, plan = [], k = bot.brain.key;
    // เหตุการณ์รอบนี้ (สาธารณะ — บอทเห็นเหมือนผู้เล่น: EVENTS_SPEC ข้อ 7)
    var evIds = (s.events && s.events.history) ? s.events.history.filter(function (h) { return h.round === s.week; }).map(function (h) { return h.id; }) : [];
    var squeeze = evIds.indexOf('memeSqueeze') >= 0;
    var legendFired = evIds.some(function (id) { var d = SC.eventById(id); return d && d.tier === 'legend'; });
    if (bot.frozen) { // ถูกอายัด: เดินได้อย่างเดียว — เดินสุ่ม 2 ตึกแบบไม่ทำอะไร
      SC._shuffle(SC.map.city.slice()).slice(0, 2).forEach(function (b) { plan.push({ building: b.id, act: { t: 'idle' } }); });
      return plan;
    }
    // 🎲 นักพนัน: ซื้อ MEME ตอน short squeeze แล้วถือข้ามรอบ (สีสันประจำเกม — จงใจ)
    if (k === 'gambler' && squeeze && Math.random() < 0.7) plan.push({ building: 'chart', act: { t: 'buyMeme' } });
    // 🐢 เต่า: เห็น telegraph หรือ regime crisis → ย้ายเข้าทอง+ฝาก (ไม่ซื้อ MEME ช่วง squeeze)
    var scared = (s.events && (s.events.telegraphs.length > 0 || s.events.regime === 'crisis'));
    if (k === 'turtle' && scared) { plan.push({ building: 'gold', act: { t: 'buyGold' } }); if (bot.cash > 2000) plan.push({ building: 'fin', act: { t: 'deposit', amt: bot.cash * 0.5 } }); }
    // เหตุการณ์รอบก่อน (ใช้กับฉลาม "ช้อน" + นักสังเกตการณ์ "รอ 1 รอบแล้วตาม")
    var evPrev = (s.events && s.events.history) ? s.events.history.filter(function (h) { return h.round === s.week - 1; }).map(function (h) { return h.id; }) : [];
    // 🦈 ฉลาม: เห็น telegraph → ขายลดความเสี่ยงก่อน 70% · ไม่งั้น 60% ช้อนหุ้นที่โดนเหตุการณ์ลบรอบก่อน
    if (k === 'shark') {
      if (s.events && s.events.telegraphs.length > 0 && Math.random() < 0.7) {
        plan.push({ building: 'chart', act: { t: 'sellRisk' } });
      } else if (evPrev.length && Math.random() < 0.6) {
        var dips = [];
        evPrev.forEach(function (id) { SC.botBrain._evStockImpacts(id).forEach(function (im) { if (!im.up) dips.push(im.id); }); });
        if (dips.length) plan.push({ building: 'chart', act: { t: 'buyDip', stock: dips[Math.floor(Math.random() * dips.length)] } });
      }
    }
    // 🔭 นักสังเกตการณ์: จดเหตุการณ์ไว้ รอ 1 รอบ แล้วขยับตามทิศทางที่เกิดจริง
    if (k === 'observer' && evPrev.length) {
      var imps = [];
      evPrev.forEach(function (id) { imps.push.apply(imps, SC.botBrain._evStockImpacts(id)); });
      var im2 = imps.length ? imps[Math.floor(Math.random() * imps.length)] : null;
      if (im2) plan.push({ building: 'chart', act: im2.up ? { t: 'buyDip', stock: im2.id } : { t: 'sellRisk' } });
    }

    // 1) มีข่าววงในถือไว้ → เล่นตามข่าวก่อนครบกำหนด (นักสังเกตการณ์ fact-check ก่อนถ้าเงินพอ)
    var card = bot.news.find(function (c) { return c.dueRound > s.week; });
    if (card) {
      if (k === 'observer' && !card.checked && bot.cash >= SC.config.newsFactcheck + 500) {
        plan.push({ building: 'news', act: { t: 'factcheck', card: card.id } });
      }
      var t = SC.newsSys.target(card.asset);
      var b = t.kind === 'stock' ? 'chart' : (t.kind === 'coin' ? 'crypto' : 'gold');
      plan.push({ building: b, act: { t: 'newsTrade', card: card.id } });
    }

    // 2) กิจกรรมตามบุคลิก
    if (k === 'turtle') {
      plan.push(Math.random() < 0.5 ? { building: 'gold', act: { t: 'buyGold' } } : { building: 'bond', act: { t: 'buyBond' } });
      if (bot.cash > 3000) plan.push({ building: 'fin', act: { t: 'deposit', amt: bot.cash * 0.4 } });
    } else if (k === 'shark') {
      plan.push(Math.random() < 0.6 ? { building: 'crypto', act: { t: 'buyHotCoin' } } : { building: 'chart', act: { t: 'buyHotStock' } });
      if (Math.random() < 0.4) plan.push({ building: 'news', act: { t: 'buyNews' } });
    } else if (k === 'gambler') {
      if (bot.debt < SC.config.bank.loanCap * 0.8 && bot.brokenCredit <= 0 && Math.random() < 0.5) {
        plan.push({ building: 'fin', act: { t: 'borrow', amt: SC.config.bank.loanCap - bot.debt } });
      }
      plan.push({ building: Math.random() < 0.5 ? 'crypto' : 'chart', act: { t: 'allin' } });
    } else { // observer
      // (ตึก leaderboard ถูกถอดออกจากแมป 2026-07-17 → ท่า scout พักไว้ก่อน — execAction 'scout' ยังอยู่เผื่อเรียกกลับ
      //  นักสังเกตการณ์ยังอ่านข้อมูลสาธารณะจาก s.visits/botPub ได้ตามสเปกเดิม)
      if (Math.random() < 0.7) plan.push({ building: 'news', act: { t: 'buyNews' } });
      plan.push({ building: 'chart', act: { t: 'rebalance' } });
    }

    // หลังเหตุการณ์ legend: เพิ่มโอกาสเดินเข้าตึกข่าวหาข้อมูล (ดูเหมือนตกใจ)
    if (legendFired && Math.random() < 0.5) plan.push({ building: 'news', act: { t: 'buyNews' } });

    // 3) โควตาพฤติกรรมหลอก: เดินเข้าตึกแบบไม่ทำธุรกรรม
    if (Math.random() < SC.config.bot.fakeVisitRate) {
      var rb = SC.map.city[Math.floor(Math.random() * SC.map.city.length)];
      plan.push({ building: rb.id, act: { t: 'idle' } });
    }
    // เช็คตึกปิดก่อนตั้งเป้าเดิน (EVENTS_SPEC ข้อ 7 — ปิด → ไม่เดินเข้า)
    plan = plan.filter(function (st) { return !(SC.events && SC.events.isClosed(st.building) && st.building !== 'gold'); });
    return plan.slice(0, 4);
  },

  // ---------- ทำธุรกรรมตอนบอทเดินถึงตึก (แชร์ราคากลาง/กติกาเดียวกับผู้เล่น) ----------
  execAction: function (bot, act) {
    var s = SC.state, m = s.markets;
    switch (act.t) {
      case 'idle': return;
      case 'scout': {
        var t = act.target === 'player' ? s.player : s.bots.find(function (b) { return b.id === act.target; });
        if (t) this.noteScout(bot, t);
        return;
      }
      case 'buyNews': {
        if (bot.cash >= SC.config.newsBuy && s.newsDeck.length) { bot.cash -= SC.config.newsBuy; SC.newsSys.drawTo(bot); }
        return;
      }
      case 'factcheck': {
        var c = bot.news.find(function (x) { return x.id === act.card; });
        if (c && bot.cash >= SC.config.newsFactcheck) { bot.cash -= SC.config.newsFactcheck; c.checked = true; }
        return;
      }
      case 'newsTrade': {
        var card = bot.news.find(function (x) { return x.id === act.card; });
        if (!card) return;
        if (card.checked && !card.isReal) return;            // fact-check แล้วรู้ว่าปลอม = ไม่เล่น
        var trust = bot.brain.key === 'gambler' ? 1 : 0.7;    // นักพนันเชื่อทันทีเต็มพอร์ตข่าว
        var budget = bot.cash * (card.dir > 0 ? 0.5 : 0) * trust;
        var tgt = SC.newsSys.target(card.asset);
        if (card.dir > 0) {
          if (tgt.kind === 'stock') this._buyStock(bot, card.asset, budget);
          else if (tgt.kind === 'coin') this._buyCoin(bot, card.asset, budget);
          else this._buyGold(bot, budget);
        } else {
          // ข่าวร้าย: ขายของที่ถืออยู่ทิ้ง
          if (tgt.kind === 'stock' && bot.holdings[card.asset] > 0) { bot.cash += bot.holdings[card.asset] * s.prices[card.asset]; bot.holdings[card.asset] = 0; }
          else if (tgt.kind === 'coin' && bot.assets.coins[card.asset] > 0) { bot.cash += bot.assets.coins[card.asset] * SC.markets.coinPrice(card.asset); bot.assets.coins[card.asset] = 0; }
          else if (tgt.kind === 'gold' && bot.assets.gold > 0) { bot.cash += bot.assets.gold * SC.markets.goldPrice(); bot.assets.gold = 0; }
        }
        return;
      }
      case 'buyHotStock': { // หุ้นที่เพิ่งขยับแรงสุด
        var hot = null, mx = -Infinity;
        SC.stocks.forEach(function (st) {
          var h = s.history[st.id], ch = h.length > 1 ? (h[h.length - 1] - h[h.length - 2]) / h[h.length - 2] : 0;
          if (ch > mx) { mx = ch; hot = st.id; }
        });
        if (hot) this._buyStock(bot, hot, bot.cash * 0.35);
        return;
      }
      case 'buyHotCoin': {
        var hc = null, mc = -Infinity;
        SC.coins.forEach(function (c) {
          var h = m.coin[c.id], ch = (h[h.length - 1] - h[h.length - 2]) / h[h.length - 2];
          if (ch > mc) { mc = ch; hc = c.id; }
        });
        if (hc) this._buyCoin(bot, hc, bot.cash * 0.35);
        return;
      }
      case 'allin': {
        var pick = Math.random() < 0.5 ? SC.stocks[Math.floor(Math.random() * SC.stocks.length)].id : null;
        if (pick) this._buyStock(bot, pick, bot.cash * 0.8);
        else this._buyCoin(bot, SC.coins[Math.floor(Math.random() * SC.coins.length)].id, bot.cash * 0.8);
        return;
      }
      case 'rebalance': { // ซื้อถัวหุ้นพื้นฐานดี
        var good = SC.stocks.filter(function (st) { return !st.highPE; });
        var st2 = good[Math.floor(Math.random() * good.length)];
        this._buyStock(bot, st2.id, bot.cash * 0.25);
        return;
      }
      case 'buyMeme': { this._buyStock(bot, 'MEME', bot.cash * 0.5); return; }
      case 'buyDip': { this._buyStock(bot, act.stock || 'PTT', bot.cash * 0.3); return; }
      case 'sellRisk': { // ขายลดความเสี่ยง: MEME ทั้งหมด + ครึ่งพอร์ตเหรียญ
        if (bot.holdings.MEME > 0) { bot.cash += bot.holdings.MEME * SC.state.prices.MEME; bot.holdings.MEME = 0; }
        var ca = bot.assets && bot.assets.coins;
        if (ca) Object.keys(ca).forEach(function (cid) {
          var q = ca[cid] * 0.5;
          if (q > 1e-6) { bot.cash += q * SC.markets.coinPrice(cid); ca[cid] -= q; }
        });
        return;
      }
      case 'buyGold': return this._buyGold(bot, bot.cash * 0.3);
      case 'buyBond': {
        var b2 = SC.bonds[Math.floor(Math.random() * SC.bonds.length)];
        var units = Math.floor((bot.cash * 0.3) / b2.face);
        if (units > 0) { bot.cash -= units * b2.face; bot.assets.bonds[b2.id] = (bot.assets.bonds[b2.id] || 0) + units; }
        return;
      }
      case 'deposit': {
        var amt = Math.min(act.amt || 0, bot.cash);
        if (amt > 0) SC.bank.deposit(bot, amt);
        return;
      }
      case 'borrow': {
        if (act.amt > 0) SC.bank.borrow(bot, act.amt);
        return;
      }
    }
  },

  // ผลกระทบ "หุ้น" ของเหตุการณ์หนึ่ง (อ่านจาก catalog — ข้อมูลสาธารณะ ไม่ใช่การโกง)
  //   คืน [{id, up}] เฉพาะ fx priceMult ที่แตะหุ้นตรงๆ หรือกลุ่มหุ้น
  _evStockImpacts: function (evId) {
    var def = SC.eventById && SC.eventById(evId); if (!def) return [];
    var out = [];
    (def.fx || []).forEach(function (f) {
      if (f.type !== 'priceMult') return;
      var v = (f.v != null) ? f.v : (((f.vMin || 0) + (f.vMax || 0)) / 2);
      var ids = [];
      if (f.asset && SC.stocks.some(function (st) { return st.id === f.asset; })) ids = [f.asset];
      else if (f.group && SC.eventGroups[f.group]) {
        ids = SC.eventGroups[f.group].filter(function (id) { return SC.stocks.some(function (st) { return st.id === id; }); });
      }
      ids.forEach(function (id) { out.push({ id: id, up: v > 0 }); });
    });
    return out;
  },

  _buyStock: function (bot, id, budget) {
    var qty = Math.floor(Math.max(0, Math.min(budget, bot.cash)) / SC.state.prices[id]);
    if (qty > 0) { bot.cash -= qty * SC.state.prices[id]; bot.holdings[id] += qty; }
  },
  _buyCoin: function (bot, id, budget) {
    budget = Math.max(0, Math.min(budget, bot.cash));
    var px = SC.markets.coinPrice(id), qty = budget / px;
    if (qty > 1e-6) { bot.cash -= budget; bot.assets.coins[id] = (bot.assets.coins[id] || 0) + qty; }
  },
  _buyGold: function (bot, budget) {
    budget = Math.max(0, Math.min(budget, bot.cash));
    var px = SC.markets.goldPrice();
    var cap = SC.markets.goldCap(bot.assets) - (bot.assets.gold || 0);
    var g = Math.min(budget / px, Math.max(0, cap));
    if (g > 1e-6) { bot.cash -= g * px; bot.assets.gold = (bot.assets.gold || 0) + g; }
  },
};
