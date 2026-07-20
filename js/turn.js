// ============================================================
// turn.js — เทิร์นตาม GAME_SPEC ข้อ 5.2: สองเฟส
//   ① เฟสโจมตี — ไม่จับเวลา: ใช้ท่า (ประกาศอาชีพ+เป้า → resolution) หรือข้ามรับเงินเดือน ฿300
//   ② เฟสแมพ — จับเวลา 60 วิ: เดิน+ธุรกรรมทุกอย่างกินเวลาจริง (นาฬิกาหยุดระหว่างหน้าต่างเปิด)
//   เทิร์นบอทใช้กติกาเดียวกัน แต่เฟสแมพบีบเวลา (จบคิวกิจกรรม = จบเทิร์นเลย)
// ============================================================
SC.turn = {};

var _now = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };
var _el = function (id) { return document.getElementById(id); };

// ---------- ส่วนประกอบ UI ร่วม ----------

// อันดับหยาบ (ฟรีตลอดเวลา): ลำดับ 1-6 ไม่โชว์ตัวเลข — ดูละเอียดต้องเดินไปลีดเดอร์บอร์ด
SC.turn._coarseRankHtml = function () {
  var s = SC.state;
  var all = [s.player].concat(s.bots).map(function (a) {
    return { a: a, v: SC.portfolioValue(a, s.prices) };
  }).sort(function (x, y) { return y.v - x.v; });
  return '<div class="rank-strip">🏅 ' + all.map(function (r, i) {
    var nm = r.a.isPlayer ? '<b>คุณ</b>' : r.a.name;
    return (i + 1) + '.' + nm;
  }).join(' · ') + '</div>';
};

// แผงการ์ดของผู้เล่นมุมล่างขวา (ตอนเฟสแมพ) — img จริง คลิกซูมได้
SC.turn._myCardsPanel = function () {
  var p = SC.state.player;
  var live = p.cards.map(function (c) {
    var pr = SC.getProf(c.prof);
    return '<div class="mc-card' + (c.faceUp ? ' faceup' : '') + '" data-zoom="' + c.prof + '" title="' + pr.name + '">' +
      '<img src="' + SC.cardArt(c.prof) + '" alt="' + pr.name + '">' +
      (c.faceUp ? '<span class="mc-badge">เปิด</span>' : '') +
      '</div>';
  }).join('');
  var lost = p.lostCards.map(function (pf) {
    var pr = SC.getProf(pf);
    return '<div class="mc-card lost" data-zoom="' + pf + '" title="' + pr.name + ' (ทิ้งแล้ว)">' +
      '<img src="' + SC.cardArt(pf) + '" alt="' + pr.name + '">' +
      '<span class="mc-badge bad">✗</span>' +
      '</div>';
  }).join('');
  return '<div class="ov-mycards">' + live + lost + '</div>';
};
SC.turn._bindMyCardsZoom = function () {
  Array.prototype.forEach.call(SC.ui.screen().querySelectorAll('.ov-mycards [data-zoom]'), function (el) {
    el.onclick = function () { SC.ui.zoomCard(SC.cardArt(el.getAttribute('data-zoom'))); };
  });
};

// การ์ดอาชีพลับของผู้เล่น (ชิปเล็กๆ ลอยบนแมพ) — เลิกใช้ในโปรไฟล์แล้ว (ย้ายเป็นแผงล่างขวา _myCardsPanel) ฟังก์ชันทิ้งไว้เผื่อเรียกใช้อื่น
SC.turn._myCardsHtml = function () {
  var p = SC.state.player;
  var chips = p.cards.map(function (c) {
    var pr = SC.getProf(c.prof);
    return '<span class="card-chip' + (c.faceUp ? ' faceup' : '') + '" title="' + pr.attack + '">' +
      pr.emoji + ' ' + pr.name + (c.faceUp ? ' (เปิด)' : '') + '</span>';
  }).join('');
  p.lostCards.forEach(function (pf) {
    chips += '<span class="card-chip lost">🗑️ ' + SC.getProf(pf).name + '</span>';
  });
  return '<div class="my-cards">🃏 ' + (chips || '<span class="muted">ไม่มีการ์ดเหลือ</span>') + '</div>';
};

