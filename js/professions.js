// ============================================================
// professions.js — ระบบการ์ดอาชีพลับ 8 อาชีพ (GAME_SPEC ข้อ 2-3)
//   กอง 24 ใบ (อาชีพละ 3) แจกคนละ 2 ใบลับ · อ้างมั่วได้ = แกนบลัฟของเกม
//   วงจรนักล่า: สื่อ → วาฬ → ชอร์ต → เสือ → แบงค์ → มาเฟีย → ก.ล.ต. → นักสืบ → กลับสื่อ
//   (ลูกศรชี้จาก "นักล่า" ไปหา "ผู้ที่เคาน์เตอร์กลับได้")
// ============================================================

// เรียงตามวงจรนักล่า — counter ของท่าอาชีพ i คืออาชีพ i+1 (วนกลับหัวแถว)
SC.professions = [
  { id: 'media',  name: 'เจ้าพ่อสื่อ',   en: 'Media Tycoon',        emoji: '📡',
    attack: 'ยัดข่าวปลอม', attackDesc: 'ดูการ์ดข่าวสุ่ม 1 ใบของเป้า แล้วเลือกสลับกับกองข่าวหรือวางคืน — เป้าไม่รู้ว่าโดนใบไหน (เป้าไม่มีข่าว = รู้ว่าไม่มี + จั่วข่าวเองฟรี 1 ใบ)' },
  { id: 'whale',  name: 'วาฬคริปโต',    en: 'Crypto Whale',        emoji: '🐋',
    attack: 'เทใส่',       attackDesc: 'คริปโตในพอร์ตเป้าหาย 20% — ครึ่งหนึ่งของที่หาย (10%) เข้ากระเป๋าเราเป็นเงินสด (เป้าต้องถือคริปโต)' },
  { id: 'short',  name: 'สายชอร์ต',     en: 'Short Seller',        emoji: '📉',
    attack: 'ชอร์ตพอร์ต',  attackDesc: 'เป้าจ่ายเรา 10% ของสินทรัพย์ประเภทที่ถือมูลค่าสูงสุด (เพดาน ฿1,500 · นับเงินฝากด้วย · เงินสดไม่พอ = บังคับขาย −10%)' },
  { id: 'tiger',  name: 'เสือนอนกิน',   en: 'Property Mogul',      emoji: '🐅',
    attack: 'ฮุบที่ดิน',    attackDesc: 'บังคับซื้ออสังหาของเป้า 1 หน่วยที่ราคาตลาด −15% (เป้าปฏิเสธได้โดยจ่ายค่ายอมความ ฿500 ให้เรา)' },
  { id: 'banker', name: 'นายแบงค์',     en: 'Banker',              emoji: '🏦',
    attack: 'บีบหนี้',      attackDesc: 'เป้าต้องชำระหนี้คืนระบบทันที 50% ของยอดคงค้าง (เงินสดไม่พอ = เป้าเลือกขายสินทรัพย์ −10% จนครบ)' },
  { id: 'mafia',  name: 'มาเฟียเงินกู้', en: 'Loan Shark',          emoji: '🕶️',
    attack: 'ข่มขู่',       attackDesc: 'เป้าเลือก: จ่ายเรา ฿1,000 หรือเปิดการ์ดอาชีพ 1 ใบให้ทุกคนเห็นถาวร (เงินไม่ถึงพัน = บังคับเปิดการ์ด)' },
  { id: 'sec',    name: 'ก.ล.ต.',       en: 'Regulator',           emoji: '⚖️',
    attack: 'อายัดบัญชี',   attackDesc: 'เทิร์นถัดไปของเป้า ห้ามทุกธุรกรรม+ห้ามโจมตี เดินแมพได้อย่างเดียว (ยัง challenge/counter ได้)' },
  { id: 'hacker', name: 'นักสืบไซเบอร์', en: 'Cyber Investigator',  emoji: '🕵️',
    attack: 'เจาะระบบ',    attackDesc: 'เลือกโหมด: ขโมยเงินสด ฿800 หรือแอบดูการ์ดอาชีพเป้า 1 ใบ + สรุปพอร์ตเต็มของเป้า (เห็นคนเดียว)' },
];

SC.getProf = function (id) {
  return SC.professions.find(function (p) { return p.id === id; });
};

