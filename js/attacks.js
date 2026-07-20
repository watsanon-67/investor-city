// ============================================================
// attacks.js — ท่าโจมตี 8 อาชีพ + resolution flow (GAME_SPEC ข้อ 3 + 5.3)
//   • SC.attacks  = logic ท่า (validate เป้าจาก "ความจริง" — เทียบระบบ disable ปุ่มใน UI)
//   • SC.duel     = ตัวคุมลำดับ resolution: ประกาศ → เป้าตอบ 10 วิ (ยอม/challenge/counter)
//                   → challenge 2 ชั้น → apply ผล — ทุกขั้น resolve ในช่วง "ไม่จับเวลา"
//   • เงินทุกรายการไหลตรงระหว่างผู้เล่น หรือเข้า/ออก "ระบบ" — ไม่มีกองกลาง
// ============================================================

// ---------- helper ชื่อ/ฟีด/ไทม์ไลน์ ----------
SC.actorName = function (a) { return a.isPlayer ? 'คุณ' : a.name; };

SC.feedPush = function (text, kind) {
  var s = SC.state; if (!s) return;
  s.feed.unshift({ round: s.week, text: text, kind: kind || '' });
  if (s.feed.length > 40) s.feed.pop();
  var el = document.getElementById('feedList');
  if (el) el.innerHTML = SC.duel.feedHtml();
};

SC.timelinePush = function (text, kind) {
  var s = SC.state; if (!s) return;
  s.timeline.push({ round: s.week, text: text, kind: kind || '' });
};

