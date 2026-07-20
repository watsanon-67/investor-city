// ============================================================
// main.js — เริ่มเกม + flow รอบ/เทิร์น (GAME_SPEC ข้อ 5.1)
//   เล่นทีละคนตามลำดับ (สุ่มตอนเริ่ม แล้วคงที่) → ครบทุกคน = จบรอบ
//   → ประมวลผลท้ายรอบเงียบๆ เบื้องหลัง (ไม่มีหน้าสรุป) → รอบใหม่ต่อเนื่อง
//   สรุปผลครั้งเดียว = จอจบเกม (อันดับ + เฉลยอาชีพ + ไทม์ไลน์โกหก)
// ============================================================
SC.main = {};

SC.main.init = function () {
  SC.main.renderLanding();
};

// ============================================================
// พื้นหลังเมนู = แมปจริงของเกม (ไม่มี label/UI) + ambient เดินตลอด (user 2026-07-20
//   อ้างอิงตัวอย่าง investor_city_start / game start1 / investorcity_before_start_game)
//   ใช้ world เดิม mount ลง layer fixed หลัง #app — เริ่มเกมจริงค่อยถอด (world mount ใหม่เอง)
// ============================================================
SC.main._bg = null;

SC.main._bgStart = function () {
  if (SC.main._bg) return;
  var el = document.createElement('div');
  el.className = 'menu-bg';
  document.body.insertBefore(el, document.body.firstChild);
  var bg = SC.main._bg = { el: el, raf: 0, dead: false };
  SC.world.ensure().then(function () {
    if (bg.dead) return;
    SC.world.mountInto(el);
    SC.world.setBuildings({});
    SC.world.spawnActor('Char_1', { design: SC.designer.get() }); // ตัวเรายืนเล่นๆ กลางเมือง
    var last = performance.now();
    var loop = function (now) {
      if (bg.dead) return;
      SC.world.tick(Math.min(0.05, (now - last) / 1000), 'idle'); // mode ไม่ใช่ player/bot = ยืนเฉยๆ
      last = now;
      bg.raf = requestAnimationFrame(loop);
    };
    bg.raf = requestAnimationFrame(loop);
  });
};

SC.main._bgStop = function () {
  var bg = SC.main._bg;
  if (!bg) return;
  bg.dead = true;
  cancelAnimationFrame(bg.raf);
  if (bg.el.parentNode) bg.el.parentNode.removeChild(bg.el);
  SC.main._bg = null;
};

// ---------- หน้าแรกสุด: โลโก้ + ปุ่ม START (อาร์ต investor_city_start ตัดเป็น assets/ui/) ----------
SC.main.renderLanding = function () {
  SC.state = null;
  SC.ui.renderHUD();
  SC.main._bgStart();
  SC.ui.screen().innerHTML =
    '<div class="landing">' +
      '<img class="landing-logo" src="assets/ui/logo_start.png" alt="Investor City">' +
      '<button class="btn-start" id="landStart" title="เริ่มเกม">' +
        '<img src="assets/ui/btn_start.png" alt="START">' +
      '</button>' +
    '</div>';
  SC.ui.el('landStart').onclick = function () { SC.main.renderModeSelect(); };
};

// ---------- หน้าเลือกจำนวนรอบ + โหมดการเล่น (อ้างอิงอาร์ต game start1) ----------
SC.main._weeksChoices = [5, 10, 15];