SC.turn._statusChips = function (a) {
  var out = '';
  if (a.brokenCredit > 0) out += '<span class="st-chip bad">💳 เครดิตพัง ' + a.brokenCredit + ' รอบ</span>';
  if (a.frozen) out += '<span class="st-chip bad">⚖️ ถูกอายัด</span>';
  return out;
};

// หน้าเทิร์น = แมปเต็มหน้าจอ — UI ลอยทับ: โปรไฟล์ซ้ายบน · นาฬิกาขวาบน · ฟีด/อันดับซ้ายล่าง · ปุ่มขวาล่าง
SC.turn._screen = function (o) {
  SC.ui.renderHUD();
  SC.ui.screen().innerHTML =
    '<div class="map-wrap map-full" id="mapWrap">' +
      '<div class="ov-top">' +
        '<div class="turn-profile">' + o.profileHtml + '</div>' +
        '<div class="ov-topright">' +
          '<button class="map-tool" id="fsBtn" title="เต็มจอ (ซ่อนแถบเบราว์เซอร์)">⛶</button>' +
          '<button class="map-tool" id="calBtn" title="ปรับตำแหน่งตึกให้ตรงรูป">🎯</button>' +
          '<div class="turn-clock" id="turnClock">' + (o.clock != null ? o.clock : '—') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ov-bottom">' +
        '<div class="ov-info" id="turnBelow">' +
          (o.belowHtml || '') +
          '<div class="feed-box"><b>📣 เหตุการณ์:</b><div id="feedList">' + SC.duel.feedHtml() + '</div></div>' +
          SC.turn._coarseRankHtml() +
        '</div>' +
        '<div class="ov-actions">' +
          (o.myCards === false ? '' : SC.turn._myCardsPanel()) +
          '<div class="ov-actions-row">' + o.footHtml + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  SC.turn._bindMyCardsZoom();
};

SC.turn._bindMapTools = function () {
  var fs = _el('fsBtn'); if (fs) fs.onclick = function () { SC.ui.toggleFullscreen(_el('mapWrap')); };
  var cal = _el('calBtn'); if (cal) cal.onclick = function () { SC.world.toggleCalibrate(); };
};

SC.turn._loading = function (msg) {
  SC.ui.screen().innerHTML = '<div class="loading3d"><div class="spinner"></div><p>' + msg + '</p></div>';
};

// ===================== เทิร์นผู้เล่น =====================
SC.turn.playerTurn = function (onDone) {
  var s = SC.state, p = s.player;

  // สถานะอายัดมีผล "เทิร์นถัดไป" — เช็คตอนเริ่มเทิร์นนี้
  if (p.frozenNext) { p.frozen = true; p.frozenNext = false; }

  var finishTurn = function () {
    p.frozen = false;
    onDone();
  };

  // ① เฟสโจมตี (ไม่จับเวลา) → ② เฟสแมพ
  if (p.frozen) {
    SC.ui.toast('⚖️ คุณถูกอายัด — เทิร์นนี้เดินแมพได้อย่างเดียว (ห้ามทุกธุรกรรม)', 'warn');
    SC.turn._mapPhase(p, finishTurn);
  } else {
    SC.turn._attackPhase(p, function () { SC.turn._mapPhase(p, finishTurn); });
  }
};

