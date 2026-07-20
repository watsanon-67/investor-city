// ============================================================
// events.js — engine ระบบเหตุการณ์สุ่ม (EVENTS_SPEC ข้อ 2-9,12)
//   • onRoundStart(s): ต้นรอบ — ประมวล telegraph/chain → ทอยเหตุการณ์ใหม่ → apply ผล + UI ประกาศ
//   • prepareMarket/advanceRegime/stepAsset: ราคาแบบมี correlation (ข้อ 4) + regime (ข้อ 3)
//   • onRoundEnd(s): ท้ายรอบ — ลดตัวนับ, คืนค่า default, เฉลย prophecy, purge pending
//   • getters ให้ไฟล์อื่น: rates/rentMult/divMult/custMult/fixedMult/speed/mapTimeSec/isClosed
//   • debug: debugFire/debugRegime/state/simulate + URL ?evt=<id>
//   ข้อมูล/ค่าจูน อยู่ที่ eventCatalog.js (SC.eventCatalog + SC.eventsCfg) เท่านั้น
// ============================================================
SC.events = {
  market: null,          // {M, wild, Mprev} ตั้งโดย prepareMarket ทุกท้ายรอบ
  __reg: null,

  // ---------- state ใหม่ใน s (สร้างใน newGame + defensive) ----------
  initState: function (s) {
    if (s.events) return s.events;
    s.events = {
      active: [],        // ผลตัวคูณ/เวลาที่กำลังเดิน [{kind, v, rounds, ...}]
      closed: {},        // {buildingId: roundsLeft}
      hitTargets: [],    // ตึกที่โดนภัยในรอบนี้ (ตึกหลักท้ายสุด) — คัตซีนอุกกาบาต/พายุใช้เล็ง
      lastClosedId: null,
      disasterRounds: [],   // รอบที่จะเกิดภัยพิบัติ (วางแผนตอนเริ่มเกม — โควตา ~1 ครั้ง/10 รอบ)
      pendingDisaster: null, // {id, actorId} ภัยที่รอยิงกลางเฟสแมพของ actor นั้น
      disasterDone: 0,
      chains: [],        // [{next, p, round}]
      telegraphs: [],    // [{eventId, round}] คำเตือนที่รอยิงรอบหน้า
      cooldown: {},      // {eventId: roundBlockedUntil}
      regime: 'normal',  // normal|boom|slump|crisis (ซ่อนจากผู้เล่น)
      boomStreak: 0, lastM: 0, volBoost: 0,
      rates: { dep: 0.01, loan: 0.04, roundsLeft: 0 },
      lastEventRound: 0, lastTargetNeg: null,
      lastHeavyRound: -1, calmBoostNext: false, apLocked: false,
      regimeForced: -1, capPull: {}, pendingMult: [],
      onceUsed: {},      // taxAudit / taxRefund ใช้ครั้งเดียว/เกม
      prophecy: null,    // {asset, dir, round, base}
      history: [],       // log ทุกเหตุการณ์ {round, id}
    };
    this.planDisasters(s);
    return s.events;
  },

  // ============================================================
  // ภัยพิบัติปิดตึก (meteor/hurricane/ufoAttack/pigeonBank) — user 2026-07-20
  //   • ไม่เข้าการสุ่มเหตุการณ์ปกติแล้ว (def.disaster = true → กันออกจาก pool)
  //   • โควตาทั้งเกม ≈ 1 ครั้งต่อ 10 รอบ (15 รอบ = สุ่ม 1-2 · 20 รอบ = 2)
  //   • ไม่ยิงต้นรอบ แต่ยิง "กลางเฟสแมพ" ของ actor ที่สุ่มไว้ (คัตซีนจะได้เล็งตึกบนแมปจริง)
  // ============================================================
  planDisasters: function (s) {
    var ev = s.events, weeks = (SC.config && SC.config.weeks) || 10;
    var base = weeks / 10;
    var q = Math.floor(base) + (Math.random() < (base - Math.floor(base)) ? 1 : 0);
    // เลี่ยงรอบ 1 (เพิ่งเริ่ม) และรอบสุดท้าย (ปิดตึกแล้วไม่มีรอบให้รับผล)
    var pool = [];
    for (var w = 2; w <= Math.max(2, weeks - 1); w++) pool.push(w);
    var picks = [];
    while (q > 0 && pool.length) {
      var pick = pool[Math.floor(Math.random() * pool.length)];
      picks.push(pick);
      pool = pool.filter(function (x) { return Math.abs(x - pick) >= 2; });   // ไม่ติดกัน
      q--;
    }
    ev.disasterRounds = picks.sort(function (a, b) { return a - b; });
  },

  // ต้นรอบ: ถ้ารอบนี้ถูกวางไว้ → เลือกภัยที่ผ่านเงื่อนไข + สุ่มว่าจะเกิดกลางเทิร์นของใคร
  _armDisasterRound: function (s) {
    var ev = s.events, self = this;
    var order = (s.order && s.order.length) ? s.order : ['player'];
    var pickActor = function () { return order[Math.floor(Math.random() * order.length)]; };
    // ค้างจากรอบก่อน (เช่นเทิร์นนั้นเปิดหน้าต่างยาวจนไม่ได้ยิง) → ยกยอดมารอบนี้ สุ่มเจ้าของเทิร์นใหม่
    if (ev.pendingDisaster) { ev.pendingDisaster.actorId = pickActor(); return; }
    if (ev.disasterRounds.indexOf(s.week) < 0) return;
    var cands = SC.eventCatalog.filter(function (d) { return d.disaster && self._passesCond(d, s); });
    if (!cands.length) return;
    ev.pendingDisaster = { id: this._weightedPick(cands).id, actorId: pickActor() };
  },

  // เฟสแมพเรียกถาม: ภัยพิบัติรอเกิดในเทิร์นของ actor นี้ไหม
  disasterDue: function (actor) {
    var s = SC.state, pd = s && s.events && s.events.pendingDisaster;
    if (!pd || !actor) return null;
    return (pd.actorId === actor.id) ? SC.eventById(pd.id) : null;
  },

  // ยิงจริง (apply + คัตซีน + หน้าประกาศ) — cb เรียกเมื่อประกาศปิด
  fireDisaster: function (cb) {
    var s = SC.state, pd = s && s.events && s.events.pendingDisaster;
    if (!pd) { if (cb) cb(); return; }
    var def = SC.eventById(pd.id);
    s.events.pendingDisaster = null;
    s.events.disasterDone++;
    if (!def) { if (cb) cb(); return; }
    var report = this.applyEvent(def, s);
    s.events.history.push({ round: s.week, id: def.id });
    s.events.lastEventRound = s.week;
    s.events.cooldown[def.id] = s.week + SC.eventsCfg.cooldownSame;
    this._announceQueue([{ def: def, kind: 'event', report: report, onClosed: cb }], s);
  },

  // ---------- registry สินทรัพย์ (id → market/cls/start/useMprev) ----------
  _reg: function () {
    if (this.__reg) return this.__reg;
    var r = {};
    SC.stocks.forEach(function (st) { r[st.id] = { market: 'stock', cls: 'stock', start: st.start, useMprev: false }; });
    SC.coins.forEach(function (c) { r[c.id] = { market: 'coin', cls: 'crypto', start: c.start, useMprev: false }; });
    r.GOLD = { market: 'gold', cls: 'gold', start: SC.goldCfg.start, useMprev: false };
    SC.funds.forEach(function (f) { r[f.id] = { market: 'fund', cls: (f.id === 'GROWTH' || f.id === 'INDEX') ? 'fundEquity' : 'fundOther', start: f.nav, useMprev: false }; });
    SC.properties.forEach(function (p) { r[p.id] = { market: 'prop', cls: 'estate', start: p.start, useMprev: true }; });
    this.__reg = r; return r;
  },

  // ---------- helper สภาพเมือง (ใช้ใน cond) ----------
  closedCount: function () { var s = SC.state; return (s && s.events) ? Object.keys(s.events.closed).length : 0; },
  // ตึกที่ "ปิดแล้วในกติกา แต่อุกกาบาตยังตกไม่ถึง" — map.js ยังวาดเป็นตึกปกติจนกว่าจะชนจริง
  _pendingHit: {},
  isPendingHit: function (id) { return !!this._pendingHit[id]; },

  // ไฟดับ (mapTime ทั้งเมือง) → ย้อมจอมืดลง ~30% ตลอดที่ผลยังอยู่ (user 2026-07-20)
  //   phoneDrop เป็น scope:'target' — ไม่ทำให้เมืองมืด
  isBlackout: function () {
    var s = SC.state;
    if (!s || !s.events) return false;
    return (s.events.active || []).some(function (e) { return e.kind === 'mapTime' && e.scope === 'all'; });
  },
  syncBlackout: function () {
    try { document.body.classList.toggle('sc-blackout', this.isBlackout()); } catch (e) {}
  },
  isClosed: function (id) { var s = SC.state; return !!(s && s.events && s.events.closed[id]); },
  anyGoldHolder: function () {
    var s = SC.state; if (!s) return false;
    var all = [s.player].concat(s.bots || []);
    return all.some(function (a) { return a.assets && (a.assets.gold || 0) > 1e-6; });
  },

  // ============================================================
  // Engine — ต้นรอบ (hook ใน flow.startRound)
  // ============================================================
  onRoundStart: function (s) {
    this.initState(s);
    // URL ?evt=<id> — ยิงต้นรอบ 1 (ข้ามทุกเงื่อนไข)
    if (s.week === 1 && this._urlEvt && !this._urlFired) {
      this._urlFired = true;
      var d0 = SC.eventById(this._urlEvt);
      if (d0) { this._fireLive(d0, s); return; }
    }
    // ข่าวบรรยากาศ regime (แม่น 80% / หลอก 20%)
    this._pushRegimeHint(s);
    // ภัยพิบัติของรอบนี้ (ถ้ามี) — ไม่ยิงตอนนี้ รอกลางเฟสแมพของ actor ที่สุ่มไว้
    this._armDisasterRound(s);

    var res = this._decideRound(s);
    var self = this;
    // apply ผลจริง (ผลกายภาพทันที · ราคาเป็น pending) แล้วเก็บ announcement
    res.announce.forEach(function (a) {
      if (a.kind === 'event') a.report = self.applyEvent(a.def, s);
      else if (a.kind === 'telegraph') self._logTelegraph(a.def, s);
      else if (a.kind === 'falseAlarm') SC.feedPush('🔮 ' + 'ตลาดปกติดี ขออภัยที่ทำตกใจ', 'event');
    });
    // UI ประกาศ (คิวทีละใบ)
    this._announceQueue(res.announce.filter(function (a) { return a.kind !== 'falseAlarm'; }), s);
  },

  // ---------- decision core (ใช้ทั้ง live + simulate — ไม่แตะ UI/ผลจริง) ----------
  //   คืน { fired:[def], announce:[{def,kind}] } · มิวเทต s.events (cooldown/telegraph/chain/history)
  _decideRound: function (s) {
    var ev = s.events, cfg = SC.eventsCfg, self = this;
    var fired = [], announce = [];

    // 1) telegraph ค้างรอบนี้ → 70% ยิงจริง / 30% หลอก
    var tgNow = ev.telegraphs.filter(function (t) { return t.round === s.week; });
    ev.telegraphs = ev.telegraphs.filter(function (t) { return t.round !== s.week; });
    tgNow.forEach(function (t) {
      var def = SC.eventById(t.eventId);
      if (def && Math.random() < cfg.telegraphFireChance && self._passesCond(def, s)) {
        fired.push(def); announce.push({ def: def, kind: 'event' });
      } else {
        announce.push({ kind: 'falseAlarm', eventId: t.eventId });
      }
    });

    // 2) chains ครบ delay → ทอย p
    var chNow = ev.chains.filter(function (c) { return c.round === s.week; });
    ev.chains = ev.chains.filter(function (c) { return c.round !== s.week; });
    chNow.forEach(function (c) {
      if (Math.random() < c.p) {
        var def = SC.eventById(c.next);
        if (def && self._passesCond(def, s)) { fired.push(def); announce.push({ def: def, kind: 'event' }); }
      }
    });

    // 3-6) ยังไม่มีเหตุการณ์ใหม่รอบนี้ → ทอยเหตุการณ์ใหม่
    if (fired.length === 0) {
      var mustFire = ev.lastEventRound < s.week - 1;   // pity: รอบก่อนว่าง → การันตี
      if (Math.random() < this._effChance(s)) {
        var picked = this._pickEvent(s, mustFire);       // mustFire → เลี่ยง neg heavy/legend (ยิงทันที)
        if (picked) {
          if (!mustFire && picked.neg && (picked.tier === 'heavy' || picked.tier === 'legend')) {
            ev.telegraphs.push({ eventId: picked.id, round: s.week + 1 });
            ev.cooldown[picked.id] = s.week + cfg.cooldownSame;
            announce.push({ def: picked, kind: 'telegraph' });
          } else {
            fired.push(picked); announce.push({ def: picked, kind: 'event' });
          }
        }
      }
    }

    // บันทึกผลของ fired: lastEventRound/cooldown/heavy/once/chains/history
    fired.forEach(function (def) {
      ev.lastEventRound = s.week;
      ev.cooldown[def.id] = s.week + cfg.cooldownSame;
      if (def.tier === 'heavy') ev.lastHeavyRound = s.week;
      if (def.once) ev.onceUsed[def.id] = true;
      def.fx.forEach(function (f) { if (f.type === 'chain') ev.chains.push({ next: f.next, p: f.p, round: s.week + (f.delay || 1) }); });
      ev.history.push({ round: s.week, id: def.id });
    });
    ev.calmBoostNext = fired.some(function (d) { return d.id === 'calmTown'; });

    return { fired: fired, announce: announce };
  },

  _effChance: function (s) {
    var ev = s.events, cfg = SC.eventsCfg;
    var im = cfg.intensityMods[cfg.intensity] || cfg.intensityMods['ปกติ'];
    var p = im.chance;
    if (ev.lastEventRound < s.week - 1) p = 1.0;             // pity
    if (ev.regime === 'crisis') p = Math.min(1.0, p * 1.3);
    return Math.min(1.0, p);
  },

  _passesCond: function (def, s) {
    if (def.cond) { try { return !!def.cond(s); } catch (e) { return false; } }
    return true;
  },

  // เลือกเหตุการณ์: สุ่ม tier ตามน้ำหนัก → ลด tier ถ้าว่าง → สุ่มใน tier ตาม w
  _pickEvent: function (s, avoidTelegraph) {
    var cfg = SC.eventsCfg, ev = s.events, self = this;
    var pool = SC.eventCatalog.filter(function (def) {
      if (def.w <= 0) return false;                                        // chain-only
      if (def.disaster) return false;                                      // ภัยปิดตึก = คุมด้วยโควตาแยก (planDisasters)
      if (ev.cooldown[def.id] && s.week <= ev.cooldown[def.id]) return false;
      if (!self._passesCond(def, s)) return false;
      var lastWeek = SC.config.weeks; // จำนวนรอบเลือกได้แล้ว (2026-07-20) — กติกา "รอบสุดท้าย" อิงค่าจริง ไม่ใช่ 10 ตายตัว
      if (s.week === 1 && (def.tier === 'heavy' || def.tier === 'legend')) return false;
      if (def.tier === 'legend' && (s.week < cfg.legendRounds[0] || s.week > Math.min(cfg.legendRounds[1], lastWeek - 1))) return false;
      if (s.week === lastWeek && def.neg && (def.tier === 'heavy' || def.tier === 'legend')) return false;
      if (def.tier === 'heavy' && ev.lastHeavyRound === s.week - 1) return false; // heavy 2 รอบติด ห้าม
      if (avoidTelegraph && def.neg && (def.tier === 'heavy' || def.tier === 'legend')) return false;
      return true;
    });
    if (!pool.length) return null;

    var order = ['legend', 'heavy', 'mid', 'light'];
    var weights = {};
    order.forEach(function (t) { weights[t] = cfg.tierWeights[t] || 0; });
    if (ev.calmBoostNext) weights.heavy *= 1.5;                            // รอบหลัง calmTown

    // สุ่ม tier ตามน้ำหนัก
    var totW = order.reduce(function (a, t) { return a + weights[t]; }, 0);
    var r = Math.random() * totW, acc = 0, chosen = 'light';
    for (var i = 0; i < order.length; i++) { acc += weights[order[i]]; if (r <= acc) { chosen = order[i]; break; } }
    // ลด tier ลงจนเจอ candidate
    var ci = order.indexOf(chosen);
    for (var j = ci; j < order.length; j++) {
      var cands = pool.filter(function (d) { return d.tier === order[j]; });
      if (cands.length) return this._weightedPick(cands);
    }
    // เผื่อเลือก tier เบากว่าที่ pool มีอยู่ (เช่นสุ่มได้ light แต่ light ว่าง) → ไล่ขึ้น
    for (var k = ci - 1; k >= 0; k--) {
      var c2 = pool.filter(function (d) { return d.tier === order[k]; });
      if (c2.length) return this._weightedPick(c2);
    }
    return null;
  },
  _weightedPick: function (arr) {
    var tot = arr.reduce(function (a, d) { return a + d.w; }, 0);
    var r = Math.random() * tot, acc = 0;
    for (var i = 0; i < arr.length; i++) { acc += arr[i].w; if (r <= acc) return arr[i]; }
    return arr[arr.length - 1];
  },

  // ============================================================
  // apply ผลของเหตุการณ์ (EVENTS_SPEC ข้อ 5)
  // ============================================================
  applyEvent: function (def, s) {
    var meta = { named: {}, actor: null, closedId: null, closedIds: [], report: [] };
    this._collectNamed(def.fx, meta);
    // เจาะบุคคล: เลือกเป้าเดียวใช้ทั้งเหตุการณ์ (เลี่ยงคนเดิม 2 ครั้งติดถ้า targetNeg)
    if (def.personal) meta.actor = this._pickActor(s, 'random', def.targetNeg ? s.events.lastTargetNeg : null);
    var self = this;
    if (s.events) s.events.hitTargets = [];   // ล้างชุดเป้าเก่า (คัตซีนอ่านของรอบนี้เท่านั้น)
    def.fx.forEach(function (fx) { self.apply(fx, s, meta); });
    // ฟีด + ไทม์ไลน์ — ใช้สรุปผลจริง (อ่านรู้เรื่องกว่า flavor เฉยๆ)
    var sum = meta.report.length ? meta.report.join(' · ') : (def.flavor || '');
    SC.feedPush('📌 ' + def.emoji + ' ' + def.name + (sum ? ' — ' + sum : ''), 'event');
    SC.timelinePush(def.emoji + ' ' + def.name + (sum ? ' — ' + sum : ''), 'event');
    return meta.report;
  },

  // ---------- ตัวช่วยข้อความรายงานผล (โชว์บนหนังสือพิมพ์ให้ผู้เล่นเข้าใจทันที) ----------
  _groupLabels: {
    stocksAll: 'หุ้นทุกตัว', stocksOther: 'หุ้นตัวอื่นๆ', cryptoAll: 'คริปโตทุกเหรียญ',
    cryptoOther: 'เหรียญอื่นๆ', estateAll: 'อสังหาฯ ทุกแปลง', riverside: 'ที่ดินริมแม่น้ำ',
    fundEquity: 'กองทุนหุ้น',
  },
  _assetName: function (id) {
    var t = SC.newsSys && SC.newsSys.target ? SC.newsSys.target(id) : null;
    return (t && t.name) ? t.name : id;
  },
  _pctTxt: function (v) { var p = Math.round(v * 100); return (p > 0 ? '+' : '') + p + '%'; },
  _who: function (t) { return t.isPlayer ? 'คุณ' : t.name; },

  _collectNamed: function (fxList, meta) {
    var self = this;
    (fxList || []).forEach(function (f) {
      if (f.asset) meta.named[f.asset] = true;
      if (f.then) self._collectNamed(f.then, meta);
      if (f.else) self._collectNamed(f.else, meta);
      if (f.cancels) self._collectNamed(f.cancels, meta);
    });
  },

  apply: function (fx, s, meta) {
    meta = meta || { named: {} };
    if (!meta.report) meta.report = [];
    var ev = s.events, self = this;
    var rep = function (txt) { meta.report.push(txt); };
    var roundsTxt = function (n, unit) { return ' (' + n + ' ' + (unit || 'รอบ') + ')'; };
    switch (fx.type) {
      case 'priceMult': this._schedulePriceMult(this._resolveIds(fx, meta), fx, s, meta); return;
      case 'chain': return;   // schedule แล้วใน _decideRound
      case 'regimeSet':
        ev.regime = fx.to; ev.regimeForced = s.week;
        if (fx.to === 'crisis') rep('เศรษฐกิจเข้าสู่ภาวะวิกฤต — สินทรัพย์เสี่ยงจะร่วงต่อเนื่อง');
        return;
      case 'rateSet':
        ev.rates = { dep: fx.dep, loan: fx.loan, roundsLeft: fx.rounds };
        rep('ดอกเบี้ยธนาคาร: ฝาก ' + (fx.dep * 100).toFixed(1) + '% · กู้ ' + (fx.loan * 100).toFixed(1) + '%' + roundsTxt(fx.rounds));
        return;
      case 'rentMult':
        ev.active.push({ kind: 'rent', v: fx.v, rounds: fx.rounds });
        rep('ค่าเช่าอสังหาฯ ' + (fx.v >= 1 ? '×' + fx.v : this._pctTxt(fx.v - 1)) + roundsTxt(fx.rounds));
        return;
      case 'divMult':
        ev.active.push({ kind: 'div', v: fx.v, rounds: fx.rounds });
        rep('เงินปันผล ' + (fx.v >= 1 ? '×' + fx.v : this._pctTxt(fx.v - 1)) + roundsTxt(fx.rounds));
        return;
      case 'custMult':
        ev.active.push({ kind: 'cust', v: fx.v, rounds: fx.rounds, bizTypes: fx.bizTypes || null });
        rep('ลูกค้าธุรกิจ' + (fx.bizTypes ? ' (บางประเภท)' : '') + ' ' + this._pctTxt(fx.v - 1) + roundsTxt(fx.rounds, 'เดือน'));
        return;
      case 'fixedMult':
        ev.active.push({ kind: 'fixed', v: fx.v, rounds: fx.rounds });
        rep('ต้นทุนคงที่ธุรกิจ ' + this._pctTxt(fx.v - 1) + roundsTxt(fx.rounds, 'เดือน'));
        return;
      case 'volMult':
        ev.active.push({ kind: 'vol', v: fx.v, rounds: fx.rounds, market: fx.market || null });
        rep('ตลาด' + (fx.market === 'crypto' ? 'คริปโต' : fx.market === 'stock' ? 'หุ้น' : '') + 'ผันผวนขึ้น ×' + fx.v + roundsTxt(fx.rounds));
        return;
      case 'speedMult':
        ev.active.push({ kind: 'speed', v: fx.v, rounds: fx.rounds });
        rep('ทุกคนเดินช้าลง ' + Math.round((1 - fx.v) * 100) + '%' + roundsTxt(fx.rounds));
        return;
      case 'mapTime': {
        var e = { kind: 'mapTime', sec: fx.sec, rounds: fx.rounds, scope: fx.scope || 'all' };
        if (fx.scope === 'target') {
          var a = meta.actor || this._pickActor(s, fx.pick || 'random'); e.targetId = a.id;
          rep(this._who(a) + ' เหลือเวลาเฟสแมพ ' + fx.sec + ' วิ ในเทิร์นถัดไป');
        } else rep('เฟสแมพทุกคนเหลือ ' + fx.sec + ' วิ' + roundsTxt(fx.rounds));
        ev.active.push(e); this.syncBlackout(); return;
      }
      case 'cashAll': {
        [s.player].concat(s.bots || []).forEach(function (a) {
          if (fx.amt >= 0) a.cash += fx.amt; else SC.attacks.pay(a, null, -fx.amt);
        });
        rep('ทุกคน' + (fx.amt >= 0 ? 'ได้รับเงิน ' : 'เสียเงิน ') + SC.ui.money(Math.abs(fx.amt)) + (fx.label ? ' (' + fx.label + ')' : ''));
        if (SC.ui.renderHUD) SC.ui.renderHUD();
        return;
      }
      case 'cashTarget': {
        var t = (fx.pick === 'player') ? s.player : (meta.actor || this._pickActor(s, fx.pick || 'random', (fx.amt < 0 && meta.actor == null) ? ev.lastTargetNeg : null));
        if (fx.amt >= 0) t.cash += fx.amt; else { SC.attacks.pay(t, null, -fx.amt); ev.lastTargetNeg = t.id; }
        rep(this._who(t) + (fx.amt >= 0 ? ' ได้รับเงิน ' : ' เสียเงิน ') + SC.ui.money(Math.abs(fx.amt)));
        if (fx.tax && Math.random() < fx.tax.p) {
          SC.attacks.pay(t, null, -fx.tax.amt);
          rep(fx.tax.msg + ' −' + SC.ui.money(fx.tax.amt));
          SC.feedPush('💸 ' + this._who(t) + ' — ' + fx.tax.msg, 'event');
        }
        if (SC.ui.renderHUD) SC.ui.renderHUD();
        return;
      }
      case 'forceBuy': {
        var tf = meta.actor || this._pickActor(s, fx.pick || 'random');
        var budget = Math.min((tf.cash || 0) * fx.pctCash, fx.cap);
        var st = SC.stocks[Math.floor(Math.random() * SC.stocks.length)];
        var qty = Math.floor(budget / s.prices[st.id]);
        if (qty > 0) {
          SC.trade.buy(tf, st.id, qty);
          rep(this._who(tf) + ' เผลอซื้อหุ้น ' + st.name + ' ' + qty + ' หุ้น (' + SC.ui.money(qty * s.prices[st.id]) + ')');
          SC.feedPush('🐈 ' + this._who(tf) + ' บังเอิญซื้อ ' + st.name + ' ' + qty + ' หุ้น!', 'event');
          if (SC.ui.renderHUD) SC.ui.renderHUD();
        } else rep(this._who(tf) + ' รอดตัว — แมวไม่ได้กดซื้ออะไร');
        return;
      }
      case 'giveInsiderCard': {
        var tg = meta.actor || this._pickActor(s, fx.pick || 'random');
        var c = SC.newsSys.drawTo(tg);
        rep(this._who(tg) + ' ได้การ์ดข่าววงในฟรี 1 ใบ (จริงหรือปลอมไม่รู้)');
        if (c && tg.isPlayer) SC.feedPush('🤫 คุณได้การ์ดข่าววงในฟรี 1 ใบจากลุงข้างบ้าน', 'event');
        return;
      }
      case 'flipLastPublicNews': {
        var arr = s.pubNews.filter(function (n) { return !n.rumor && n.dueRound > s.week; });
        var last = arr[arr.length - 1];
        if (last) {
          last.dir = -last.dir; last.headline = SC.newsSys._headline(last.asset, last.dir, last.size);
          rep('ข่าวสาธารณะใบล่าสุดกลับทิศ: "' + last.headline + '"');
          SC.feedPush('📰 ข่าวสาธารณะกลับทิศ (พิมพ์ผิด?): ' + last.headline, 'event');
        } else rep('โชคดี — ไม่มีข่าวค้างให้พิมพ์ผิด');
        return;
      }
      case 'closeBuilding': {
        var id = this._pickBuilding(s, fx.pick);
        if (id) {
          ev.closed[id] = fx.rounds; meta.closedId = id; meta.closedIds.push(id);
          ev.lastClosedId = id;   // คัตซีนอุกกาบาตใช้เล็งจุดชนของ "ลูกหลัก"
          var b = SC.map.cityById(id); if (b) b._popT = null;
          rep('🚧 ' + (b ? b.name : id) + ' ปิดซ่อม ' + fx.rounds + ' รอบ — เข้าตึกไม่ได้');
          SC.feedPush('🚧 ' + (b ? b.name : id) + ' ปิดซ่อม ' + fx.rounds + ' รอบ', 'event');
        }
        return;
      }
      // ภัยลงหลายตึก (ฝนอุกกาบาต / พายุพัดผ่าน): ตึกที่เหลือ 0..maxExtra ปิดสั้นกว่าตึกหลัก
      //   เลือกที่นี่ ไม่ใช่ในคัตซีน — ภาพกับผลจริงต้องเป็นชุดเดียวกัน (ev.hitTargets)
      case 'closeExtra': {
        var extra = Math.floor(Math.random() * ((fx.maxExtra || 2) + 1));
        var hits = [];
        for (var mi = 0; mi < extra; mi++) {
          var xid = this._pickBuilding(s, 'random');
          if (!xid) break;
          ev.closed[xid] = fx.rounds; meta.closedIds.push(xid); hits.push(xid);
          var xb = SC.map.cityById(xid); if (xb) xb._popT = null;
          rep('🚧 ' + (xb ? xb.name : xid) + ' ปิดซ่อม ' + fx.rounds + ' รอบ — เข้าตึกไม่ได้');
          SC.feedPush('🚧 ' + (xb ? xb.name : xid) + ' ปิดซ่อม ' + fx.rounds + ' รอบ', 'event');
        }
        // ลำดับในคัตซีน: ตึกรอง → ตึกหลัก (ที่ปิดนานสุด) ปิดท้าย
        ev.hitTargets = hits.concat(meta.closedId ? [meta.closedId] : []);
        return;
      }
      case 'ifBuilding': { if (meta.closedIds.indexOf(fx.is) >= 0) fx.then.forEach(function (f) { self.apply(f, s, meta); }); return; }
      case 'ifCond': {
        var ok = true; try { ok = !!fx.test(); } catch (e2) { ok = false; }
        (ok ? (fx.then || []) : (fx.else || [])).forEach(function (f) { self.apply(f, s, meta); });
        return;
      }
      case 'apLock': ev.apLocked = true; rep('ใช้ AP ธุรกิจไม่ได้ระหว่างตึกปิด (รายได้ยังเข้า)'); return;
      case 'goldTheft': {
        [s.player].concat(s.bots || []).forEach(function (a) {
          if (!a.assets || !(a.assets.gold > 1e-6)) return;
          var lv = Math.min(3, a.assets.goldSecLv || 0);
          var frac = fx.lossBySec[lv];
          if (lv >= 3) {
            a.cash += fx.reward;
            rep(self._who(a) + ' ตู้เซฟระดับ 3 จับโจรได้ — รับรางวัล ' + SC.ui.money(fx.reward));
            if (a.isPlayer) SC.feedPush('🦹 โจรบุกแต่ระบบเลเซอร์จับได้! คุณรับรางวัล ' + SC.ui.money(fx.reward), 'event');
          } else if (frac > 0) {
            var lost = a.assets.gold * frac; a.assets.gold -= lost;
            rep(self._who(a) + ' โดนขโมยทอง ' + lost.toFixed(1) + ' กรัม (ตู้เซฟระดับ ' + lv + ')');
            if (a.isPlayer) SC.feedPush('🦹 โจรขโมยทองไป ' + lost.toFixed(1) + ' กรัม (ระดับตู้เซฟ ' + lv + ')', 'event');
          }
        });
        if (!meta.report.length) rep('โจรบุกแต่ไม่มีใครถือทอง — กลับมือเปล่า');
        return;
      }
      case 'solarBonus': {
        var g = SC.greenhub && SC.greenhub.hasBiz() ? SC.greenhub.ensure() : null;
        if (g && (g.items.solarOwn || g.items.solarRent)) {
          s.player.cash += fx.amt;
          rep('คุณมีโซลาร์เซลล์ — ขายไฟให้เพื่อนบ้าน +' + SC.ui.money(fx.amt));
          SC.feedPush('☀️ ไฟดับแต่คุณมีโซลาร์ — ' + (fx.label || '') + ' +' + SC.ui.money(fx.amt), 'event');
          if (SC.ui.renderHUD) SC.ui.renderHUD();
        }
        return;
      }
      case 'botSkipMap': {
        var bots = s.bots || []; if (!bots.length) return;
        var bb = bots[Math.floor(Math.random() * bots.length)];
        bb._skipMapRound = s.week;
        rep(bb.name + ' ข้ามเฟสแมพรอบนี้ (ยืนหน้าน้ำพุ)');
        SC.feedPush('🤖 ' + bb.name + ' ขอตัวเข้าห้องน้ำ — ข้ามเฟสแมพรอบนี้', 'event');
        return;
      }
      case 'prophecy': {
        var pool = ['PTT', 'CPALL', 'AOT', 'KBANK', 'MEME', 'BTC', 'ETH', 'SOL', 'GOLD'];
        var asset = pool[Math.floor(Math.random() * pool.length)];
        var dir = Math.random() < 0.5 ? 1 : -1;
        ev.prophecy = { asset: asset, dir: dir, round: s.week, base: this._priceOf(asset) };
        var nm = (SC.newsSys.target(asset) || {}).name || asset;
        rep('หมอดูทำนาย: "' + nm + '" จะ' + (dir > 0 ? 'ขึ้น 📈' : 'ลง 📉') + ' รอบหน้า — เชื่อหรือไม่แล้วแต่คุณ');
        SC.feedPush('🧙 หมอดูทำนาย: "' + nm + '" จะ' + (dir > 0 ? 'ขึ้น 📈' : 'ลง 📉') + ' รอบหน้า', 'event');
        return;
      }
      case 'calm':
        ev.active.push({ kind: 'vol', v: 0.5, rounds: 1, market: null });
        rep('ตลาดสงบ: ความผันผวนลดครึ่งหนึ่งรอบนี้ — แต่ความสงบมักมาก่อนพายุ');
        return;
      case 'greenRep': {
        if (SC.greenhub && SC.greenhub.hasBiz()) { var gg = SC.greenhub.ensure(); gg.rep = Math.min(100, gg.rep + fx.amt); rep('ชื่อเสียงธุรกิจ +' + fx.amt); }
        return;
      }
      case 'feed': rep(fx.text); SC.feedPush('📌 ' + fx.text, 'event'); return;
      case 'choice': rep('ต้องเลือก: จ่าย ' + SC.ui.money(fx.cost) + ' แก้ปัญหา หรือยอมรับผลกระทบ'); return this._choice(fx, s);
    }
  },

  // popup ratLive — ผู้เล่นเลือกจ่าย/ยอม · (เฉพาะธุรกิจผู้เล่น)
  _choice: function (fx, s) {
    var self = this, p = s.player;
    var applyCancel = function () { fx.cancels.forEach(function (f) { self.apply(f, s, {}); }); };
    if (p.cash < fx.cost) { applyCancel(); return; }   // จ่ายไม่ไหว = ยอมโดน
    if (!SC.duel || !SC.duel.popup) { applyCancel(); return; }
    SC.duel.popup('<h3>🐀 ' + fx.label.split('!')[0] + '!</h3><p>' + fx.label + '</p>',
      [{ label: '💵 จ่าย ' + SC.ui.money(fx.cost), cls: 'btn-go', fn: function () { p.cash -= fx.cost; if (SC.ui.renderHUD) SC.ui.renderHUD(); } },
       { label: '🙈 ปล่อยไป (ยอมโดน)', cls: '', fn: applyCancel }]);
  },

  // ---------- ตัวช่วย apply ----------
  _resolveIds: function (f, meta) {
    if (f.asset) return [f.asset];
    if (f.pick === 'stock') {
      var pool = SC.stocks.map(function (s) { return s.id; }).filter(function (id) { return !(f.exclude && f.exclude.indexOf(id) >= 0); });
      return pool.length ? [pool[Math.floor(Math.random() * pool.length)]] : [];
    }
    if (f.group === 'stocksOther') return SC.eventGroups.stocksAll.filter(function (id) { return !meta.named[id]; });
    if (f.group === 'cryptoOther') return SC.eventGroups.cryptoAll.filter(function (id) { return !meta.named[id]; });
    if (f.group) return SC.eventGroups[f.group] ? SC.eventGroups[f.group].slice() : [];
    return [];
  },
  _schedulePriceMult: function (ids, f, s, meta) {
    var ev = s.events; if (!ev.pendingMult) ev.pendingMult = [];
    var round = s.week + (f.delay || 0);
    var im = SC.eventsCfg.intensityMods[SC.eventsCfg.intensity] || { size: 1 };
    var firstV = null;
    ids.forEach(function (id) {
      var v = (f.vMin != null) ? (f.vMin + Math.random() * (f.vMax - f.vMin)) : f.v;
      v *= im.size;
      if (firstV == null) firstV = v;
      ev.pendingMult.push({ round: round, id: id, v: v });
    });
    // รายงานผลอ่านรู้เรื่อง: "ราคา PTT +12% ท้ายรอบนี้" / "หุ้นทุกตัว −4%"
    if (meta && meta.report && ids.length && firstV != null) {
      var label = f.group ? (this._groupLabels[f.group] || f.group) : this._assetName(ids[0]);
      meta.report.push('ราคา' + label + ' ' + this._pctTxt(firstV) + (f.delay ? ' (ท้ายรอบหน้า)' : ' ท้ายรอบนี้'));
    }
  },
  _pickActor: function (s, mode, avoidId) {
    var all = [s.player].concat(s.bots || []);
    if (mode === 'player') return s.player;
    if (mode === 'randomBot') { var bs = s.bots || []; return bs[Math.floor(Math.random() * bs.length)] || s.player; }
    if (mode === 'richest' || mode === 'poorest') {
      var sorted = all.slice().sort(function (a, b) { return SC.portfolioValue(b, s.prices) - SC.portfolioValue(a, s.prices); });
      return mode === 'richest' ? sorted[0] : sorted[sorted.length - 1];
    }
    // random (เท่ากันทุกคน) — เลี่ยง avoidId ถ้าทำได้
    var cand = all.filter(function (a) { return a.id !== avoidId; });
    if (!cand.length) cand = all;
    return cand[Math.floor(Math.random() * cand.length)];
  },
  _pickBuilding: function (s, pick) {
    if (pick && pick !== 'random') { return this.isClosed(pick) ? null : pick; }
    // random: ตึกที่มีหน้าต่าง ยกเว้น gold (ปิดไม่ได้เด็ดขาด) + ที่ปิดอยู่แล้ว
    var ids = SC.map.city.map(function (b) { return b.id; }).filter(function (id) { return id !== 'gold' && !SC.events.isClosed(id); });
    return ids.length ? ids[Math.floor(Math.random() * ids.length)] : null;
  },
  _priceOf: function (key) {
    var s = SC.state;
    if (s.prices[key] != null) return s.prices[key];
    if (key === 'GOLD') return SC.markets.goldPrice();
    if (s.markets && s.markets.coin[key]) return SC.markets.coinPrice(key);
    return 0;
  },

  _logTelegraph: function (def, s) {
    var msg = def.telegraph || 'มีสัญญาณไม่ดีในตลาด';
    SC.feedPush('🔮 คำเตือน: ' + msg, 'event');
    SC.timelinePush('🔮 คำเตือน: ' + msg + ' (' + def.name + ')', 'event');
  },
  _pushRegimeHint: function (s) {
    var reg = s.events.regime;
    var honest = Math.random() < 0.8;
    var key = honest ? reg : (['boom', 'slump', 'crisis', 'normal'][Math.floor(Math.random() * 4)]);
    var pool = SC.regimeHints[key] || SC.regimeHints.normal;
    SC.feedPush('🌤️ ' + pool[Math.floor(Math.random() * pool.length)], 'regimeHint');
  },

  // ============================================================
  // ราคาแบบมี correlation (EVENTS_SPEC ข้อ 4)
  // ============================================================
  prepareMarket: function (s) {
    this.initState(s);
    var g = (Math.random() + Math.random() + Math.random() + Math.random()) - 2;  // ผลรวม rand 4 ตัว −2 (~normal)
    var wild = Math.random() < SC.eventsCfg.wildChance ? SC.eventsCfg.wildMult : 1;
    this.market = { M: g, wild: wild, Mprev: s.events.lastM };
    s.events.lastM = g;
  },

  regimeMods: function (s) {
    var R = {
      boom:   { stock: 0.02,  crypto: 0.04,  gold: -0.01, estate: 0.01,   fundEquity: 0.015,  vol: 0.9 },
      slump:  { stock: -0.02, crypto: -0.04, gold: 0.01,  estate: -0.005, fundEquity: -0.015, vol: 1.15 },
      crisis: { stock: -0.06, crypto: -0.12, gold: 0.04,  estate: -0.02,  fundEquity: -0.04,  vol: 1.8 },
      normal: { stock: 0, crypto: 0, gold: 0, estate: 0, fundEquity: 0, vol: 1.0 },
    };
    return R[(s || SC.state).events.regime] || R.normal;
  },
  _regimeDriftFor: function (cls, mods) {
    if (cls === 'stock') return mods.stock;
    if (cls === 'crypto') return mods.crypto;
    if (cls === 'gold') return mods.gold;
    if (cls === 'estate') return mods.estate;
    if (cls === 'fundEquity') return mods.fundEquity;
    return 0; // fundOther / อื่นๆ
  },
  _betaFor: function (id, cls, M) {
    if (cls === 'gold') return M < -1 ? -0.9 : -0.4;
    if (cls === 'estate') return 0.35;
    return (SC.eventBeta[id] != null) ? SC.eventBeta[id] : (cls === 'stock' ? 0.8 : 1);
  },
  eventDrift: function (id, cls) {
    var ev = SC.state.events, d = 0;
    if (cls === 'gold') d += SC.eventsCfg.goldClosedDrift * this.closedCount();   // ตึกยิ่งปิด ทองยิ่งขึ้น
    if (ev.capPull && ev.capPull[id]) d += ev.capPull[id];
    return d;
  },
  eventMult: function (id) {
    var ev = SC.state.events, m = 1;
    (ev.pendingMult || []).forEach(function (pm) { if (pm.id === id && pm.round === SC.state.week) m *= (1 + pm.v); });
    return m;
  },
  volMultFor: function (cls) {
    var ev = SC.state.events, m = 1;
    (ev.active || []).forEach(function (e) {
      if (e.kind !== 'vol') return;
      if (!e.market || (e.market === 'crypto' && cls === 'crypto') || (e.market === 'stock' && cls === 'stock')) m *= e.v;
    });
    return m;
  },
  _capUpdate: function (id, np, cls) {
    var reg = this._reg()[id]; if (!reg) return;
    var ev = SC.state.events; if (!ev.capPull) ev.capPull = {};
    var cfg = SC.eventsCfg;
    if (np > cfg.priceCapHi * reg.start) ev.capPull[id] = -cfg.capPullback;
    else if (np < cfg.priceCapLo * reg.start) ev.capPull[id] = cfg.capPullback;
    else delete ev.capPull[id];
  },

  // ราคาใหม่ตามสูตรข้อ 4 (ใช้ทุกตลาดที่ราคาขยับ ยกเว้นพันธบัตร) — ไม่มี market = fallback สูตรเดิม
  stepAsset: function (price, id, drift, vol) {
    var s = SC.state, mk = this.market;
    if (!mk || !s || !s.events) { var r0 = drift + (Math.random() * 2 - 1) * vol; return Math.max(0.01, price * (1 + r0)); }
    var reg = this._reg()[id] || { cls: 'stock', useMprev: false };
    var mods = this.regimeMods(s);
    var M = reg.useMprev ? mk.Mprev : mk.M;
    var beta = this._betaFor(id, reg.cls, M);
    var vBoost = s.events.volBoost > 0 ? SC.eventsCfg.volBoostMult : 1;
    var volEff = vol * mods.vol * vBoost * this.volMultFor(reg.cls);
    var idio = (Math.random() * 2 - 1);
    var r = drift + this._regimeDriftFor(reg.cls, mods) + this.eventDrift(id, reg.cls) +
            beta * M * volEff * mk.wild + idio * volEff * SC.eventsCfg.idioScale;
    var np = Math.max(0.01, price * (1 + r) * this.eventMult(id));
    this._capUpdate(id, np, reg.cls);
    return np;
  },

  // Markov regime เดิน 1 ก้าว (เรียกใน resolve ก่อนราคา)
  advanceRegime: function (s) {
    var ev = s.events;
    if (ev.regimeForced === s.week) return;                 // ถูกบังคับรอบนี้ — คงไว้ให้ราคาใช้
    var T = {
      normal: { normal: 0.70, boom: 0.15, slump: 0.15, crisis: 0 },
      boom:   { normal: 0.25, boom: 0.60, slump: 0, crisis: 0.15 },
      slump:  { normal: 0.35, boom: 0, slump: 0.55, crisis: 0.10 },
      crisis: { normal: 0.45, boom: 0.15, slump: 0, crisis: 0.40 },
    };
    var row = {}, base = T[ev.regime] || T.normal;
    ['normal', 'boom', 'slump', 'crisis'].forEach(function (k) { row[k] = base[k] || 0; });
    if (ev.regime === 'boom' && ev.boomStreak >= 1) {       // ดัชนีฟองสบู่ +0.05/รอบ boom ตั้งแต่รอบ 2
      var add = 0.05 * ev.boomStreak;
      row.crisis += add; row.boom = Math.max(0, row.boom - add);
    }
    var keys = ['normal', 'boom', 'slump', 'crisis'];
    var tot = keys.reduce(function (a, k) { return a + row[k]; }, 0) || 1;
    var r = Math.random() * tot, acc = 0, next = 'normal';
    for (var i = 0; i < keys.length; i++) { acc += row[keys[i]]; if (r <= acc) { next = keys[i]; break; } }
    if (next === 'boom') ev.boomStreak = (ev.regime === 'boom') ? ev.boomStreak + 1 : 0;
    else ev.boomStreak = 0;
    ev.regime = next;
  },

  // ============================================================
  // ท้ายรอบ (เรียกใน resolve หลังคิดราคา/รายได้ทุกอย่าง)
  // ============================================================
  onRoundEnd: function (s) {
    var ev = s.events;
    this._revealProphecy(s);
    // ลดตัวนับ active (ตัวคูณ/เวลา) — apply รอบนี้แล้ว ค่อยลด
    ev.active = (ev.active || []).filter(function (e) { e.rounds--; return e.rounds > 0; });
    this.syncBlackout();   // ไฟดับหมดฤทธิ์ → คืนความสว่างจอ
    // ตึกปิด — ลด → เปิดคืน
    Object.keys(ev.closed).forEach(function (id) { ev.closed[id]--; if (ev.closed[id] <= 0) delete ev.closed[id]; });
    if (!ev.closed.startup) ev.apLocked = false;
    // ดอกเบี้ยธนาคาร — คืน default เมื่อครบ
    if (ev.rates.roundsLeft > 0) { ev.rates.roundsLeft--; if (ev.rates.roundsLeft <= 0) { ev.rates.dep = SC.config.bank.depositRate; ev.rates.loan = SC.config.bank.loanRate; } }
    // volatility clustering
    if (ev.volBoost > 0) ev.volBoost--;
    // volBoost ตั้งใหม่ถ้ารอบนี้มี heavy/legend fire
    var hadHeavy = ev.history.some(function (h) { return h.round === s.week && (SC.eventById(h.id) || {}).tier && ['heavy', 'legend'].indexOf(SC.eventById(h.id).tier) >= 0; });
    if (hadHeavy) ev.volBoost = SC.eventsCfg.volBoostRounds;
    // purge pending price mult ที่ apply ไปแล้ว
    ev.pendingMult = (ev.pendingMult || []).filter(function (pm) { return pm.round > s.week; });
  },

  _revealProphecy: function (s) {
    var ev = s.events, pr = ev.prophecy;
    if (!pr || pr.round >= s.week) return;   // เฉลยรอบถัดจากที่ทำนาย
    var now = this._priceOf(pr.asset);
    var up = now >= pr.base;
    var hit = (up && pr.dir > 0) || (!up && pr.dir < 0);
    var nm = (SC.newsSys.target(pr.asset) || {}).name || pr.asset;
    SC.feedPush('🧙 เฉลยคำทำนาย "' + nm + '": ' + (hit ? 'แม่น! ✓' : 'พลาด ✗'), 'event');
    ev.prophecy = null;
  },

  // ---------- getters ให้ไฟล์อื่นอ่าน (default = ค่ากลาง) ----------
  _mult: function (kind, filterFn) {
    var s = SC.state; if (!s || !s.events) return 1;
    var m = 1;
    s.events.active.forEach(function (e) { if (e.kind === kind && (!filterFn || filterFn(e))) m *= e.v; });
    return m;
  },
  rentMult: function () { return this._mult('rent'); },
  divMult: function () { return this._mult('div'); },
  fixedMult: function () { return this._mult('fixed'); },
  custMult: function (bizType) { return this._mult('cust', function (e) { return !e.bizTypes || e.bizTypes.indexOf(bizType) >= 0; }); },
  speed: function () { return this._mult('speed'); },
  rates: function () { var s = SC.state; return (s && s.events) ? s.events.rates : { dep: SC.config.bank.depositRate, loan: SC.config.bank.loanRate }; },
  apLocked: function () { var s = SC.state; return !!(s && s.events && s.events.apLocked); },
  mapTimeSec: function (actor) {
    var s = SC.state; if (!s || !s.events) return null;
    var best = null;
    s.events.active.forEach(function (e) {
      if (e.kind !== 'mapTime') return;
      if (e.scope === 'all' || (e.scope === 'target' && actor && e.targetId === actor.id)) {
        best = (best == null) ? e.sec : Math.min(best, e.sec);
      }
    });
    return best;
  },

  // ============================================================
  // Debug (EVENTS_SPEC ข้อ 12)
  // ============================================================
  _fireLive: function (def, s) {
    var report = this.applyEvent(def, s);
    def.fx.forEach(function (f) { if (f.type === 'chain') s.events.chains.push({ next: f.next, p: f.p, round: s.week + (f.delay || 1) }); });
    s.events.history.push({ round: s.week, id: def.id });
    s.events.lastEventRound = s.week;
    this._announceQueue([{ def: def, kind: 'event', report: report }], s);
  },
  debugFire: function (id) {
    var s = SC.state; if (!s) { console.warn('ยังไม่เริ่มเกม'); return; }
    this.initState(s);
    var def = SC.eventById(id);
    if (!def) { console.warn('ไม่พบเหตุการณ์ id:', id); return; }
    this._fireLive(def, s);
    console.log('🔥 ยิงเหตุการณ์:', id);
  },
  debugRegime: function (to) {
    var s = SC.state; if (!s) return;
    this.initState(s); s.events.regime = to; s.events.regimeForced = s.week;
    console.log('regime →', to);
  },
  state: function () {
    var s = SC.state; if (!s || !s.events) { console.log('ยังไม่มี s.events'); return null; }
    var e = s.events;
    var dump = {
      week: s.week, regime: e.regime, boomStreak: e.boomStreak, volBoost: e.volBoost,
      closed: e.closed, rates: e.rates, active: e.active, telegraphs: e.telegraphs,
      chains: e.chains, pendingMult: e.pendingMult.length, cooldown: e.cooldown,
      lastEventRound: e.lastEventRound, history: e.history,
    };
    console.log('=== SC.events.state ===', dump);
    return dump;
  },

  // จำลองการทอย 1000 เกม (ไม่แตะ UI/ผลจริง) — พิมพ์สถิติ
  simulate: function (n) {
    n = n || 1000;
    var real = SC.state, reg0 = this.__reg;
    var counts = [], tierCounts = { light: 0, mid: 0, heavy: 0, legend: 0 }, total = 0, maxGap = 0;
    for (var g = 0; g < n; g++) {
      var fs = this._fakeState();
      SC.state = fs;
      var cnt = 0, gap = 0, gmax = 0;
      for (var w = 1; w <= SC.config.weeks; w++) {
        fs.week = w;
        var res = this._decideRound(fs);
        if (res.fired.length) { gap = 0; res.fired.forEach(function (d) { cnt++; total++; tierCounts[d.tier] = (tierCounts[d.tier] || 0) + 1; }); }
        else { gap++; if (gap > gmax) gmax = gap; }
      }
      counts.push(cnt);
      if (gmax > maxGap) maxGap = gmax;
    }
    SC.state = real; this.__reg = reg0;
    var avg = total / n;
    var tierPct = {}; Object.keys(tierCounts).forEach(function (k) { tierPct[k] = (tierCounts[k] / total * 100); });
    var out = { games: n, avgPerGame: +avg.toFixed(2), maxGap: maxGap, tierCounts: tierCounts, tierPct: tierPct };
    console.log('=== simulate(' + n + ') ===');
    console.log('เฉลี่ย/เกม:', out.avgPerGame, '(เป้า 6–8)');
    console.log('ช่องว่างยาวสุด (รอบติดกันไม่มีเหตุการณ์):', maxGap, '(เป้า ≤2)');
    console.log('สัดส่วน tier %:', Object.keys(tierPct).map(function (k) { return k + ' ' + tierPct[k].toFixed(1) + '%'; }).join(' · '));
    console.log('น้ำหนักอ้างอิง: light 60 · mid 28 · heavy 10 · legend 2');
    return out;
  },
  _fakeState: function () {
    var mk = function (id) { return { id: id, isPlayer: id === 'player', cash: 10000, deposit: 0, debt: 0,
      holdings: SC.emptyHoldings(), assets: { coins: { BTC: 0.01 }, gold: 5, goldCapLv: 0, goldSecLv: 0, bonds: {}, funds: {}, props: { LAND: true } } }; };
    var fs = { week: 1, player: mk('player'), bots: [mk('bot0'), mk('bot1'), mk('bot2')], prices: SC.startPrices(),
      pubNews: [], feed: [], timeline: [], greenhub: { biz: 'cafe' } };
    this.initState(fs);
    return fs;
  },
};