SC.main.renderModeSelect = function () {
  SC.state = null;
  SC.ui.renderHUD();
  SC.main._bgStart();
  var weeks = SC.config.weeks;
  var isPreset = SC.main._weeksChoices.indexOf(weeks) >= 0;

  var roundBtns = SC.main._weeksChoices.map(function (n) {
    return '<button class="btn count-btn' + (n === weeks ? ' active' : '') + '" data-weeks="' + n + '">' + n + ' รอบ</button>';
  }).join('') +
  '<button class="btn count-btn' + (isPreset ? '' : ' active') + '" id="customWeeks">กำหนดเอง' + (isPreset ? '' : '<br><span class="muted">' + weeks + ' รอบ</span>') + '</button>';

  SC.ui.screen().innerHTML =
    '<div class="modesel">' +
      '<img class="modesel-logo" src="assets/ui/logo_start.png" alt="Investor City">' +
      '<div class="menu-chip">กติกาเกมแบบย่อ</div>' +
      '<div class="menu-panel rules-panel">' +
        '<div class="rule-row"><span class="rule-ico">💵</span>เริ่มเกมด้วยเงิน <b class="gold">฿10,000</b> และการ์ดอาชีพลับ 2 ใบ</div>' +
        '<div class="rule-row"><span class="rule-ico">⏱️</span>1 เทิร์นมี 2 เฟส: โจมตี/ข้าม และเดินแมพลงทุน 60 วินาที</div>' +
        '<div class="rule-row"><span class="rule-ico">🎭</span>บลัฟได้ และสามารถ Challenge / Counter ได้</div>' +
        '<div class="rule-row"><span class="rule-ico">📈</span>ลงทุนได้หลายแบบ: หุ้น คริปโต ทอง อสังหา พันธบัตร กองทุน และ GreenHub</div>' +
        '<div class="rule-row"><span class="rule-ico">🏆</span>เลือกจำนวนรอบได้ก่อนเริ่มเกม และผู้ที่<b class="gold">มูลค่าสุทธิสูงสุด</b>เป็นผู้ชนะ</div>' +
      '</div>' +
      '<div class="menu-chip">เลือกจำนวนรอบ</div>' +
      '<div class="count-grid" id="roundGrid">' + roundBtns + '</div>' +
      '<div class="menu-chip">เลือกโหมดการเล่น</div>' +
      '<div class="mode-grid">' +
        '<button class="mode-btn mode-bot" id="modeBot">' +
          '<span class="mode-ico">🤖</span><span class="mode-txt"><b>เล่นกับบอท</b><small>แข่งขันกับบอท 2-5 ตัว</small></span>' +
        '</button>' +
        '<button class="mode-btn mode-party" id="modeParty">' +
          '<span class="mode-ico">👥</span><span class="mode-txt"><b>สร้าง Party</b><small>เล่น Multiplayer กับเพื่อน (เร็วๆ นี้)</small></span>' +
        '</button>' +
      '</div>' +
      '<button class="btn menu-back" id="backLanding">‹ กลับ</button>' +
    '</div>';

  Array.prototype.forEach.call(SC.ui.screen().querySelectorAll('[data-weeks]'), function (bt) {
    bt.onclick = function () {
      SC.config.weeks = parseInt(bt.getAttribute('data-weeks'), 10);
      SC.main.renderModeSelect();
    };
  });
  SC.ui.el('customWeeks').onclick = function () {
    var grid = SC.ui.el('roundGrid');
    grid.innerHTML =
      '<div class="custom-weeks">' +
        '<input type="number" id="weeksInput" min="3" max="30" value="' + SC.config.weeks + '"> รอบ ' +
        '<button class="btn" id="weeksOk">ตกลง</button>' +
        '<button class="btn" id="weeksCancel">ยกเลิก</button>' +
      '</div>';
    var input = SC.ui.el('weeksInput');
    input.focus(); input.select();
    var commit = function () {
      var v = parseInt(input.value, 10);
      if (!isFinite(v)) v = SC.config.weeks;
      SC.config.weeks = Math.max(3, Math.min(30, v));
      SC.main.renderModeSelect();
    };
    SC.ui.el('weeksOk').onclick = commit;
    input.onkeydown = function (ev) { if (ev.key === 'Enter') commit(); };
    SC.ui.el('weeksCancel').onclick = function () { SC.main.renderModeSelect(); };
  };
  SC.ui.el('modeBot').onclick = function () { SC.main.renderSetup(); };
  SC.ui.el('modeParty').onclick = function () { SC.ui.toast('👥 โหมด Multiplayer ยังไม่เปิด — ตอนนี้เล่นกับบอทได้ก่อน', 'warn'); };
  SC.ui.el('backLanding').onclick = function () { SC.main.renderLanding(); };
};