// ============================================================
// มูลค่าสินทรัพย์รายหมวดของ actor (ใช้กับชอร์ตพอร์ต/บังคับขาย)
// ============================================================
SC.attacks = {
  categoryValues: function (actor) {
    var s = SC.state, m = s.markets, v = { stock: 0, crypto: 0, gold: 0, bond: 0, fund: 0, prop: 0, deposit: actor.deposit || 0 };
    SC.stocks.forEach(function (st) { v.stock += (actor.holdings[st.id] || 0) * s.prices[st.id]; });
    var a = actor.assets;
    if (a && m) {
      SC.coins.forEach(function (c) { v.crypto += (a.coins[c.id] || 0) * SC.markets.coinPrice(c.id); });
      v.gold = (a.gold || 0) * SC.markets.goldPrice();
      SC.bonds.forEach(function (b) { v.bond += (a.bonds[b.id] || 0) * b.face; });
      SC.funds.forEach(function (f) { v.fund += (a.funds[f.id] || 0) * SC.markets.fundNav(f.id); });
      SC.properties.forEach(function (p) { if (a.props[p.id]) v.prop += SC.markets.propPrice(p.id); });
    }
    return v;
  },

  cryptoValue: function (actor) { return this.categoryValues(actor).crypto; },

  propsOf: function (actor) {
    var a = actor.assets; if (!a) return [];
    return SC.properties.filter(function (p) { return a.props[p.id]; });
  },

  // บังคับขายสินทรัพย์ที่ราคาตลาด −10% จน actor.cash ≥ needed (หรือของหมด)
  //   preferCat = หมวดที่กติกาสั่งให้ขายก่อน (ชอร์ตพอร์ต) — เงินฝากถอนได้เต็มไม่โดนหัก
  forcedSell: function (actor, needed, preferCat) {
    var s = SC.state, disc = 1 - SC.config.forcedSaleDiscount, a = actor.assets;
    var self = this;
    var steps = {
      deposit: function () {
        if (actor.deposit > 0) { var take = Math.min(actor.deposit, needed - actor.cash); actor.deposit -= take; actor.cash += take; }
      },
      stock: function () {
        SC.stocks.forEach(function (st) {
          while (actor.cash < needed && (actor.holdings[st.id] || 0) > 0) {
            actor.holdings[st.id]--; actor.cash += s.prices[st.id] * disc;
          }
        });
      },
      crypto: function () {
        if (!a) return;
        SC.coins.forEach(function (c) {
          if (actor.cash < needed && (a.coins[c.id] || 0) > 0) {
            var px = SC.markets.coinPrice(c.id) * disc;
            var qty = Math.min(a.coins[c.id], (needed - actor.cash) / px + 1e-9);
            a.coins[c.id] -= qty; actor.cash += qty * px;
          }
        });
      },
      gold: function () {
        if (!a || !(a.gold > 0)) return;
        var px = SC.markets.goldPrice() * disc;
        var g = Math.min(a.gold, (needed - actor.cash) / px + 1e-9);
        if (actor.cash < needed) { a.gold -= g; actor.cash += g * px; }
      },
      bond: function () {
        if (!a) return;
        SC.bonds.forEach(function (b) {
          while (actor.cash < needed && (a.bonds[b.id] || 0) > 0) { a.bonds[b.id]--; actor.cash += b.face * disc; }
        });
      },
      fund: function () {
        if (!a) return;
        SC.funds.forEach(function (f) {
          if (actor.cash < needed && (a.funds[f.id] || 0) > 0) {
            var nav = SC.markets.fundNav(f.id) * disc;
            var u = Math.min(a.funds[f.id], (needed - actor.cash) / nav + 1e-9);
            a.funds[f.id] -= u; actor.cash += u * nav;
          }
        });
      },
      prop: function () {
        if (!a) return;
        SC.properties.forEach(function (p) {
          if (actor.cash < needed && a.props[p.id]) { delete a.props[p.id]; actor.cash += SC.markets.propPrice(p.id) * disc; }
        });
      },
    };
    var order = ['deposit', 'stock', 'fund', 'bond', 'gold', 'crypto', 'prop'];
    if (preferCat && steps[preferCat]) { steps[preferCat](); }
    for (var i = 0; i < order.length && actor.cash < needed; i++) steps[order[i]]();
  },

  // จ่ายเงิน from → to (to = null คือจ่ายเข้าระบบ) — เงินสดไม่พอ = บังคับขาย −10% จนพอ/ของหมด
  pay: function (from, to, amount) {
    if (from.cash < amount) this.forcedSell(from, amount);
    var paid = Math.min(from.cash, amount);
    from.cash -= paid;
    if (to) to.cash += paid;
    return paid;
  },

  // ---------- เงื่อนไขเป้าต่อท่า (ระบบ disable เป้าที่ไม่เข้าเงื่อนไข — ใช้ความจริงจาก engine) ----------
  canTarget: function (profId, attacker, target) {
    switch (profId) {
      case 'whale':  return this.cryptoValue(target) > 0.01;
      case 'short': {
        var v = this.categoryValues(target);
        return (v.stock + v.crypto + v.gold + v.bond + v.fund + v.prop + v.deposit) > 0.01;
      }
      case 'tiger': {
        var props = this.propsOf(target);
        if (!props.length) return false;
        var cheapest = Math.min.apply(null, props.map(function (p) { return SC.markets.propPrice(p.id); }));
        return attacker.cash >= cheapest * (1 - SC.config.landGrabDiscount);
      }
      case 'banker': return (target.debt || 0) > 0.01;
      default: return true; // media / mafia / sec / hacker เลือกใครก็ได้
    }
  },

  // ============================================================
  // ผลของท่า (เรียกเมื่อ resolution สรุปว่า "ท่าทำงาน") — done() เมื่อจบทุก popup ย่อย
  // ============================================================
  apply: function (profId, attacker, target, opts, done) {
    var cfg = SC.config, self = this;
    opts = opts || {};
    var an = SC.actorName(attacker), tn = SC.actorName(target);

    switch (profId) {
      case 'media': { // ยัดข่าวปลอม
        if (!target.news.length) {
          SC.newsSys.drawTo(attacker);
          if (attacker.isPlayer) SC.ui.toast('🔎 ' + tn + ' ไม่มีการ์ดข่าว — คุณจั่วข่าวเองฟรี 1 ใบ', 'good');
          SC.feedPush(an + ' ใช้ "ยัดข่าวปลอม" ใส่ ' + tn, 'attack');
          return done();
        }
        var idx = Math.floor(Math.random() * target.news.length);
        var card = target.news[idx];
        var doSwap = function (swap) {
          if (swap && SC.state.newsDeck.length) {
            var top = SC.state.newsDeck.pop();
            top.dueRound = SC.state.week + top.dueOffset;
            top.checked = false;
            target.news[idx] = top;
            SC.state.newsDeck.push(card); // ใบเดิมขึ้นไปอยู่บนสุดของกอง
          }
          if (target.isPlayer) SC.ui.toast('🚨 คุณถูกยัดข่าวปลอม! (ไม่รู้ใบไหนถูกดู/ถูกสลับหรือไม่)', 'warn');
          SC.feedPush(an + ' ใช้ "ยัดข่าวปลอม" ใส่ ' + tn, 'attack');
          done();
        };
        if (attacker.isPlayer) {
          SC.duel.popup(
            '<h3>📡 ยัดข่าวปลอม — เห็นการ์ดข่าวของ ' + tn + '</h3>' +
            '<div class="duel-card-news">' + card.headline + '<br><small class="muted">มีผลรอบ ' + card.dueRound + '</small></div>' +
            '<p class="muted">สลับใบนี้กับใบบนสุดของกองข่าว หรือวางคืน? (เป้าไม่รู้ว่าเกิดอะไรขึ้น)</p>',
            [{ label: '🔄 สลับกับกองข่าว', cls: 'btn-challenge', fn: function () { doSwap(true); } },
             { label: '↩️ วางคืน', cls: '', fn: function () { doSwap(false); } }]);
        } else {
          doSwap(Math.random() < 0.5); // บอทไม่เห็น flag จริง/ปลอม — สลับสุ่ม
        }
        return;
      }

      case 'whale': { // เทใส่: คริปโตเป้าหาย 20% (mark-down เฉพาะพอร์ตเป้า) วาฬได้เงินสด 10%
        var a = target.assets, lost = 0;
        SC.coins.forEach(function (c) {
          var q = (a && a.coins[c.id]) || 0;
          if (q > 0) {
            var cut = q * cfg.dumpOnRate;
            a.coins[c.id] = q - cut;
            lost += cut * SC.markets.coinPrice(c.id);
          }
        });
        attacker.cash += lost / 2; // อีกครึ่งหายเข้าระบบ
        SC.feedPush('🐋 ' + an + ' "เทใส่" ' + tn + ' — คริปโตเป้าหาย ' + SC.ui.money(lost), 'attack');
        if (target.isPlayer) SC.ui.toast('🐋 โดนเทใส่! คริปโตของคุณหาย ' + SC.ui.money(lost), 'bad');
        return done();
      }

      case 'short': { // ชอร์ตพอร์ต: 10% ของหมวดที่ถือมูลค่าสูงสุด (เพดาน 1500)
        var vals = this.categoryValues(target);
        var maxCat = null, maxV = 0;
        Object.keys(vals).forEach(function (k) { if (vals[k] > maxV) { maxV = vals[k]; maxCat = k; } });
        var amt = Math.min(maxV * cfg.shortPortRate, cfg.shortPortCap);
        if (target.cash < amt) this.forcedSell(target, amt, maxCat);
        var paid = Math.min(target.cash, amt);
        target.cash -= paid; attacker.cash += paid;
        SC.feedPush('📉 ' + an + ' "ชอร์ตพอร์ต" ' + tn + ' — ได้ ' + SC.ui.money(paid), 'attack');
        if (target.isPlayer) SC.ui.toast('📉 โดนชอร์ต! เสีย ' + SC.ui.money(paid), 'bad');
        return done();
      }

      case 'tiger': { // ฮุบที่ดิน: บังคับซื้อ 1 หน่วยที่ −15% (เป้าปฏิเสธ = จ่ายค่ายอมความ 500)
        var props = this.propsOf(target);
        // เลือกหน่วยแพงสุดที่ผู้โจมตีจ่ายไหว (ระบบเลือกให้)
        var pick = null, price = 0;
        props.forEach(function (p) {
          var px = SC.markets.propPrice(p.id) * (1 - cfg.landGrabDiscount);
          if (px <= attacker.cash && px > price) { pick = p; price = px; }
        });
        if (!pick) { SC.feedPush('🐅 "ฮุบที่ดิน" ของ ' + an + ' ไม่สำเร็จ (เงินไม่พอ)', 'attack'); return done(); }
        var grab = function () {
          attacker.cash -= price; target.cash += price;
          delete target.assets.props[pick.id];
          attacker.assets.props[pick.id] = true;
          SC.feedPush('🐅 ' + an + ' ฮุบ "' + pick.name + '" จาก ' + tn + ' ที่ ' + SC.ui.money(price) + ' (−15%)', 'attack');
          done();
        };
        var refuse = function () {
          self.pay(target, attacker, cfg.landGrabRefuseFee);
          SC.feedPush('🐅 ' + tn + ' จ่ายค่ายอมความ ' + SC.ui.money(cfg.landGrabRefuseFee) + ' กัน "' + pick.name + '" ไว้ได้', 'attack');
          done();
        };
        if (target.isPlayer) {
          SC.duel.popup(
            '<h3>🐅 โดนฮุบที่ดิน!</h3>' +
            '<p>' + an + ' จะบังคับซื้อ <b>' + pick.name + '</b> ที่ ' + SC.ui.money(price) + ' (ราคาตลาด −15%)</p>',
            [{ label: '💸 ยอมขาย (' + SC.ui.money(price) + ')', cls: '', fn: grab },
             { label: '🛑 จ่ายค่ายอมความ ฿500', cls: 'btn-challenge', fn: refuse }]);
        } else {
          // บอท: ยอมความถ้ามูลค่าที่เสีย (ส่วนลด 15%) แพงกว่าค่ายอมความ และมีเงินจ่าย
          var lossVal = SC.markets.propPrice(pick.id) - price;
          if (lossVal > cfg.landGrabRefuseFee && target.cash >= cfg.landGrabRefuseFee) refuse(); else grab();
        }
        return;
      }

      case 'banker': { // บีบหนี้: ชำระหนี้ทันที 50% ของยอดคงค้าง (คืนระบบ)
        var due = target.debt * cfg.debtSqueezeRatio;
        if (target.cash < due) this.forcedSell(target, due);
        var pd = Math.min(target.cash, due);
        target.cash -= pd; target.debt -= pd;
        SC.feedPush('🏦 ' + an + ' "บีบหนี้" ' + tn + ' — ชำระหนี้ทันที ' + SC.ui.money(pd), 'attack');
        if (target.isPlayer) SC.ui.toast('🏦 โดนบีบหนี้! ชำระทันที ' + SC.ui.money(pd), 'bad');
        return done();
      }

      case 'mafia': { // ข่มขู่: จ่าย 1,000 หรือเปิดการ์ด 1 ใบ (เปิดถาวรแต่ไม่ทิ้ง)
        var canPay = target.cash >= cfg.extortAmount;
        var payUp = function () {
          self.pay(target, attacker, cfg.extortAmount);
          SC.feedPush('🕶️ ' + tn + ' ยอมจ่ายค่าข่มขู่ ' + SC.ui.money(cfg.extortAmount) + ' ให้ ' + an, 'attack');
          done();
        };
        var reveal = function (idx) {
          var prof = SC.deck.faceUp(target, idx);
          if (prof) {
            SC.feedPush('🕶️ ' + tn + ' ถูกข่มขู่ — เปิดการ์ด "' + SC.getProf(prof).name + '" ให้ทุกคนเห็น', 'reveal');
            if (SC.botBrain) SC.botBrain.noteReveal(target, prof);
          }
          done();
        };
        if (!target.cards.length) { payUp(); return; } // ไม่มีการ์ดเหลือ = ต้องจ่าย (เท่าที่มี)
        if (target.isPlayer) {
          var btns = [];
          if (canPay) btns.push({ label: '💸 จ่าย ฿1,000', cls: '', fn: payUp });
          target.cards.forEach(function (c, i) {
            if (!c.faceUp) btns.push({ label: '🃏 เปิด ' + SC.getProf(c.prof).emoji + ' ' + SC.getProf(c.prof).name, cls: 'btn-challenge', fn: function () { reveal(i); } });
          });
          if (btns.length === (canPay ? 1 : 0)) { payUp(); return; } // การ์ดเปิดหมดแล้ว
          SC.duel.popup('<h3>🕶️ โดนข่มขู่!</h3><p>' + an + ' บังคับให้เลือก: จ่าย ฿1,000 หรือเปิดการ์ดอาชีพ 1 ใบ (เปิดถาวร ไม่ทิ้ง)</p>' + (canPay ? '' : '<p class="bad">เงินสดไม่ถึง ฿1,000 — ต้องเปิดการ์ด</p>'), btns);
        } else {
          // บอท: จ่ายถ้ามีเงินและการ์ดยังลับทั้งคู่ · เปิดใบที่เปิดอยู่แล้วไม่ได้ — เลือกใบแรกที่ยังลับ
          var secretIdx = target.cards.findIndex(function (c) { return !c.faceUp; });
          if (secretIdx < 0) { payUp(); }
          else if (canPay && Math.random() < 0.6) payUp();
          else reveal(secretIdx);
        }
        return;
      }

      case 'sec': { // อายัดบัญชี: เทิร์นถัดไปของเป้า เดินได้อย่างเดียว
        target.frozenNext = true;
        SC.feedPush('⚖️ ' + an + ' "อายัดบัญชี" ' + tn + ' — เทิร์นหน้าห้ามทุกธุรกรรม', 'attack');
        if (target.isPlayer) SC.ui.toast('⚖️ โดนอายัด! เทิร์นหน้าเดินแมพได้อย่างเดียว', 'bad');
        return done();
      }

      case 'hacker': { // เจาะระบบ: โหมดเงิน (ขโมย 800) หรือโหมดข้อมูล (ดูการ์ด+พอร์ต)
        if (opts.mode === 'money') {
          var got = Math.min(target.cash, cfg.hackStealAmount);
          target.cash -= got; attacker.cash += got;
          SC.feedPush('🕵️ ' + an + ' "เจาะระบบ" ขโมยเงิน ' + tn + ' ได้ ' + SC.ui.money(got), 'attack');
          if (target.isPlayer) SC.ui.toast('🕵️ โดนแฮ็ก! เสียเงินสด ' + SC.ui.money(got), 'bad');
          return done();
        }
        // โหมดข้อมูล: สุ่มเปิดการ์ด 1 ใน 2 + สรุปพอร์ตเต็ม (ผู้โจมตีเห็นคนเดียว)
        var seen = target.cards.length ? target.cards[Math.floor(Math.random() * target.cards.length)].prof : null;
        SC.feedPush('🕵️ ' + an + ' "เจาะระบบ" ล้วงข้อมูล ' + tn, 'attack');
        if (attacker.isPlayer) {
          var vals2 = this.categoryValues(target);
          var rows = [
            ['เงินสด', target.cash], ['เงินฝาก', vals2.deposit], ['หนี้คงค้าง', -(target.debt || 0)],
            ['หุ้น', vals2.stock], ['คริปโต', vals2.crypto], ['ทอง', vals2.gold],
            ['พันธบัตร/กองทุน', vals2.bond + vals2.fund], ['อสังหา', vals2.prop],
          ].map(function (r) { return '<div><label>' + r[0] + '</label><b>' + SC.ui.money(r[1]) + '</b></div>'; }).join('');
          SC.duel.popup(
            '<h3>🕵️ ผลเจาะระบบ — ' + tn + '</h3>' +
            (seen ? '<p>การ์ดอาชีพที่แอบเห็น: <b>' + SC.getProf(seen).emoji + ' ' + SC.getProf(seen).name + '</b> (เห็นคนเดียว)</p>' : '<p class="muted">เป้าไม่มีการ์ดเหลือ</p>') +
            '<div class="duel-port">' + rows + '</div>',
            [{ label: 'รับทราบ ▶', cls: 'btn-go', fn: done }]);
        } else {
          if (SC.botBrain) SC.botBrain.noteHack(attacker, target, seen);
          done();
        }
        return;
      }
    }
    done();
  },
};