// ============================================================
// UI ประกาศเหตุการณ์ (EVENTS_SPEC ข้อ 9) — CSS transition ล้วน + fallback ทุกรูป
// ============================================================
SC.events._mount = function () {
  return document.fullscreenElement || document.webkitFullscreenElement || document.body;
};
SC.events._imgLayer = function (src, emoji, cls) {
  // emoji เป็นชั้นล่าง (fallback) · รูปทับด้านบน · โหลดรูปไม่ได้ → this.remove() แล้ว emoji โผล่
  return '<span class="' + cls + '"><span class="evt-emoji">' + emoji + '</span>' +
    '<img src="' + src + '" alt="" onerror="this.remove()"></span>';
};

// คิวประกาศทีละใบ (meteor มีคัตซีนก่อน)
SC.events._announceQueue = function (list, s) {
  var self = this, queue = (list || []).filter(function (a) { return a.kind === 'event' || a.kind === 'telegraph'; });
  var after = (list || []).map(function (a) { return a.onClosed; }).filter(Boolean);
  var finish = function () { after.forEach(function (f) { f(); }); after = []; };
  var step = function () {
    if (!queue.length) { finish(); return; }
    var a = queue.shift();
    var show = function () { self._showAnnounce(a, step); };
    // เหตุการณ์ที่มีคัตซีนบนแมปก่อนหน้าประกาศ
    var cut = (a.kind === 'event' && a.def) ? ({
      meteor: '_meteorCutscene', hurricane: '_hurricaneCutscene', ufoAttack: '_ufoCutscene',
    })[a.def.id] : null;
    if (cut && self[cut]) self[cut](show);
    else show();
  };
  step();
};