// อาชีพที่ "เคาน์เตอร์ท่าของ attackerProf ได้" = ตัวถัดไปในวงจร
SC.counterOf = function (attackerProf) {
  var i = SC.professions.findIndex(function (p) { return p.id === attackerProf; });
  return SC.professions[(i + 1) % SC.professions.length].id;
};

// ============================================================
// กองการ์ด + มือผู้เล่น
//   actor.cards     = [{prof, faceUp}] — ใบที่ยังใช้งานได้ (faceUp = โดนข่มขู่เปิดหน้า ยังใช้ได้แค่ไม่ลับ)
//   actor.lostCards = [profId]        — ใบที่เปิดทิ้งถาวร (แพ้ challenge) เห็นสาธารณะ
// ============================================================
SC.deck = {
  build: function () {
    var d = [];
    SC.professions.forEach(function (p) {
      for (var i = 0; i < SC.config.cardsPerProfession; i++) d.push(p.id);
    });
    return SC._shuffle(d);
  },

  // จั่วจากกอง (กองหมด = สับใบทิ้งสาธารณะกลับไม่ได้ตามกติกา — คืน null)
  draw: function () {
    var s = SC.state;
    return s.profDeck.length ? s.profDeck.pop() : null;
  },

  // สับใบกลับกอง (ใช้ตอนพิสูจน์ challenge สำเร็จ — ตัวตนกลับมาลับ)
  shuffleBack: function (profId) {
    var s = SC.state;
    s.profDeck.push(profId);
    SC._shuffle(s.profDeck);
  },

  // พิสูจน์สำเร็จ: สับใบที่เปิดกลับกอง แล้วจั่วใบใหม่ (ใบใหม่เป็นความลับเสมอ)
  proveAndRedraw: function (actor, profId) {
    var idx = actor.cards.findIndex(function (c) { return c.prof === profId; });
    if (idx < 0) return;
    actor.cards.splice(idx, 1);
    this.shuffleBack(profId);
    var nw = this.draw();
    if (nw) actor.cards.push({ prof: nw, faceUp: false });
  },

  // เปิดทิ้งถาวร 1 ใบ (แพ้ challenge) — idx ในมือ
  discard: function (actor, idx) {
    var c = actor.cards[idx];
    if (!c) return null;
    actor.cards.splice(idx, 1);
    actor.lostCards.push(c.prof);
    return c.prof;
  },

  // เปิดหน้าการ์ด (ข่มขู่มาเฟีย) — ไม่ทิ้ง ยังใช้ได้ แค่ทุกคนเห็น
  faceUp: function (actor, idx) {
    var c = actor.cards[idx];
    if (c) c.faceUp = true;
    return c ? c.prof : null;
  },
};

// actor ถืออาชีพนี้จริงไหม (ใบ faceUp ยังนับ — ใช้งานได้ปกติ)
SC.hasProf = function (actor, profId) {
  return actor.cards.some(function (c) { return c.prof === profId; });
};

// ใช้ท่าโจมตี/เคาน์เตอร์ได้ไหม (เปิดทิ้งครบ 2 ใบ = โจมตีไม่ได้ถาวร แต่ยัง challenge/เดิน/ลงทุนได้)
SC.canUseMoves = function (actor) {
  return actor.cards.length > 0;
};

// นับการ์ดอาชีพ X ที่ "เปิดเผยสาธารณะแล้ว" ทั้งเมือง (ทิ้งถาวร + เปิดหน้า)
//   — ข้อมูลสาธารณะ ใช้ได้ทั้งผู้เล่น (โชว์ UI) และบอท (ระบบความจำ 7.3)
SC.publicProfCount = function (profId) {
  var s = SC.state, n = 0;
  [s.player].concat(s.bots).forEach(function (a) {
    a.lostCards.forEach(function (p) { if (p === profId) n++; });
    a.cards.forEach(function (c) { if (c.faceUp && c.prof === profId) n++; });
  });
  return n;
};

// ============================================================
// อาร์ตการ์ด (assets/card/cut/) — ใช้แทนการ์ดข้อความ HTML ทุกจุด
// ============================================================
SC.cardArt = function (profId) { return 'assets/card/cut/' + profId + '.png'; };
SC.cardBackArt = 'assets/card/cut/back.png';