// ---------- ① เฟสโจมตีของผู้เล่น ----------
SC.turn._attackPhase = function (p, onDone) {
  var s = SC.state;
  var canMove = SC.canUseMoves(p);
  SC.main._bgStart(); // พื้นหลัง = แมปสดแบบหน้าเมนู (user 2026-07-20) — เฟสแมพ/เทิร์นบอทจะ _bgStop เอง

  // การ์ดในมือ (โชว์ใหญ่ — อาร์ตจริง) + การ์ดที่ทิ้งไปแล้วต่อท้าย (grayscale)
  var liveHandHtml = p.cards.map(function (c) {
    var pr = SC.getProf(c.prof);
    return '<div class="hand-card-img' + (c.faceUp ? ' faceup' : '') + '" data-zoom="' + c.prof + '">' +
      '<img src="' + SC.cardArt(c.prof) + '" alt="' + pr.name + '">' +
      (c.faceUp ? '<span class="hc-tag">เปิดอยู่</span>' : '<span class="hc-tag secret">ลับ</span>') +
      '</div>';
  }).join('');
  var lostHandHtml = p.lostCards.map(function (pf) {
    var pr = SC.getProf(pf);
    return '<div class="hand-card-img lost" data-zoom="' + pf + '">' +
      '<img src="' + SC.cardArt(pf) + '" alt="' + pr.name + '">' +
      '<span class="hc-tag lost-tag">ทิ้งแล้ว</span>' +
      '</div>';
  }).join('');
  var handHtml = (liveHandHtml || '<p class="muted">การ์ดหมด — ใช้ท่าโจมตีไม่ได้แล้ว (ยัง challenge/ลงทุนได้)</p>') + lostHandHtml;

  // ปุ่มอาชีพทั้ง 8 (อ้างมั่วได้ทุกใบ) — ปุ่มเป็นรูปการ์ดเต็มใบ
  var profBtns = SC.professions.map(function (pr) {
    var has = SC.hasProf(p, pr.id);
    return '<button class="prof-card pc-img' + (has ? ' held' : '') + '" data-prof="' + pr.id + '"' + (canMove ? '' : ' disabled') + '>' +
      '<span class="pc-zoom" data-zoomprof="' + pr.id + '">🔍</span>' +
      '<img src="' + SC.cardArt(pr.id) + '" alt="' + pr.name + '">' +
      (has ? '<span class="pc-held">ถือจริง</span>' : '<span class="pc-bluff">ต้องบลัฟ</span>') +
      '</button>';
  }).join('');

  SC.ui.renderHUD();
  SC.ui.screen().innerHTML =
    '<div class="attack-phase">' +
      '<div class="phase-head"><h2>⚔️ เฟสโจมตี — รอบ ' + s.week + '/' + SC.config.weeks + '</h2>' +
      '<p class="muted">ไม่จับเวลา คิดได้เต็มที่ · ประกาศอาชีพ (จริงหรืออ้างมั่วก็ได้) + เลือกเป้า 1 คน · หรือข้ามรับเงินเดือน ฿300</p>' +
      SC.turn._statusChips(p) + '</div>' +
      '<h3>การ์ดลับของคุณ</h3><div class="hand-row">' + handHtml + '</div>' +
      '<h3>เลือกท่าโจมตี (อ้างอาชีพไหนก็ได้)</h3>' +
      '<div class="prof-grid">' + profBtns + '</div>' +
      '<div class="phase-foot">' +
        '<button class="btn btn-lg btn-go" id="skipBtn">💼 ข้าม — รับเงินเดือน ฿300 ▶</button>' +
      '</div>' +
    '</div>';

  _el('skipBtn').onclick = function () {
    p.cash += SC.config.salarySkip;
    SC.feedPush('💼 คุณข้ามการโจมตี รับเงินเดือน ' + SC.ui.money(SC.config.salarySkip), '');
    onDone();
  };

  Array.prototype.forEach.call(SC.ui.screen().querySelectorAll('[data-prof]'), function (bt) {
    bt.onclick = function () { SC.turn._pickTarget(p, bt.getAttribute('data-prof'), onDone); };
  });
  // ปุ่มซูมเล็กมุมซ้ายบนของปุ่มการ์ด — กันชนกับการเลือกท่า
  Array.prototype.forEach.call(SC.ui.screen().querySelectorAll('[data-zoomprof]'), function (sp) {
    sp.onclick = function (e) {
      e.stopPropagation();
      SC.ui.zoomCard(SC.cardArt(sp.getAttribute('data-zoomprof')));
    };
  });
  // การ์ดในมือ/ทิ้งแล้ว คลิกซูมดูได้
  Array.prototype.forEach.call(SC.ui.screen().querySelectorAll('.hand-row [data-zoom]'), function (el) {
    el.onclick = function () { SC.ui.zoomCard(SC.cardArt(el.getAttribute('data-zoom'))); };
  });
};