SC.events._showAnnounce = function (a, done) {
  var def = a.def, telegraph = a.kind === 'telegraph';
  var neg = def.neg || telegraph;
  var paper = telegraph ? 'assets/events/warn_card.png' : (neg ? 'assets/events/paper_bad.png' : 'assets/events/paper_good.png');
  // ไอคอนในกรอบรูปหนังสือพิมพ์ · def.icon = ใช้ภาพเอฟเฟกต์แทน (เหตุการณ์ที่ไม่มีไฟล์ใน icons/)
  var icon = def.icon || ('assets/events/icons/' + def.id + '.png');
  var head = telegraph ? '🔮 คำเตือนล่วงหน้า' : def.emoji + ' ' + def.name;
  // คำอธิบายผลชัดๆ (จาก meta.report ตอน apply) — telegraph ใช้ข้อความเตือน
  var lines = telegraph ? [def.telegraph || 'มีสัญญาณไม่ดีในตลาด รอบหน้าระวัง'] : (a.report && a.report.length ? a.report : (def.flavor ? [def.flavor] : []));
  var descHtml = lines.map(function (l) { return '<div class="evt-line">' + l + '</div>'; }).join('');
  var root = document.createElement('div');
  root.className = 'evt-overlay';
  root.innerHTML =
    '<div class="evt-paper' + (telegraph ? ' evt-warn' : '') + '">' +
      this._imgLayer(paper, telegraph ? '🔮' : '📰', 'evt-paper-bg') +
      '<div class="evt-headline">' + head + '</div>' +
      (telegraph ? '' : this._imgLayer(icon, def.emoji, 'evt-icon')) +
      '<div class="evt-desc' + (lines.length >= 4 ? ' evt-desc-lg' : '') + '">' + descHtml +
        (!telegraph && a.report && a.report.length && def.flavor ? '<div class="evt-flavor">“' + def.flavor + '”</div>' : '') +
        (telegraph ? '<div class="evt-warn-note">การ์ดเตือน — ของจริงอาจมารอบหน้า (หรือเก้อ)</div>' : '') +
      '</div>' +
      '<div class="evt-tap">แตะที่ไหนก็ได้เพื่อปิด</div>' +
    '</div>';
  this._mount().appendChild(root);
  requestAnimationFrame(function () { root.classList.add('in'); });
  var closed = false, tmr;
  var close = function () {
    if (closed) return; closed = true;
    clearTimeout(tmr);
    root.classList.remove('in'); root.classList.add('out');
    setTimeout(function () { if (root.parentNode) root.parentNode.removeChild(root); if (done) done(); }, 350);
  };
  root.addEventListener('mousedown', close);
  root.addEventListener('touchstart', close, { passive: true });
  tmr = setTimeout(close, 5200);   // มีบรรทัดผลให้อ่านมากขึ้น — ยืดเวลาอ่านอัตโนมัติ
};