// ---------- หน้าเริ่มเกม ----------
SC.main._chosenBots = null;

SC.main.renderSetup = function () {
  SC.state = null;
  SC.ui.renderHUD();
  SC.main._bgStart(); // พื้นหลัง = แมปสดตลอดทุกหน้าเมนู (user 2026-07-20)

  // การ์ดอ้างอิง 8 อาชีพ (สุ่มแจกลับ 2 ใบ — เลือกไม่ได้) — ใช้อาร์ตการ์ดจริง คลิกซูมดูได้
  var cards = SC.professions.map(function (p) {
    return '<img class="ref-card" src="' + SC.cardArt(p.id) + '" alt="' + p.name + '" data-prof="' + p.id + '">';
  }).join('');

  var def = (SC.main._chosenBots == null) ? SC.config.numBots : SC.main._chosenBots;
  var counts = [
    { total: 3, bots: 2 },   // ตัวต่อตัวสองคน (user 2026-07-20)
    { total: 4, bots: 3 },
    { total: 5, bots: 4 },
    { total: 6, bots: 5 },
  ];
  var dz = SC.designer.get();
  var countBtns = counts.map(function (o) {
    var active = (o.bots === def) ? ' active' : '';
    return '<button class="btn count-btn' + active + '" data-bots="' + o.bots + '">' +
      o.total + ' คน<br><span class="muted">คุณ + บอท ' + o.bots + '</span></button>';
  }).join('');
  SC.main._chosenBots = def;

  // ตัวเลือกความเข้มข้นเหตุการณ์ (เก็บลง SC.eventsCfg.intensity ตอนเริ่มเกม)
  if (SC.main._intensity == null) SC.main._intensity = (SC.eventsCfg ? SC.eventsCfg.intensity : 'ปกติ');
  var intOpts = [
    { k: 'ชิล',    sub: 'เหตุการณ์น้อย ผลเบา' },
    { k: 'ปกติ',   sub: 'สมดุลตามดีไซน์' },
    { k: 'โกลาหล', sub: 'เหตุการณ์ถี่ ผลแรง' },
  ];
  var intBtns = intOpts.map(function (o) {
    var active = (o.k === SC.main._intensity) ? ' active' : '';
    return '<button class="btn count-btn' + active + '" data-int="' + o.k + '">' +
      o.k + '<br><span class="muted">' + o.sub + '</span></button>';
  }).join('');

  SC.ui.screen().innerHTML =
    '<div class="setup">' +
      '<img class="setup-logo" src="assets/ui/logo_start.png" alt="Investor City">' +
      '<p class="tagline">ลงทุนในเมือง · การ์ดอาชีพลับ 2 ใบ · บลัฟ-Challenge สไตล์ Coup · ' +
        SC.config.weeks + ' รอบ มูลค่าสุทธิสูงสุดชนะ</p>' +
      '<h3>ตัวละครของคุณ</h3>' +
      '<div class="design-strip">' +
        '<canvas id="setupPreview" width="130" height="160"></canvas>' +
        '<div class="design-strip-info">' +
          '<b>' + (dz.name ? dz.name : 'ยังไม่ตั้งชื่อ') + '</b>' +
          '<span class="muted">แต่งสีหมวก/เสื้อ/กางเกง/ผิว/ผม + ตั้งชื่อ ได้ก่อนเริ่มเกม</span>' +
          '<button class="btn" id="designBtn">🎨 ออกแบบตัวละคร</button>' +
        '</div>' +
      '</div>' +
      '<h3>อาชีพลับ 8 แบบ (กอง 24 ใบ สุ่มแจกคนละ 2 ใบ — ซ้ำกันได้)</h3>' +
      '<div class="char-grid prof8">' + cards + '</div>' +
      '<h3>จำนวนผู้เล่น</h3>' +
      '<div class="count-grid">' + countBtns + '</div>' +
      '<h3>ความเข้มข้นของเหตุการณ์สุ่ม</h3>' +
      '<div class="count-grid intensity-grid">' + intBtns + '</div>' +
      '<div class="how">' +
        '<h4>วิธีเล่นสั้นๆ</h4>' +
        '<ol>' +
          '<li>ทุกคนเริ่มด้วย <b>฿10,000</b> + การ์ดอาชีพลับ 2 ใบ + ข่าววงใน 1 ใบ</li>' +
          '<li><b>เฟสโจมตี</b> (ไม่จับเวลา): ใช้ท่าอาชีพ — <b>อ้างมั่วได้</b> แต่โดนจับโกหกเสีย ฿800 + ทิ้งการ์ด · หรือข้ามรับเงินเดือน ฿300</li>' +
          '<li>โดนโจมตี: เลือก <b>ยอม / Challenge / Counter</b> ใน 10 วิ</li>' +
          '<li><b>เฟสแมพ 60 วิ</b>: เดินเข้าตึกซื้อขายหุ้น/คริปโต/ทอง/อสังหา · ธนาคารกู้-ฝาก · ตึกข่าวซื้อข่าววงใน (จริง 60 : ปลอม 40!)</li>' +
          '<li>ไม่มีสรุประหว่างเกม — ราคาขยับเบื้องหลังทุกรอบ ดูจากกราฟ/ฟีดเอง · จบ ' + SC.config.weeks + ' รอบ <b>มูลค่าสุทธิสูงสุดชนะ</b></li>' +
        '</ol>' +
      '</div>' +
      '<div class="phase-foot"><button class="btn btn-lg btn-primary" id="startBtn">🎲 แจกการ์ด + เริ่มเกม</button></div>' +
      '<p class="disclaimer">⚠️ ข้อมูลหุ้นทั้งหมดเป็นข้อมูลจำลองเพื่อการเรียนรู้ ไม่ใช่ราคาเรียลไทม์ และไม่ใช่คำแนะนำการลงทุน</p>' +
      '<button class="btn menu-back" id="backModeSel">‹ กลับ</button>' +
    '</div>';
  SC.ui.el('backModeSel').onclick = function () { SC.main.renderModeSelect(); };

  Array.prototype.forEach.call(SC.ui.screen().querySelectorAll('.count-btn'), function (btn) {
    btn.onclick = function () {
      SC.main._chosenBots = parseInt(btn.getAttribute('data-bots'), 10);
      SC.main.renderSetup();
    };
  });
  Array.prototype.forEach.call(SC.ui.screen().querySelectorAll('[data-int]'), function (btn) {
    btn.onclick = function () { SC.main._intensity = btn.getAttribute('data-int'); SC.main.renderSetup(); };
  });
  SC.ui.el('startBtn').onclick = function () {
    if (SC.eventsCfg) SC.eventsCfg.intensity = SC.main._intensity;
    SC.flow.startGame(SC.main._chosenBots);
  };
  SC.ui.el('designBtn').onclick = function () {
    SC.designer.render(function () { SC.main.renderSetup(); });
  };
  Array.prototype.forEach.call(SC.ui.screen().querySelectorAll('.ref-card'), function (img) {
    img.onclick = function () { SC.ui.zoomCard(img.getAttribute('src')); };
  });
  SC.sprite.load().then(function () {
    var cvs = SC.ui.el('setupPreview');
    if (cvs && cvs.isConnected && SC.sprite.ready) {
      SC.designer.preview(cvs, function () { return dz; });
    }
  });
};