// เลือกเป้า (+โหมดของนักสืบ) แล้วเข้าสู่ resolution
SC.turn._pickTarget = function (p, profId, onDone) {
  var s = SC.state, pr = SC.getProf(profId);
  var others = s.bots.slice(); // เล่นกับบอท — เป้าคือบอททุกตัว
  var lying = !SC.hasProf(p, profId);

  var rows = others.map(function (t) {
    var ok = SC.attacks.canTarget(profId, p, t);
    return '<button class="target-row" data-target="' + t.id + '"' + (ok ? '' : ' disabled') + '>' +
      '<span class="tr-emoji">' + t.emoji + '</span><b>' + t.name + '</b>' +
      SC.turn._statusChips(t) +
      (ok ? '' : '<small class="bad">ไม่เข้าเงื่อนไขท่านี้</small>') +
      '</button>';
  }).join('');

  var modeHtml = profId === 'hacker' ?
    '<div class="hack-mode"><label><input type="radio" name="hmode" value="money" checked> 💰 โหมดเงิน — ขโมยเงินสด ฿800</label>' +
    '<label><input type="radio" name="hmode" value="info"> 🔎 โหมดข้อมูล — ดูการ์ด 1 ใบ + พอร์ตเต็มของเป้า</label></div>' : '';

  SC.ui.screen().innerHTML =
    '<div class="attack-phase">' +
      '<div class="phase-head"><h2>' + pr.emoji + ' ' + pr.name + ' — "' + pr.attack + '"</h2>' +
      '<p class="muted">' + pr.attackDesc + '</p>' +
      (lying ? '<p class="warn-lie">🎭 คุณไม่ได้ถือการ์ดนี้ — ถ้าโดน challenge จะเสีย ฿800 + ทิ้งการ์ด + เครดิตพัง!</p>'
             : '<p class="ok-truth">✅ คุณถือการ์ดนี้จริง — โดน challenge ได้เงิน ฿800</p>') +
      '</div>' +
      modeHtml +
      '<h3>เลือกเป้า</h3><div class="target-list">' + rows + '</div>' +
      '<div class="phase-foot"><button class="btn btn-lg" id="backBtn">‹ กลับ</button></div>' +
    '</div>';

  _el('backBtn').onclick = function () { SC.turn._attackPhase(p, onDone); };
  Array.prototype.forEach.call(SC.ui.screen().querySelectorAll('[data-target]'), function (bt) {
    bt.onclick = function () {
      var t = s.bots.find(function (b) { return b.id === bt.getAttribute('data-target'); });
      var opts = {};
      if (profId === 'hacker') {
        var mEl = SC.ui.screen().querySelector('input[name="hmode"]:checked');
        opts.mode = mEl ? mEl.value : 'money';
      }
      if (SC.botBrain) SC.botBrain.noteAttack(p, t);
      SC.duel.run({ attacker: p, claim: profId, target: t, opts: opts, onDone: onDone });
    };
  });
};