// พิกัดหน้าจอของตึก (world → screen ผ่าน rect ของ canvas แมป) · ไม่มีแมป = null
//   y  = กลางตัวตึก (จุดที่อุกกาบาตชน) · baseY = ฐานตึกที่พื้น (ใช้วางลำแสง UFO / ตีนพายุ)
SC.events._towerScreenPoint = function (b) {
  try {
    var cv = SC.world && SC.world.canvas;
    if (!b || !cv || !cv.getBoundingClientRect) return null;
    var r = cv.getBoundingClientRect();
    if (!r.width) return null;
    var sc = r.width / SC.map.W;
    return { id: b.id, x: r.left + b.x * sc, y: r.top + (b.y - (b.h || 40) * 0.5) * sc,
             baseY: r.top + b.y * sc, hpx: (b.h || 40) * sc };
  } catch (e) { return null; }
};

// จุดชนของลูกหลัก = ตึกที่เพิ่งถูกปิด · ไม่มีแมป = กลางจอ
SC.events._impactPoint = function () {
  var s = SC.state, id = s && s.events && s.events.lastClosedId;
  var p = id ? this._towerScreenPoint(SC.map.cityById(id)) : null;
  return p || { x: (window.innerWidth || 960) / 2, y: (window.innerHeight || 540) / 2 };
};

