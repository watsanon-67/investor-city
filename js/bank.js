// ============================================================
// bank.js — ธนาคาร (ตึก fin): กู้ / ชำระหนี้ / ฝาก / ถอน
//   จำเป็นต่อสเปกใหม่: ท่า "บีบหนี้" ของนายแบงค์ต้องมีหนี้ ·
//   "ชอร์ตพอร์ต" นับเงินฝากเป็นสินทรัพย์ · เครดิตพัง = กู้ไม่ได้+ไม่ได้ดอกฝาก
//   ทุก actor (ผู้เล่น+บอท) มีฟิลด์ deposit / debt — เงินไหลเข้า/ออก "ระบบ" (ไม่มีกองกลาง)
// ============================================================
SC.bank = {
  deposit: function (actor, amt) {
    if (!(amt > 0)) return { ok: false, msg: 'จำนวนไม่ถูกต้อง' };
    if (amt > actor.cash) return { ok: false, msg: 'เงินสดไม่พอ' };
    actor.cash -= amt;
    actor.deposit += amt;
    return { ok: true };
  },

  withdraw: function (actor, amt) {
    if (!(amt > 0)) return { ok: false, msg: 'จำนวนไม่ถูกต้อง' };
    if (amt > actor.deposit + 1e-9) return { ok: false, msg: 'เงินฝากไม่พอ' };
    actor.deposit -= amt;
    actor.cash += amt;
    return { ok: true };
  },

  borrow: function (actor, amt) {
    var cap = SC.config.bank.loanCap;
    if (actor.brokenCredit > 0) return { ok: false, msg: 'เครดิตพัง — กู้ไม่ได้อีก ' + actor.brokenCredit + ' รอบ' };
    if (!(amt > 0)) return { ok: false, msg: 'จำนวนไม่ถูกต้อง' };
    if (actor.debt + amt > cap + 1e-9) return { ok: false, msg: 'เกินเพดานหนี้ ' + SC.ui.money(cap) };
    actor.debt += amt;
    actor.cash += amt;
    return { ok: true };
  },

  repay: function (actor, amt) {
    if (!(amt > 0)) return { ok: false, msg: 'จำนวนไม่ถูกต้อง' };
    amt = Math.min(amt, actor.debt);
    if (amt > actor.cash + 1e-9) return { ok: false, msg: 'เงินสดไม่พอ' };
    actor.cash -= amt;
    actor.debt -= amt;
    return { ok: true, paid: amt };
  },

  // อัตราดอกเบี้ยปัจจุบัน (เหตุการณ์ rateHike/rateCut เปลี่ยนชั่วคราวผ่าน s.events.rates)
  rates: function () {
    var b = SC.config.bank;
    if (SC.events && SC.events.rates) { var r = SC.events.rates(); return { depositRate: r.dep, loanRate: r.loan }; }
    return { depositRate: b.depositRate, loanRate: b.loanRate };
  },

  // ท้ายรอบ: ดอกเบี้ยฝากเข้า (เครดิตพัง = อด) + ดอกหนี้ทบต้น — เรียกจาก resolve.endRound
  endRound: function (actor) {
    var r = this.rates();
    if (actor.deposit > 0 && !(actor.brokenCredit > 0)) actor.deposit += actor.deposit * r.depositRate;
    if (actor.debt > 0) actor.debt += actor.debt * r.loanRate;
  },
};