// ---------- ② เฟสแมพ 60 วิ (ผู้เล่น) ----------
SC.turn._mapPhase = function (p, onDone) {
  var s = SC.state, cfg = SC.config;
  SC.main._bgStop(); // เฟสแมพ mount world ลงจอเทิร์นเอง — ห้ามมี loop พื้นหลังซ้อน
  SC.turn._loading('กำลังโหลดแมปเมือง…');
  // เหตุการณ์อาจย่นเวลาเฟสแมพ (blackout 30 วิ / phoneDrop 40 วิ เฉพาะเป้า)
  var mapSec = (SC.events && SC.events.mapTimeSec(p)) || cfg.mapSeconds;

  SC.world.ensure().then(function () {
    SC.turn._screen({
      profileHtml:
        '<span class="tp-emoji">' + p.emoji + '</span>' +
        '<div><div class="tp-name">เทิร์นของคุณ — ' + p.name + '</div>' +
        '<div class="tp-sub">รอบ ' + s.week + '/' + cfg.weeks + '</div>' +
        SC.turn._statusChips(p) + '</div>',
      clock: mapSec,
      belowHtml: p.frozen ?
        '<div class="turn-hint">⚖️ ถูกอายัด: เดินแมพได้อย่างเดียว — เปิดตึก/ธุรกรรมไม่ได้เทิร์นนี้</div>' :
        '<div class="turn-hint">🚶 คลิกตึก → เดินถึงแล้วหน้าต่างเด้ง · ทำกี่ธุรกรรมก็ได้ · ⏱ นาฬิกา 60 วิ เดินตลอด (รวมตอนเปิดหน้าต่าง)</div>',
      footHtml: '<button class="btn btn-lg btn-go" id="endTurnBtn">จบเทิร์น ▶</button>',
    });

    SC.world.mountInto(_el('mapWrap'));
    SC.turn._bindMapTools();
    SC.world.setBuildings({});
    SC.world.spawnActor('Char_' + p.charId, p);
    SC.world.enablePlayerInput();

    var T = SC.turn._t = { ended: false, windowOpen: false,
      endAt: _now() + mapSec * 1000, last: _now() };
    _el('endTurnBtn').onclick = function () { endTurn(); };

    // ภัยพิบัติปิดตึก: ไม่ยิงต้นรอบแล้ว — โผล่กลางเฟสแมพ (user 2026-07-20)
    //   นาฬิกาหยุดระหว่างคัตซีน (ชดเชยด้วยการเลื่อน endAt) เพราะผู้เล่นทำอะไรไม่ได้ตอนนั้น
    if (SC.events && SC.events.disasterDue(p)) {
      var tryFire = function () {
        if (T.ended) return;
        if (T.windowOpen) { T.disTimer = setTimeout(tryFire, 700); return; }   // รอปิดหน้าต่างตึกก่อน
        var pauseFrom = _now();
        SC.world.lockMovement(true);
        SC.events.fireDisaster(function () {
          if (T.ended) return;
          T.endAt += (_now() - pauseFrom);
          T.last = _now();
          if (!T.windowOpen) SC.world.lockMovement(false);
        });
      };
      T.disTimer = setTimeout(tryFire, mapSec * (0.25 + Math.random() * 0.4) * 1000);
    }

    function openWindow(id) {
      if (T.windowOpen || T.ended) return;
      // ตึกที่ถูกเหตุการณ์ปิด (ยกเว้น gold ที่ปิดไม่ได้) — เข้าไม่ได้ (EVENTS_SPEC ข้อ 8)
      if (SC.events && SC.events.isClosed(id) && id !== 'gold') {
        var cb = SC.map.cityById(id);
        SC.ui.toast('🚧 ' + (cb ? cb.name : 'ตึกนี้') + ' ปิดซ่อม (อีก ' + s.events.closed[id] + ' รอบ)', 'warn');
        return;
      }
      if (p.frozen) { SC.ui.toast('⚖️ ถูกอายัด — เข้าตึกไม่ได้เทิร์นนี้', 'warn'); return; }
      T.windowOpen = true;
      SC.world.lockMovement(true);
      s.visits[p.id][id] = (s.visits[p.id][id] || 0) + 1; // สาธารณะ: ทุกคนเห็นว่าเดินเข้าตึกไหน
      SC.windows.open(id, function () {
        T.windowOpen = false;
        if (!T.ended) SC.world.lockMovement(false);
      });
    }

    function endTurn() {
      if (T.ended || T.ending) return;
      clearTimeout(T.disTimer);
      // ภัยพิบัติจองคิวเทิร์นนี้ไว้แต่ยังไม่ทันยิง (จบเทิร์นเร็ว/หมดเวลาก่อน) → ยิงก่อนปิดเทิร์น
      //   ไม่งั้นกดจบเทิร์นเร็วทุกครั้ง = หลบเหตุการณ์ได้ตลอดเกม (user 2026-07-20)
      if (SC.events && SC.events.disasterDue(p)) {
        T.ending = true;
        SC.windows.close(true);          // ต้องปิดหน้าต่างตึกก่อน ไม่งั้นคัตซีนโดนบัง
        SC.world.lockMovement(true);
        SC.events.fireDisaster(function () { T.ending = false; finishTurn(); });
        return;
      }
      finishTurn();
    }

    function finishTurn() {
      if (T.ended) return; T.ended = true;
      cancelAnimationFrame(T.raf);
      clearTimeout(T.disTimer);
      SC.windows.close(true);
      SC.world.disableInput(); SC.world.clearBubbles();
      onDone();
    }

    function loop() {
      if (T.ended) return;
      var t = _now(), stepMs = t - T.last; T.last = t;
      // นาฬิกาเดินต่อแม้เปิดหน้าต่าง — เวลาที่ใช้อ่าน/ทำธุรกรรมนับรวมใน 60 วิ (user 2026-07-13)
      var dt = Math.min(0.05, stepMs / 1000);
      // T.ending = กำลังเล่นคัตซีนภัยพิบัติปิดท้ายเทิร์น → หยุดนับเวลา แต่แมปยังมีชีวิต
      if (!T.ending) {
        var remain = Math.max(0, (T.endAt - t) / 1000);
        var clk = _el('turnClock');
        if (clk) {
          clk.textContent = Math.ceil(remain);
          clk.className = 'turn-clock' + (remain <= 5 ? ' danger' : '');
        }
        if (remain <= 0) { endTurn(); return; } // หมดเวลา = จบทันที ธุรกรรมค้าง = ไม่เกิด
      }

      SC.world.tick(dt, 'player');
      var arrived = SC.world.consumeArrival();
      if (!T.windowOpen && arrived) openWindow(arrived);
      T.raf = requestAnimationFrame(loop);
    }
    T.raf = requestAnimationFrame(loop);
  }).catch(function (e) {
    SC.ui.screen().innerHTML = '<div class="loading3d err"><h3>โหลดแมปไม่ได้</h3><p class="muted">' + (e && e.message ? e.message : e) + '</p></div>';
  });
};