// ตึกที่โดนจริงในรอบนี้ (เซ็ตโดย fx closeExtra/closeBuilding ตอน apply) — ตึกหลักอยู่ท้ายสุด
SC.events._hitTargets = function () {
  var s = SC.state, ev = s && s.events;
  var ids = (ev && ev.hitTargets && ev.hitTargets.length) ? ev.hitTargets
    : ((ev && ev.lastClosedId) ? [ev.lastClosedId] : []);
  var self = this, out = [];
  ids.forEach(function (id) {
    var p = self._towerScreenPoint(SC.map.cityById(id));
    if (p) out.push(p);
  });
  return out;
};

// pose (ดีบัก 0..1) = หยุดภาพไว้ที่สัดส่วนของการตก ไม่เล่นต่อ/ไม่ลบ (ใช้แคปหน้าจอตรวจ)
SC.events._meteorCutscene = function (cb, pose, side) {
  var self = this, done = function () { if (cb) cb(); };
  // หมายเหตุ: ไม่เช็ค prefers-reduced-motion แล้ว (user 2026-07-20 — Windows ปิดอนิเมชันไว้
  //   ทำให้คัตซีนหายทั้งดุ้น) · ที่ยังเคารพ setting นี้เหลือแค่ "จอสั่น" ใน style.css
  var tgt = this._impactPoint();
  var vw = window.innerWidth || 960, vh = window.innerHeight || 540;
  var app = document.getElementById('app');
  var fallMs = 3000;    // user 2026-07-20: ค่อยๆ ตกประมาณ 3 วิ
  var gap = 300;        // เหลื่อมเวลาระหว่างลูก

  // ทิศมาสุ่มซ้าย/ขวา (user 2026-07-20) · จำนวนลูก = ตึกที่โดนจริงตาม fx meteorShower
  var fromLeft = side ? (side === 'left') : (Math.random() < 0.5);

  var root = document.createElement('div');
  root.className = 'evt-cutscene';
  this._mount().appendChild(root);

  var shot = function (p, isMain, delay, scale) {
    // ขนาดสไปรต์ · ก้อนหินในอาร์ตอยู่ราว (33%, 66%) ของภาพ หางไฟพุ่งขึ้นมุมขวาบน ~45°
    var size = Math.max(96, Math.min(vw * 0.14, 240)) * scale;
    var startY = Math.min(-70, p.y - vh * 0.6);
    var dy = startY - p.y;
    var dx = (fromLeft ? -1 : 1) * Math.abs(dy);      // 45° = มุมเดียวกับที่อาร์ตวาดไว้ ไม่ต้องหมุนภาพ
    var ang = Math.atan2(dy, dx) * 180 / Math.PI;     // ทิศหาง (ย้อนขึ้นไปทางที่มา)

    var el = document.createElement('div');
    el.className = 'evt-meteor';
    el.innerHTML = '<div class="evt-trail"></div><div class="evt-fire"></div>' +
      self._imgLayer('assets/events/fx/meteor.png', '☄️', 'evt-meteor-img');
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';

    // จัดสไปรต์ให้ "ก้อน" ทับจุดเป้า และหางอยู่ด้านบนเสมอ — มาจากซ้ายใช้กลับด้าน (ห้ามหมุน)
    var img = el.querySelector('.evt-meteor-img');
    img.style.width = size + 'px'; img.style.height = size + 'px';
    img.style.left = (fromLeft ? -size * 0.67 : -size * 0.33) + 'px';
    img.style.top = (-size * 0.66) + 'px';
    if (fromLeft) img.style.transform = 'scaleX(-1)';

    var tr = el.querySelector('.evt-trail');
    tr.style.width = (size * 2.0) + 'px'; tr.style.height = (size * 0.34) + 'px';
    tr.style.setProperty('--ang', ang + 'deg');
    var fire = el.querySelector('.evt-fire');
    fire.style.width = fire.style.height = (size * 0.66) + 'px';
    fire.style.left = fire.style.top = (-size * 0.33) + 'px';
    root.appendChild(el);

    var imp = document.createElement('div');
    imp.className = 'evt-impact';
    imp.style.left = p.x + 'px'; imp.style.top = p.y + 'px';
    imp.style.width = imp.style.height = (Math.max(200, Math.min(vw * 0.26, 400)) * (isMain ? 1 : 0.62)) + 'px';
    imp.innerHTML = self._imgLayer('assets/events/fx/impact_flash.png', '💥', 'evt-impact-img');
    root.appendChild(imp);

    if (typeof pose === 'number') {
      if (pose >= 1) { el.style.display = 'none'; imp.classList.add('on'); }
      else el.style.transform = 'translate(' + (dx * (1 - pose)) + 'px,' + (dy * (1 - pose)) + 'px)';
      return;
    }
    setTimeout(function () {
      // เกือบคงที่ เร่งเล็กน้อยตอนท้าย — ease-in แรงๆ กับ 3 วิ จะทำให้ก้อนค้างนอกจอเกือบทั้งช็อต
      el.style.transition = 'transform ' + fallMs + 'ms cubic-bezier(.32,.28,.62,.82)';
      el.style.transform = 'translate(0,0)';
    }, delay + 20);
    setTimeout(function () {
      el.style.display = 'none';
      imp.classList.add('on');
      if (p.id) delete self._pendingHit[p.id];   // ชนแล้ว → ตึกเปลี่ยนเป็นซาก+ป้ายปิดซ่อม
      if (app) { app.classList.remove('evt-shake'); void app.offsetWidth; app.classList.add('evt-shake'); }
    }, delay + fallMs);
    setTimeout(function () { imp.classList.add('fade'); }, delay + fallMs + 430);   // จางหาย ไม่ค้างเป็นภาพนิ่ง
  };

  // ทุกลูกลงที่ "ตึกที่โดนจริง" (ห้ามตกมั่วกลางสนาม — user 2026-07-20) ลูกหลักปิดท้าย
  var shots = (typeof pose === 'number') ? [tgt] : this._hitTargets();
  if (!shots.length) shots = [tgt];    // ไม่มีแมป (เรียกคัตซีนเดี่ยวๆ) → ลูกเดียวกลางจอ
  // ตึกที่รอโดน = ยังวาดเป็นตึกปกติจนลูกนั้นตกถึง (ไม่งั้นซากโผล่ก่อนอุกกาบาตชน)
  this._pendingHit = {};
  shots.forEach(function (p) { if (p.id) self._pendingHit[p.id] = 1; });
  for (var j = 0; j < shots.length; j++) {
    var isMain = (j === shots.length - 1);
    shot(shots[j], isMain, j * gap, isMain ? 1 : (0.62 + Math.random() * 0.2));
  }
  if (typeof pose === 'number') return;

  var total = (shots.length - 1) * gap + fallMs + 620;
  setTimeout(function () {
    self._pendingHit = {};   // กันค้าง (เช่นผู้เล่นสลับหน้าจอกลางคัตซีน)
    if (app) app.classList.remove('evt-shake');
    if (root.parentNode) root.parentNode.removeChild(root);
    done();
  }, total);
};