// ============================================================
// SC.duel — ตัวคุม resolution (popup ซ้อนบนแมพ ทุกขั้นไม่จับเวลา ยกเว้นเป้าตอบ 10 วิ)
// ============================================================
SC.duel = {
  _root: null,

  // popup กลางจอ: html + ปุ่ม [{label, cls, fn}] — แทนที่ popup เดิมถ้ามี
  popup: function (html, buttons, opts) {
    this.closePopup();
    var root = document.createElement('div');
    root.className = 'duel-overlay';
    var panel = document.createElement('div');
    panel.className = 'duel-panel';
    panel.innerHTML = html + '<div class="duel-btns"></div>';
    root.appendChild(panel);
    (document.fullscreenElement || document.webkitFullscreenElement || document.body).appendChild(root);
    this._root = root;
    var wrap = panel.querySelector('.duel-btns'), self = this;
    (buttons || []).forEach(function (b) {
      var bt = document.createElement('button');
      bt.className = 'btn btn-lg ' + (b.cls || '');
      bt.innerHTML = b.label;
      bt.onclick = function () { self.closePopup(); b.fn(); };
      wrap.appendChild(bt);
    });
    return panel;
  },

  closePopup: function () {
    if (this._root) { this._root.remove(); this._root = null; }
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  // แจ้งข้อมูล (ปุ่มรับทราบเดียว)
  info: function (html, cb) {
    this.popup(html, [{ label: 'รับทราบ ▶', cls: 'btn-go', fn: cb || function () {} }]);
  },

  feedHtml: function () {
    var s = SC.state;
    return s.feed.slice(0, 5).map(function (f) {
      return '<div class="feed-item ' + f.kind + '">' + f.text + '</div>';
    }).join('');
  },

  // ---------- จุดเข้า: attacker ประกาศอาชีพ + เป้า ----------
  //   o = { attacker, claim, target, opts, onDone }
  run: function (o) {
    var self = this, cfg = SC.config;
    var an = SC.actorName(o.attacker), tn = SC.actorName(o.target);
    var prof = SC.getProf(o.claim);
    var lying = !SC.hasProf(o.attacker, o.claim);

    SC.feedPush('⚔️ ' + an + ' อ้างเป็น ' + prof.emoji + ' ' + prof.name + ' ใช้ "' + prof.attack + '" ใส่ ' + tn, 'claim');
    SC.timelinePush(an + ' อ้าง ' + prof.name + ' → ' + prof.attack + ' ใส่ ' + tn + (lying ? ' (โกหก)' : ' (ถือจริง)'), lying ? 'lie' : 'truth');
    if (SC.botBrain) SC.botBrain.noteClaim(o.attacker, o.claim);

    this._respondTarget(o);
  },

  // เป้าเลือก ยอม/challenge/counter — ผู้เล่น 10 วิ · บอทหน่วง 2-6 วิ
  _respondTarget: function (o) {
    var self = this, cfg = SC.config;
    var counterProf = SC.counterOf(o.claim);
    var proceed = function () { SC.attacks.apply(o.claim, o.attacker, o.target, o.opts, o.onDone); };

    if (o.target.isPlayer) {
      var prof = SC.getProf(o.claim), cp = SC.getProf(counterProf);
      var canCounter = SC.canUseMoves(o.target);
      var btns = [
        { label: '😔 ยอมโดน', cls: '', fn: proceed },
        { label: '🔥 Challenge! (จับโกหก)', cls: 'btn-challenge', fn: function () { self._challenge(o.target, o.attacker, o.claim, proceed, o.onDone); } },
      ];
      if (canCounter) btns.push({
        label: '🛡️ Counter — อ้าง ' + cp.emoji + ' ' + cp.name, cls: 'btn-go',
        fn: function () { self._counter(o, counterProf); },
      });
      var panel = this.popup(
        '<h3>⚔️ คุณถูกโจมตี! <span class="duel-clock" id="duelClock">' + cfg.targetResponseSec + '</span></h3>' +
        '<p><b>' + SC.actorName(o.attacker) + '</b> อ้างเป็น <b>' + prof.emoji + ' ' + prof.name + '</b> ใช้ท่า <b>' + prof.attack + '</b> ใส่คุณ</p>' +
        '<p class="muted">' + prof.attackDesc + '</p>' +
        (canCounter ? '<p class="muted">🛡️ เคาน์เตอร์ = อ้างว่าเป็น ' + cp.name + ' (อ้างมั่วได้ แต่โดน challenge กลับได้)</p>' : '<p class="bad">การ์ดคุณหมด — เคาน์เตอร์ไม่ได้ (ยัง challenge ได้)</p>') +
        '<p class="muted">หมดเวลา = ยอมโดนอัตโนมัติ</p>', btns);
      // นาฬิกา 10 วิ
      var left = cfg.targetResponseSec;
      this._timer = setInterval(function () {
        left--;
        var el = document.getElementById('duelClock');
        if (el) { el.textContent = left; el.className = 'duel-clock' + (left <= 3 ? ' danger' : ''); }
        if (left <= 0) { self.closePopup(); proceed(); }
      }, 1000);
    } else {
      // บอทตัดสินใจ (ไม่โกง — ใช้ความจำ+บุคลิก) หน่วง 2-6 วิให้ฟีลเหมือนคิด
      var decide = SC.botBrain.respondToAttack(o.target, o.attacker, o.claim, o.opts);
      var delay = (cfg.bot.responseDelaySec[0] + Math.random() * (cfg.bot.responseDelaySec[1] - cfg.bot.responseDelaySec[0])) * 1000;
      var waiting = this.popup('<h3>⏳ ' + SC.actorName(o.target) + ' กำลังตัดสินใจ…</h3><p class="muted">ยอม / Challenge / Counter</p>', []);
      setTimeout(function () {
        self.closePopup();
        if (decide === 'challenge') self._challenge(o.target, o.attacker, o.claim, proceed, o.onDone);
        else if (decide === 'counter') self._counter(o, counterProf);
        else proceed();
      }, delay);
    }
  },

  // ---------- A) Challenge: accuser กล่าวหาว่า claimer อ้างมั่ว ----------
  //   onTrue = ท่าเดินหน้าต่อ (claimer พูดจริง) · onFalse = ท่ายกเลิก
  _challenge: function (accuser, claimer, profId, onTrue, onFalse) {
    var self = this, cfg = SC.config;
    var an = SC.actorName(accuser), cn = SC.actorName(claimer);
    var prof = SC.getProf(profId);
    if (SC.botBrain) SC.botBrain.noteChallenge(accuser, claimer, profId);

    if (SC.hasProf(claimer, profId)) {
      // อ้างจริง: คนจับจ่าย 800 (เครดิตพังจ่าย ×2) · เจ้าตัวสับใบพิสูจน์กลับกอง จั่วใหม่ · ท่าทำงานต่อ
      var fine = accuser.brokenCredit > 0 ? cfg.challengePenaltyBroken : cfg.challengePenalty;
      SC.attacks.pay(accuser, claimer, fine);
      SC.deck.proveAndRedraw(claimer, profId);
      SC.feedPush('🔥 ' + an + ' challenge ' + cn + ' — แต่เขาถือ ' + prof.name + ' จริง! ' + an + ' จ่าย ' + SC.ui.money(fine), 'challenge');
      SC.timelinePush(an + ' challenge ' + cn + ' (' + prof.name + ') — จับผิด เสีย ' + SC.ui.money(fine), 'wrong');
      if (SC.botBrain) SC.botBrain.noteChallengeResult(claimer, profId, true);
      this.info('<h3>' + (accuser.isPlayer ? '❌ จับผิด!' : '✅ ' + an + ' จับพลาด') + '</h3>' +
        '<p><b>' + cn + '</b> เปิดพิสูจน์ว่าถือ <b>' + prof.emoji + ' ' + prof.name + '</b> จริง — ' +
        an + ' จ่าย ' + SC.ui.money(fine) + ' · เขาสับการ์ดกลับกองแล้วจั่วใหม่ (ตัวตนกลับมาลับ) · ท่าทำงานต่อ</p>', onTrue);
    } else {
      // อ้างมั่ว: ท่ายกเลิก + จ่ายคนจับ 800 + เปิดทิ้ง 1 ใบ + เครดิตพัง 2 รอบ
      var fine2 = claimer.brokenCredit > 0 ? cfg.challengePenaltyBroken : cfg.challengePenalty;
      SC.attacks.pay(claimer, accuser, fine2);
      claimer.brokenCredit = cfg.brokenCreditRounds + 1; // +1 เพราะจะโดนหักท้ายรอบนี้เลย
      SC.feedPush('💥 ' + an + ' จับโกหก ' + cn + ' ได้! (ไม่ได้ถือ ' + prof.name + ') — โดนปรับ ' + SC.ui.money(fine2) + ' + เครดิตพัง 2 รอบ', 'challenge');
      SC.timelinePush(an + ' จับโกหก ' + cn + ' (อ้าง ' + prof.name + ' มั่ว) สำเร็จ', 'caught');
      if (SC.botBrain) SC.botBrain.noteChallengeResult(claimer, profId, false);
      this._discardOne(claimer, function () {
        self.info('<h3>' + (accuser.isPlayer ? '✅ จับโกหกสำเร็จ!' : '💥 คุณโดนจับโกหก!') + '</h3>' +
          '<p><b>' + cn + '</b> ไม่ได้ถือ ' + prof.name + ' — ท่ายกเลิก · จ่าย ' + an + ' ' + SC.ui.money(fine2) +
          ' · เปิดการ์ดทิ้งถาวร 1 ใบ · เครดิตพัง 2 รอบ</p>', onFalse);
      });
    }
  },

  // ---------- B) Counter: เป้าอ้างอาชีพเคาน์เตอร์ ----------
  _counter: function (o, counterProf) {
    var self = this, cfg = SC.config;
    var an = SC.actorName(o.attacker), tn = SC.actorName(o.target);
    var cp = SC.getProf(counterProf);
    var lying = !SC.hasProf(o.target, counterProf);
    var proceed = function () { SC.attacks.apply(o.claim, o.attacker, o.target, o.opts, o.onDone); };

    SC.feedPush('🛡️ ' + tn + ' อ้างเป็น ' + cp.emoji + ' ' + cp.name + ' เคาน์เตอร์!', 'claim');
    SC.timelinePush(tn + ' อ้าง ' + cp.name + ' เคาน์เตอร์ ' + an + (lying ? ' (โกหก)' : ' (ถือจริง)'), lying ? 'lie' : 'truth');
    if (SC.botBrain) SC.botBrain.noteClaim(o.target, counterProf);

    var yield_ = function () { // ผู้โจมตียอม: ท่ายกเลิก + จ่ายเป้า 500
      SC.attacks.pay(o.attacker, o.target, cfg.counterComp);
      SC.feedPush('🛡️ ' + an + ' ยอมถอย — ท่ายกเลิก จ่าย ' + tn + ' ' + SC.ui.money(cfg.counterComp), 'counter');
      self.info('<h3>🛡️ เคาน์เตอร์สำเร็จ</h3><p>ท่ายกเลิก — ' + an + ' จ่าย ' + tn + ' ' + SC.ui.money(cfg.counterComp) + '</p>', o.onDone);
    };
    var challengeCounter = function () { // ผู้โจมตี challenge การ์ดเคาน์เตอร์ของเป้า
      if (SC.botBrain) SC.botBrain.noteChallenge(o.attacker, o.target, counterProf);
      if (SC.hasProf(o.target, counterProf)) {
        // เป้าถือจริง: ท่ายกเลิก + ผู้โจมตีจ่าย 500 (เคาน์เตอร์) + 800 (แพ้ challenge) · เป้าสับใบจั่วใหม่
        var fine = o.attacker.brokenCredit > 0 ? cfg.challengePenaltyBroken : cfg.challengePenalty;
        SC.attacks.pay(o.attacker, o.target, cfg.counterComp + fine);
        SC.deck.proveAndRedraw(o.target, counterProf);
        SC.feedPush('💥 ' + an + ' challenge เคาน์เตอร์ — แต่ ' + tn + ' ถือ ' + cp.name + ' จริง! จ่ายรวม ' + SC.ui.money(cfg.counterComp + fine), 'challenge');
        SC.timelinePush(an + ' challenge เคาน์เตอร์ของ ' + tn + ' — จับผิด', 'wrong');
        if (SC.botBrain) SC.botBrain.noteChallengeResult(o.target, counterProf, true);
        self.info('<h3>' + (o.attacker.isPlayer ? '❌ จับผิด!' : '✅ เคาน์เตอร์ผ่าน!') + '</h3>' +
          '<p>' + tn + ' ถือ ' + cp.emoji + ' ' + cp.name + ' จริง — ท่ายกเลิก · ' + an + ' จ่าย ' +
          SC.ui.money(cfg.counterComp) + ' + ' + SC.ui.money(fine) + '</p>', o.onDone);
      } else {
        // เป้าอ้างมั่ว: เคาน์เตอร์ล้ม ท่าทำงานต่อ + เป้าจ่าย 800 + ทิ้ง 1 ใบ + เครดิตพัง
        var fine2 = o.target.brokenCredit > 0 ? cfg.challengePenaltyBroken : cfg.challengePenalty;
        SC.attacks.pay(o.target, o.attacker, fine2);
        o.target.brokenCredit = cfg.brokenCreditRounds + 1;
        SC.feedPush('💥 ' + an + ' จับได้ว่าเคาน์เตอร์ของ ' + tn + ' เป็นของปลอม! ท่าเดินหน้าต่อ', 'challenge');
        SC.timelinePush(an + ' จับโกหกเคาน์เตอร์ของ ' + tn + ' สำเร็จ', 'caught');
        if (SC.botBrain) SC.botBrain.noteChallengeResult(o.target, counterProf, false);
        self._discardOne(o.target, function () {
          self.info('<h3>' + (o.attacker.isPlayer ? '✅ จับโกหกสำเร็จ!' : '💥 เคาน์เตอร์คุณโดนจับ!') + '</h3>' +
            '<p>' + tn + ' ไม่ได้ถือ ' + cp.name + ' — จ่าย ' + SC.ui.money(fine2) + ' · ทิ้งการ์ด 1 ใบ · เครดิตพัง 2 รอบ · <b>ท่าโจมตีทำงานต่อ</b></p>', proceed);
        });
      }
    };

    if (o.attacker.isPlayer) {
      this.popup(
        '<h3>🛡️ ' + tn + ' เคาน์เตอร์!</h3>' +
        '<p>' + tn + ' อ้างเป็น <b>' + cp.emoji + ' ' + cp.name + '</b> เพื่อยกเลิกท่าของคุณ</p>' +
        '<p class="muted">ยอม = ท่ายกเลิก + จ่าย ฿500 · Challenge = ถ้าเขาอ้างจริงจ่ายเพิ่ม ฿800 แต่ถ้าโกหกท่าคุณเดินหน้าต่อ</p>',
        [{ label: '🏳️ ยอม (จ่าย ฿500)', cls: '', fn: yield_ },
         { label: '🔥 Challenge เคาน์เตอร์!', cls: 'btn-challenge', fn: challengeCounter }]);
    } else {
      var d = SC.botBrain.respondToCounter(o.attacker, o.target, counterProf);
      var delay = (cfg.bot.responseDelaySec[0] + Math.random() * 3) * 1000;
      this.popup('<h3>⏳ ' + an + ' กำลังตัดสินใจ…</h3><p class="muted">ยอมถอย หรือ challenge เคาน์เตอร์</p>', []);
      setTimeout(function () {
        self.closePopup();
        if (d === 'challenge') challengeCounter(); else yield_();
      }, delay);
    }
  },

  // เปิดการ์ดทิ้งถาวร 1 ใบ (เลือกเอง) — ผู้เล่นเลือกผ่าน popup · บอทเลือกใบ faceUp ก่อน (เปิดอยู่แล้ว)
  _discardOne: function (actor, done) {
    if (!actor.cards.length) return done();
    if (actor.isPlayer) {
      var btns = actor.cards.map(function (c, i) {
        var p = SC.getProf(c.prof);
        return { label: p.emoji + ' ' + p.name + (c.faceUp ? ' (เปิดอยู่แล้ว)' : ''), cls: 'btn-challenge', fn: function () {
          var prof = SC.deck.discard(actor, i);
          SC.feedPush('🗑️ คุณเปิดทิ้ง "' + SC.getProf(prof).name + '" ถาวร', 'reveal');
          done();
        } };
      });
      this.popup('<h3>🗑️ เลือกการ์ดที่จะเปิดทิ้งถาวร</h3><p class="muted">ทิ้งครบ 2 ใบ = ใช้ท่าโจมตี/เคาน์เตอร์ไม่ได้ถาวร (ยัง challenge/เดิน/ลงทุนได้ — ยังชนะด้วยพอร์ตได้)</p>', btns);
    } else {
      var idx = actor.cards.findIndex(function (c) { return c.faceUp; }); // ใบที่เปิดหน้าอยู่แล้ว = เสียน้อยสุด
      if (idx < 0) idx = Math.floor(Math.random() * actor.cards.length);
      var prof = SC.deck.discard(actor, idx);
      SC.feedPush('🗑️ ' + SC.actorName(actor) + ' เปิดทิ้ง "' + SC.getProf(prof).name + '" ถาวร', 'reveal');
      if (SC.botBrain) SC.botBrain.noteReveal(actor, prof);
      done();
    }
  },
};