// ---------- หน้าเฉลยการ์ดลับที่แจกได้ ----------
SC.main.renderReveal = function () {
  var s = SC.state;
  SC.main._bgStart(); // จอแจกการ์ดก็พื้นหลังแมปสด (user 2026-07-20 — ปกติวิ่งต่อจากเมนูอยู่แล้ว)
  var cards = s.player.cards; // [{prof, faceUp}] ปกติ 2 ใบ
  var newsCard = s.player.news[0];

  // กองไพ่หลังบิดเล็กน้อยไว้ตรงกลางเวที (แค่ตกแต่ง — ไม่ใช่ตัวการ์ดจริง)
  var deckHtml = '';
  for (var i = 0; i < 5; i++) {
    var rot = (i - 2) * 3;       // -6..6 องศา
    var oy = (i - 2) * 1.2;      // ออฟเซ็ต 2-3px รวม
    deckHtml += '<img class="deck-card" style="--r:' + rot + 'deg;--oy:' + oy + 'px" src="' + SC.cardBackArt + '" alt="">';
  }

  // การ์ด 2 ใบจริง — เริ่มซ่อนกลางเวที รอ _playDealAnim สั่งบิน+เปิดหน้า
  var flipHtml = cards.map(function (c, i) {
    var pr = SC.getProf(c.prof);
    return '' +
      '<div class="flip-card" id="flipCard' + i + '">' +
        '<div class="flip-inner">' +
          '<div class="flip-back"><img src="' + SC.cardBackArt + '" alt=""></div>' +
          '<div class="flip-front"><img src="' + SC.cardArt(c.prof) + '" alt="' + pr.name + '"></div>' +
        '</div>' +
      '</div>';
  }).join('');

  SC.ui.renderHUD();
  SC.ui.screen().innerHTML =
    '<div class="reveal">' +
      '<p class="muted">🎲 การ์ดอาชีพลับของคุณ (ห้ามให้ใครเห็น!)</p>' +
      '<div class="deal-stage" id="dealStage">' +
        '<div class="deck-pile" id="deckPile">' + deckHtml + '</div>' +
        flipHtml +
      '</div>' +
      (newsCard ?
        '<h3>📨 ข่าววงในแจกฟรี 1 ใบ</h3>' +
        '<div class="duel-card-news">' + newsCard.headline +
        '<br><small class="muted">มีผลรอบ ' + newsCard.dueRound + ' · จริงหรือปลอมไม่รู้ (fact-check ได้ที่ตึกข่าว ฿700)</small></div>' : '') +
      '<p class="muted">ผู้เล่นรวม ' + (s.numBots + 1) + ' คน · ลำดับเทิร์น: ' +
        s.order.map(function (a) { return a.isPlayer ? '<b>คุณ</b>' : a.name; }).join(' → ') + '</p>' +
      '<div class="phase-foot"><button class="btn btn-lg btn-go" id="goWeek">เริ่มรอบ 1 ▶</button></div>' +
    '</div>';
  SC.ui.el('goWeek').onclick = function () { SC.flow.startRound(); };

  SC.main._playDealAnim(cards);
};