// ============================================================
// คัตซีน UFO — จานบินลอยลงเหนือตึก ยิงลำแสงดูด แล้วบินหาย (ปิดตึกเดียว)
//   อาร์ต ufo_invade.png = จาน+ลำแสง+วงแหวนที่พื้นในภาพเดียว → วางให้ "ขอบล่างของภาพ = ฐานตึก"
//   (user 2026-07-20: ฐานตึกต้องอยู่พอดีกับล่างสุดของแสง)
// ============================================================
SC.events._ufoCutscene = function (cb, pose) {
  var self = this, done = function () { if (cb) cb(); };
  var hits = this._hitTargets();
  var p = hits.length ? hits[hits.length - 1] : null;
  if (!p) { done(); return; }        // ไม่มีตึกเป้า (ไม่มีแมป) → ข้ามคัตซีน
  var vh = window.innerHeight || 540, vw = window.innerWidth || 960;
  var app = document.getElementById('app');

  var root = document.createElement('div');
  root.className = 'evt-cutscene';
  var el = document.createElement('div');
  el.className = 'evt-ufo';
  el.innerHTML = this._imgLayer('assets/events/fx/ufo_invade.png', '🛸', 'evt-ufo-img');
  // ลำแสงคลุมตึกทั้งหลัง: สูงอย่างน้อย 2.6 เท่าความสูงตึกบนจอ · อัตราส่วนอาร์ต 1024/1536
  var h = Math.max(300, Math.min(vh * 0.72, Math.max(p.hpx * 2.6, 360)));
  h = Math.max(240, Math.min(h, p.baseY - 14));   // อย่าให้จานบินหลุดขอบจอบน
  el.style.height = h + 'px'; el.style.width = (h * 1024 / 1536) + 'px';
  el.style.left = p.x + 'px'; el.style.top = p.baseY + 'px';   // ขอบล่างภาพ = ฐานตึก
  root.appendChild(el);
  this._mount().appendChild(root);

  this._pendingHit = {};
  if (p.id) this._pendingHit[p.id] = 1;      // ตึกยังปกติจนลำแสงดูดเสร็จ
  if (typeof pose === 'number') { el.classList.add('in'); if (pose >= 1) el.classList.add('zap'); return; }

  requestAnimationFrame(function () { el.classList.add('in'); });     // ร่อนลง + ลำแสงติด
  setTimeout(function () {
    el.classList.add('zap');                                          // ลำแสงเต้นแรง
    if (app) { app.classList.remove('evt-shake'); void app.offsetWidth; app.classList.add('evt-shake'); }
    if (p.id) delete self._pendingHit[p.id];                          // ตึกโดนดูด → ปิดจริง
  }, 1500);
  setTimeout(function () { el.classList.remove('zap'); el.classList.add('out'); }, 2400);   // บินขึ้นหาย
  setTimeout(function () {
    self._pendingHit = {};
    if (app) app.classList.remove('evt-shake');
    if (root.parentNode) root.parentNode.removeChild(root);
    done();
  }, 3100);
};

