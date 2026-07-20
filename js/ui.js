// ============================================================
// ui.js — helper UI ที่ใช้ร่วมกันทุกเฟส (HUD, ฟอร์แมตเงิน, toast)
// ============================================================
SC.ui = {};

SC.ui.el = function (id) { return document.getElementById(id); };
SC.ui.screen = function () { return document.getElementById('screen'); };

// ฟอร์แมตเงิน: ฿1,234.50
SC.ui.money = function (n) {
  return '฿' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
SC.ui.price = function (n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// วาด HUD บนสุด (ชื่อ, เงินสด, ฝาก/หนี้, มูลค่าสุทธิ, รอบ)
SC.ui.renderHUD = function () {
  var s = SC.state;
  if (!s) { SC.ui.el('hud').innerHTML = ''; return; }
  var p = s.player;
  var pv = SC.portfolioValue(p, s.prices);
  var pnl = pv - s.startValue;
  var pnlClass = pnl >= 0 ? 'up' : 'down';

  SC.ui.el('hud').innerHTML =
    '<div class="hud-left">' +
      '<span class="hud-avatar">' + p.emoji + '</span>' +
      '<span class="hud-name">' + p.name + '</span>' +
    '</div>' +
    '<div class="hud-stats">' +
      '<div class="hud-stat"><label>รอบ</label><b>' + s.week + '/' + SC.config.weeks + '</b></div>' +
      '<div class="hud-stat"><label>เงินสด</label><b>' + SC.ui.money(p.cash) + '</b></div>' +
      '<div class="hud-stat"><label>ฝาก / หนี้</label><b>' + SC.ui.money(p.deposit || 0) +
        ' / <span class="' + ((p.debt || 0) > 0 ? 'down' : '') + '">' + SC.ui.money(p.debt || 0) + '</span></b></div>' +
      '<div class="hud-stat"><label>มูลค่าสุทธิ</label><b>' + SC.ui.money(pv) + '</b></div>' +
      '<div class="hud-stat"><label>กำไร/ขาดทุน</label><b class="' + pnlClass + '">' +
        (pnl >= 0 ? '+' : '') + SC.ui.money(pnl) + '</b></div>' +
    '</div>';
};

// สลับโหมดเต็มจอบน element ที่ให้มา (แมป) — รองรับ webkit
SC.ui.toggleFullscreen = function (el) {
  el = el || document.documentElement;
  var d = document;
  var fsEl = d.fullscreenElement || d.webkitFullscreenElement;
  if (!fsEl) {
    var req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (req) req.call(el);
  } else {
    var exit = d.exitFullscreen || d.webkitExitFullscreen || d.msExitFullscreen;
    if (exit) exit.call(d);
  }
};

// lightbox ดูการ์ดเต็มจอ — คลิก/Esc ปิด · เรียกซ้ำระหว่างเปิด = เปลี่ยนรูปแทนเปิดซ้อน
SC.ui._cardZoomKey = function (e) { if (e.key === 'Escape') SC.ui._closeCardZoom(); };
SC.ui._closeCardZoom = function () {
  var z = SC.ui.el('cardZoom');
  if (z) z.remove();
  document.removeEventListener('keydown', SC.ui._cardZoomKey);
};
SC.ui.zoomCard = function (src) {
  var z = SC.ui.el('cardZoom');
  if (z) { // เปิดอยู่แล้ว — เปลี่ยนรูปแทนเปิดซ้อน
    var img = z.querySelector('img');
    if (img) img.src = src;
    return;
  }
  z = document.createElement('div');
  z.className = 'card-zoom';
  z.id = 'cardZoom';
  z.innerHTML = '<img src="' + src + '" alt="การ์ดอาชีพ">';
  z.onclick = function () { SC.ui._closeCardZoom(); };
  document.body.appendChild(z);
  document.addEventListener('keydown', SC.ui._cardZoomKey);
};

// toast แจ้งเตือนสั้นๆ
SC.ui.toast = function (msg, type) {
  var t = document.createElement('div');
  t.className = 'toast ' + (type || '');
  t.textContent = msg;
  SC.ui.el('toast').appendChild(t);
  setTimeout(function () { t.classList.add('show'); }, 10);
  setTimeout(function () {
    t.classList.remove('show');
    setTimeout(function () { t.remove(); }, 300);
  }, 1900);
};