// อนิเมชันแจกไพ่: สับ → บิน 2 ใบไปตำแหน่งจริง → พลิกเปิดหน้าทีละใบ → กองที่เหลือจางหาย
SC.main._playDealAnim = function (cards) {
  var stage = SC.ui.el('dealStage');
  if (!stage) return;
  var deck = SC.ui.el('deckPile');
  var flipEls = cards.map(function (c, i) { return SC.ui.el('flipCard' + i); });
  var timers = [];
  var done = false;

  var bindClicks = function () {
    flipEls.forEach(function (el, i) {
      if (!el) return;
      el.onclick = function () { SC.ui.zoomCard(SC.cardArt(cards[i].prof)); };
    });
  };

  // แสดงผลจบทันที (ข้ามอนิเมชัน — ลดการเคลื่อนไหว/คลิกข้าม)
  var finish = function () {
    if (done) return;
    done = true;
    timers.forEach(function (t) { clearTimeout(t); });
    stage.removeEventListener('click', finish);
    if (deck && deck.parentNode) deck.parentNode.removeChild(deck);
    flipEls.forEach(function (el, i) {
      if (!el) return;
      el.classList.add('slot-' + i);
      el.classList.add('dealt');
      el.classList.add('open');
      el.classList.add('clickable');
    });
    bindClicks();
  };
  stage.addEventListener('click', finish);

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { finish(); return; }

  var after = function (ms, fn) { timers.push(setTimeout(function () { if (!done) fn(); }, ms)); };

  if (deck) deck.classList.add('shuffling');
  after(900, function () {
    if (deck) deck.classList.remove('shuffling');
    // บินไปตำแหน่งจริง — ใบสองตามห่าง 220ms
    flipEls.forEach(function (el, i) {
      after(i * 220, function () {
        if (!el) return;
        el.classList.add('slot-' + i);
        el.classList.add('dealt');
      });
    });
    // รอบินถึงแล้วค่อยพลิกเปิดหน้าทีละใบ
    after(flipEls.length * 220 + 550, function () {
      flipEls.forEach(function (el, i) {
        after(i * 200, function () { if (el) el.classList.add('open'); });
      });
      after(flipEls.length * 200 + 300, function () {
        if (deck) deck.classList.add('gone');
        after(400, function () {
          if (deck && deck.parentNode) deck.parentNode.removeChild(deck);
          flipEls.forEach(function (el) { if (el) el.classList.add('clickable'); });
          bindClicks();
          done = true;
          stage.removeEventListener('click', finish);
        });
      });
    });
  });
};