// ===================== เทิร์นบอท =====================
SC.turn.botTurn = function (bot, onDone) {
  var s = SC.state, cfg = SC.config;
  SC.main._bgStop(); // เทิร์นบอท mount world เอง — ปิดพื้นหลังเมนู/เฟสโจมตีก่อน
  if (bot.frozenNext) { bot.frozen = true; bot.frozenNext = false; }

  var finishTurn = function () { bot.frozen = false; onDone(); };

  SC.turn._loading('กำลังโหลดแมปเมือง…');
  SC.world.ensure().then(function () {
    SC.turn._screen({
      profileHtml:
        '<span class="tp-emoji">' + bot.emoji + '</span>' +
        '<div><div class="tp-name">เทิร์น ' + bot.name + '</div>' +
        '<div class="tp-sub">รอบ ' + s.week + '/' + cfg.weeks + '</div>' +
        SC.turn._statusChips(bot) + '</div>',
      clock: null,
      belowHtml: '<div class="turn-hint">👀 ดูว่าบอทเดินเข้าตึกไหน (ธุรกรรมมองไม่เห็น) — โดนโจมตีจะมี popup ให้ตอบใน 10 วิ</div>',
      footHtml: '<button class="btn btn-lg" id="skipWatchBtn">ข้ามดู ▶</button>',
    });

    SC.world.mountInto(_el('mapWrap'));
    SC.turn._bindMapTools();
    SC.world.setBuildings({});
    SC.world.spawnActor('Char_' + bot.charId, bot);

    var T = SC.turn._t = { ended: false, phase: 'attack', last: _now(), skip: false };
    _el('skipWatchBtn').onclick = function () { T.skip = true; };

    function endTurn() {
      if (T.ended || T.ending) return;
      clearTimeout(T.disTimer);
      // ภัยจองคิวเทิร์นบอทนี้ไว้ แต่บอทเดินจบ/ผู้เล่นกด "ข้ามดู" ก่อน → ยิงก่อนปิดเทิร์น
      if (SC.events && SC.events.disasterDue(bot)) {
        T.ending = true;
        SC.events.fireDisaster(function () { T.ending = false; closeTurn(); });
        return;
      }
      closeTurn();
    }

    function closeTurn() {
      if (T.ended) return; T.ended = true;
      cancelAnimationFrame(T.raf); clearTimeout(T.disTimer); SC.world.clearBubbles();
      finishTurn();
    }

    // ② เฟสแมพของบอท: เดินตามคิว ทำธุรกรรมตอนถึงตึก — จบคิวแล้วจบเทิร์นเลย (บีบเวลา)
    function mapPhase() {
      T.phase = 'map';
      // ภัยพิบัติอาจตกใส่เมืองระหว่างที่เราดูบอทเดินอยู่ (user 2026-07-20)
      if (SC.events && SC.events.disasterDue(bot)) {
        T.disTimer = setTimeout(function () {
          if (!T.ended) SC.events.fireDisaster(function () {});
        }, 700 + Math.random() * 1200);
      }
      // เหตุการณ์ botToilet: บอทข้ามเฟสแมพรอบนี้ (ยืนนิ่งหน้าน้ำพุ)
      if (bot._skipMapRound === s.week) {
        SC.world.addBubble('🚽 ขอตัวเข้าห้องน้ำ…', 'tell');
        setTimeout(endTurn, 900); return;
      }
      var plan = SC.botBrain.planMap(bot);
      if (!plan.length) { setTimeout(endTurn, 500); return; }
      var acts = {};
      plan.forEach(function (st) { acts[st.building] = acts[st.building] || []; acts[st.building].push(st.act); });
      SC.world.setBotPath(plan.map(function (st) { return st.building; }), function (bid) {
        s.visits[bot.id][bid] = (s.visits[bot.id][bid] || 0) + 1;
        var list = acts[bid] || [];
        var act = list.shift();
        if (act) SC.botBrain.execAction(bot, act);
      });
    }

    // ① เฟสโจมตีของบอท (ไม่จับเวลา — resolution อาจมี popup ถามผู้เล่น)
    function attackPhase() {
      var action = SC.botBrain.chooseAction(bot);
      if (bot.frozen) {
        SC.world.addBubble('⚖️ โดนอายัดอยู่', 'tell');
        setTimeout(mapPhase, 800);
      } else if (action) {
        SC.botBrain.noteAttack(bot, action.target);
        SC.duel.run({ attacker: bot, claim: action.claim, target: action.target, opts: action.opts, onDone: mapPhase });
      } else {
        bot.cash += cfg.salarySkip;
        SC.feedPush('💼 ' + bot.name + ' ข้ามการโจมตี รับเงินเดือน ' + SC.ui.money(cfg.salarySkip), '');
        SC.world.addBubble('💼 รับเงินเดือน', 'tell');
        setTimeout(mapPhase, 900);
      }
    }

    function loop() {
      if (T.ended) return;
      var t = _now(), dt = Math.min(0.05, (t - T.last) / 1000); T.last = t;
      SC.world.tick(dt, 'bot');
      var clk = _el('turnClock');
      if (clk) clk.textContent = T.phase === 'attack' ? '⚔️' : '🚶';
      if (T.phase === 'map' && (SC.world.botFinished() || T.skip)) { endTurn(); return; }
      T.raf = requestAnimationFrame(loop);
    }
    T.raf = requestAnimationFrame(loop);
    setTimeout(attackPhase, 700); // เว้นจังหวะให้เห็นว่าเทิร์นใครก่อนเริ่ม
  }).catch(function (e) {
    SC.ui.screen().innerHTML = '<div class="loading3d err"><h3>โหลดแมปไม่ได้</h3><p class="muted">' + (e && e.message ? e.message : e) + '</p></div>';
  });
};