// ============================================================
// คัตซีนพายุหมุน — ก้อนพายุ (3 เฟรมสลับ) พัดเข้าเมือง ผ่านตึกที่โดนทีละหลังแล้วออกนอกจอ
//   ตีนพายุ (ขอบล่างภาพ) วิ่งอยู่ระดับ "ฐานตึก" เหมือนลำแสง UFO
// ============================================================
SC.events._hurricaneCutscene = function (cb, pose) {
  var self = this, done = function () { if (cb) cb(); };
  var pts = this._hitTargets();
  if (!pts.length) { done(); return; }
  var vw = window.innerWidth || 960, vh = window.innerHeight || 540;
  var app = document.getElementById('app');
  var fromLeft = Math.random() < 0.5;
  // ไล่ผ่านตึกตามแนวที่พายุวิ่ง (ซ้าย→ขวา หรือขวา→ซ้าย) แต่ให้ตึกหลักอยู่ท้ายสุดเสมอ
  var main = pts[pts.length - 1], rest = pts.slice(0, -1);
  rest.sort(function (a, b) { return fromLeft ? a.x - b.x : b.x - a.x; });
  var path = rest.concat([main]);

  var root = document.createElement('div');
  root.className = 'evt-cutscene';
  var el = document.createElement('div');
  el.className = 'evt-storm';
  el.innerHTML = this._imgLayer('assets/events/fx/hurricane1.png', '🌀', 'evt-storm-img');
  var size = Math.max(260, Math.min(vw * 0.3, 440));
  el.style.width = el.style.height = size + 'px';
  var place = function (x, y) { el.style.left = x + 'px'; el.style.top = y + 'px'; };
  place(fromLeft ? -size * 0.7 : vw + size * 0.7, path[0].baseY);
  root.appendChild(el);
  this._mount().appendChild(root);

  this._pendingHit = {};
  path.forEach(function (q) { if (q.id) self._pendingHit[q.id] = 1; });
  if (typeof pose === 'number') {         // หยุดภาพไว้เหนือตึกลำดับที่ pose ระบุ (0..1)
    var pi = Math.min(path.length - 1, Math.floor(pose * path.length));
    place(path[pi].x, path[pi].baseY);
    return;
  }

  // หมุนด้วยการสลับเฟรม 1→2→3 เท่านั้น — ไม่ rotate รูป (user 2026-07-20)
  var img = el.querySelector('.evt-storm-img img'), fi = 0;
  var frames = img ? setInterval(function () {
    fi = (fi + 1) % 3; img.src = 'assets/events/fx/hurricane' + (fi + 1) + '.png';
  }, 110) : null;

  var legIn = 1000, legStep = 900, legOut = 800;
  requestAnimationFrame(function () {
    el.style.transition = 'left ' + legIn + 'ms ease-out, top ' + legIn + 'ms ease-out';
    place(path[0].x, path[0].baseY);
  });
  var t = legIn;
  path.forEach(function (q, i) {
    setTimeout(function () {
      if (q.id) delete self._pendingHit[q.id];    // พายุถึงตึกนี้ → พัดพังจริง
      if (app) { app.classList.remove('evt-shake'); void app.offsetWidth; app.classList.add('evt-shake'); }
    }, t);
    if (i + 1 < path.length) {
      var nx = path[i + 1];
      setTimeout(function () {
        el.style.transition = 'left ' + legStep + 'ms ease-in-out, top ' + legStep + 'ms ease-in-out';
        place(nx.x, nx.baseY);
      }, t + 260);
      t += 260 + legStep;
    }
  });
  setTimeout(function () {
    el.style.transition = 'left ' + legOut + 'ms ease-in, top ' + legOut + 'ms ease-in, opacity ' + legOut + 'ms ease-in';
    el.style.opacity = '0';
    place(fromLeft ? vw + size * 0.8 : -size * 0.8, path[path.length - 1].baseY - size * 0.15);
  }, t + 420);
  setTimeout(function () {
    if (frames) clearInterval(frames);
    self._pendingHit = {};
    if (app) app.classList.remove('evt-shake');
    if (root.parentNode) root.parentNode.removeChild(root);
    done();
  }, t + 420 + legOut + 150);
};

// อ่าน URL ?evt=<id> (ยิงต้นรอบ 1)
(function () {
  try {
    var m = /[?&]evt=([A-Za-z]+)/.exec(window.location.search);
    if (m) SC.events._urlEvt = m[1];
  } catch (e) {}
})();