// ---------- flow control ----------
SC.flow = {
  startGame: function (numBots) {
    // พื้นหลังแมปสดวิ่งต่อถึงจอแจกการ์ด+เฟสโจมตี (user 2026-07-20) — _mapPhase/botTurn จะ _bgStop เอง
    SC.newGame(numBots);
    SC.main.renderReveal();
  },
  startRound: function () {
    SC.startRound(); // ข่าวสาธารณะต้นรอบ
    if (SC.events) SC.events.onRoundStart(SC.state); // เหตุการณ์สุ่มต้นรอบ (ก่อนเทิร์นแรก)
    this._queue = SC.state.order.slice(); // ลำดับคงที่ทั้งเกม
    this._turnIdx = 0;
    this._runTurn();
  },
  _runTurn: function () {
    var self = this;
    if (this._turnIdx >= this._queue.length) { this.endRound(); return; }
    var actor = this._queue[this._turnIdx];
    var next = function () { self._turnIdx++; self._runTurn(); };
    if (actor.isPlayer) SC.turn.playerTurn(next);
    else SC.turn.botTurn(actor, next);
  },
  // จบรอบ: ประมวลผลเบื้องหลังทันที ไม่มีหน้าจอรอ — เข้ารอบใหม่ต่อเนื่อง
  endRound: function () {
    var self = this;
    SC.resolve.endRound();
    var go = function () {
      if (SC.state.week >= SC.config.weeks) { SC.main.renderEnd(); return; }
      SC.state.week += 1;
      self.startRound();
    };
    // ภัยพิบัติที่ถูกเลื่อนข้ามรอบมาแล้ว → ยิงทิ้งท้ายรอบ (ไม่มีคัตซีนบนแมป เพราะไม่มีจอแมปตอนนี้)
    //   กันเคสหลบด้วยการจบเทิร์น/ข้ามดูบอทเร็วทุกครั้ง (user 2026-07-20)
    if (SC.events && SC.events.overdueDisaster()) SC.events.fireDisaster(go);
    else go();
  },
  restart: function () {
    SC.main.renderSetup();
  },
};

// ---------- leaderboard (ใช้ในหน้าต่างลีดเดอร์บอร์ด + จอจบ) ----------
SC.main._leaderboard = function () {
  var s = SC.state;
  var all = [s.player].concat(s.bots);
  var rows = all.map(function (a) {
    return {
      name: a.isPlayer ? '🫵 ' + a.name + ' (คุณ)' : a.emoji + ' ' + a.name,
      isPlayer: !!a.isPlayer,
      actor: a,
      value: SC.portfolioValue(a, s.prices),
      pnl: SC.portfolioValue(a, s.prices) - s.startValue,
    };
  });
  rows.sort(function (a, b) { return b.value - a.value; });
  return rows;
};

SC.main._leaderboardHtml = function () {
  var rows = SC.main._leaderboard();
  return '<table class="leaderboard">' +
    '<tr><th>อันดับ</th><th>ผู้เล่น</th><th>มูลค่าสุทธิ</th><th>กำไร/ขาดทุน</th></tr>' +
    rows.map(function (r, i) {
      var medal = ['🥇', '🥈', '🥉'][i] || (i + 1);
      var cls = r.pnl >= 0 ? 'up' : 'down';
      return '<tr class="' + (r.isPlayer ? 'me' : '') + '">' +
        '<td>' + medal + '</td>' +
        '<td>' + r.name + '</td>' +
        '<td>' + SC.ui.money(r.value) + '</td>' +
        '<td class="' + cls + '">' + (r.pnl >= 0 ? '+' : '') + SC.ui.money(r.pnl) + '</td>' +
        '</tr>';
    }).join('') +
    '</table>';
};

// ---------- จอจบเกม: อันดับ + เฉลยอาชีพทุกคน + ไทม์ไลน์การโกหก/challenge ----------
SC.main.renderEnd = function () {
  var s = SC.state;
  var rows = SC.main._leaderboard();
  var won = rows[0].isPlayer;

  // เฉลยการ์ดของทุกคน (ที่เหลือในมือ + ที่ทิ้งไป) — thumbnail อาร์ตการ์ดหน้าข้อความ คลิกซูมได้
  var revealHtml = [s.player].concat(s.bots).map(function (a) {
    var thumbs = a.cards.map(function (c) {
      return '<img class="end-card-thumb" src="' + SC.cardArt(c.prof) + '" alt="' + SC.getProf(c.prof).name + '" data-zoom="' + c.prof + '">';
    }).join('');
    thumbs += a.lostCards.map(function (pf) {
      return '<img class="end-card-thumb lost" src="' + SC.cardArt(pf) + '" alt="' + SC.getProf(pf).name + '" data-zoom="' + pf + '">';
    }).join('');
    var hand = a.cards.map(function (c) {
      var p = SC.getProf(c.prof);
      return p.emoji + ' ' + p.name + (c.faceUp ? ' (ถูกเปิด)' : '');
    }).join(' · ') || '—';
    var lost = a.lostCards.map(function (pf) { return '🗑️ ' + SC.getProf(pf).name; }).join(' · ');
    var persona = a.brain ? ' <small class="muted">(นิสัย: ' + a.brain.name + ')</small>' : '';
    return '<div class="end-reveal-row"><b>' + (a.isPlayer ? '🫵 คุณ' : a.emoji + ' ' + a.name) + '</b>' + persona +
      '<span class="end-card-thumbs">' + thumbs + '</span>' +
      '<span>' + hand + (lost ? ' · ' + lost : '') + '</span></div>';
  }).join('');

  var tl = s.timeline.length ?
    s.timeline.map(function (t) {
      return '<div class="tl-row ' + t.kind + '"><span class="tl-round">รอบ ' + t.round + '</span>' + t.text + '</div>';
    }).join('') : '<p class="muted">ไม่มีการโจมตี/challenge เลยทั้งเกม</p>';

  SC.ui.screen().innerHTML =
    '<div class="endscreen">' +
      '<h2>' + (won ? '🏆 คุณชนะ!' : '🏁 จบเกม') + '</h2>' +
      '<p class="muted">' + (won ? 'มูลค่าสุทธิของคุณสูงสุดในเมือง!' : 'รอบหน้าเอาใหม่ — จับจังหวะข่าวและบลัฟให้เนียนกว่านี้') + '</p>' +
      SC.main._leaderboardHtml() +
      '<h3>🃏 เฉลยอาชีพทุกคน</h3>' +
      '<div class="end-reveal">' + revealHtml + '</div>' +
      '<h3>📜 ไทม์ไลน์การโกหก/Challenge ทั้งเกม</h3>' +
      '<div class="end-timeline">' + tl + '</div>' +
      '<div class="phase-foot"><button class="btn btn-lg btn-primary" id="againBtn">🔄 เล่นใหม่</button></div>' +
    '</div>';
  SC.ui.el('againBtn').onclick = function () { SC.flow.restart(); };
  Array.prototype.forEach.call(SC.ui.screen().querySelectorAll('.end-card-thumb'), function (img) {
    img.onclick = function () { SC.ui.zoomCard(img.getAttribute('src')); };
  });
};

// เริ่ม!
document.addEventListener('DOMContentLoaded', SC.main.init);
