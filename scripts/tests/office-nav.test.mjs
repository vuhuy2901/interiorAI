// Test logic thuần FEAT-2026-158/159: trích các khối CORE từ ai-office-standalone/index.html và chạy bằng Node.
// Chạy: node scripts/tests/office-nav.test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '../../ai-office-standalone/index.html'), 'utf8');
function block(n) {
  const a = html.indexOf(`/* ===== FEAT-2026-${n} CORE BEGIN`);
  const e = `/* ===== FEAT-2026-${n} CORE END ===== */`;
  const b = html.indexOf(e);
  if (a < 0 || b < 0) return '';
  return html.slice(a, b + e.length);
}
const code = block(158) + '\n' + block(159) + '\nreturn OfficeNav;';
const Nav = new Function(code)();

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('PASS', name); }
  catch (e) { fail++; console.log('FAIL', name, '-', e.message); }
};
const eq = (c, msg) => { if (!c) throw new Error(msg || 'assert'); };

/* ---------- helpers ---------- */
const CS = 0.5, W = 60, H = 64, cfg = { CS, W, H };
function mk() {
  const st = { nodes: new Map(), walls: new Map(), openings: [], _n: 0, _w: 0, _o: 0 };
  st.node = (x, z) => {
    for (const n of st.nodes.values()) if (Math.hypot(n.x - x, n.z - z) < 0.15) return n.id;
    const id = 'n' + (++st._n); st.nodes.set(id, { id, x, z }); return id;
  };
  st.wall = (x0, z0, x1, z1) => {
    const id = 'w' + (++st._w);
    st.walls.set(id, { id, startId: st.node(x0, z0), endId: st.node(x1, z1), thickness: 0.15, height: 2.6 });
    return id;
  };
  st.door = (wallId, offset, type = 'door', w) => {
    const v = Nav.validateOpening(st, wallId, offset, type, w);
    if (!v.ok) throw new Error('door rejected: ' + v.reason);
    const id = 'o' + (++st._o);
    st.openings.push({ id, wallId, offset: v.offset, type, width: v.width, open: true });
    return id;
  };
  return st;
}
/* 3 phòng nối tiếp: x 5..9, 9..13, 13..17; z 5..9. Tường trên/dưới KHÔNG tách tại điểm chữ T (kiểm tra planarize). */
function threeRooms() {
  const st = mk();
  st.top = st.wall(5, 5, 17, 5); st.right = st.wall(17, 5, 17, 9);
  st.bottom = st.wall(17, 9, 5, 9); st.left = st.wall(5, 9, 5, 5);
  st.div1 = st.wall(9, 5, 9, 9); st.div2 = st.wall(13, 5, 13, 9);
  return st;
}
const side = (st, wallId, p) => { const g = Nav.wallGeom(st, st.walls.get(wallId)); return (p.x - g.n0.x) * g.nx + (p.z - g.n0.z) * g.nz; };
const grid = st => Nav.buildDoorGrid(st, cfg);
const doorOf = (m, id) => m.doors.find(d => d.id === id);

/* ---------- FEAT-158 ---------- */
t('158 AC-01 front/back hai bên tường, sai số < 0.05 m (3 vị trí)', () => {
  const st = threeRooms();
  const ids = [st.door(st.div1, 2.0), st.door(st.div2, 1.37), st.door(st.top, 3.13)];
  const m = grid(st);
  for (const id of ids) {
    const op = st.openings.find(o => o.id === id), d = doorOf(m, id);
    const sf = side(st, op.wallId, d.frontPt), sb = side(st, op.wallId, d.backPt);
    eq(Math.abs(Math.abs(sf) - 0.6) < 0.05 && Math.abs(Math.abs(sb) - 0.6) < 0.05, 'khoảng cách ' + sf + ' ' + sb);
    eq(sf * sb < 0, 'cùng một phía');
    eq(Math.abs(Math.hypot(d.frontPt.x - d.backPt.x, d.frontPt.z - d.backPt.z) - 1.2) < 0.05, 'front-back != 1.2');
    eq(d.cells.length >= 2 && d.open === true, 'cells/open');
  }
});

t('158 AC-02 A* front->back thành công khi mở, thất bại khi đóng', () => {
  for (const [which, off] of [['div1', 2.0], ['div2', 1.37], ['div1', 3.13]]) {
    const st = threeRooms(); const id = st.door(st[which], off);
    let m = grid(st), d = doorOf(m, id);
    const ok = Nav.astarPoints(m.blocked, cfg, d.frontPt, d.backPt);
    eq(ok && ok.length >= 2, 'mở phải đi được ' + which + off);
    st.openings[0].open = false; m = grid(st); d = doorOf(m, id);
    eq(Nav.astarPoints(m.blocked, cfg, d.frontPt, d.backPt) === null, 'đóng phải thất bại ' + which + off);
  }
});

t('158 AC-03 từ chối: vượt mép / chồng cửa / tường ngắn; hít vị trí lệch nhỏ', () => {
  const st = threeRooms();
  const w = st.div1; // dài 4 m
  eq(!Nav.validateOpening(st, w, -2, 'door').ok, 'vượt mép trái');
  eq(!Nav.validateOpening(st, w, 4.8, 'door').ok, 'vượt mép phải');
  const snap = Nav.validateOpening(st, w, 0.3, 'door'); // vị trí hợp lệ gần nhất là 0.55
  eq(snap.ok && snap.snapped && Math.abs(snap.offset - 0.55) < 1e-6, 'hít về mép hợp lệ ' + JSON.stringify(snap));
  st.door(w, 2.0);
  const rej = Nav.validateOpening(st, w, 2.0, 'door');
  eq(rej.ok === false && /Chồng/.test(rej.reason), 'phải từ chối chồng: ' + JSON.stringify(rej));
  const near = Nav.validateOpening(st, w, 2.9, 'door'); // chồng nhẹ -> hít sang phải cửa cũ
  eq(near.ok && near.offset >= 2.0 + 0.9 + 0.05 - 1e-6, 'hít khỏi cửa cũ ' + JSON.stringify(near));
  const s2 = mk(); const sw = s2.wall(0, 0, 1.0, 0);
  const sh = Nav.validateOpening(s2, sw, 0.5, 'door');
  eq(!sh.ok && /ngắn/.test(sh.reason), 'tường ngắn: ' + JSON.stringify(sh));
});

t('158 AC-04 cửa sổ chặn lưới', () => {
  const st = threeRooms(); const id = st.door(st.div1, 2.0, 'window');
  const m = grid(st), d = doorOf(m, id);
  eq(Nav.astarPoints(m.blocked, cfg, d.frontPt, d.backPt) === null, 'cửa sổ phải chặn');
});

/* ---------- FEAT-159 ---------- */
if (block(159)) {
  const mkNav = st => Nav.buildNav(st, cfg);
  const names = nav => nav.rooms.forEach((r, i) => { r.name = 'Phòng ' + (i + 1); });
  const roomAt = (nav, x, z) => nav.roomById[Nav.pointInRoom(nav, x, z)];

  t('159 phát hiện 3 phòng + phòng ngoài (tường chữ T chưa tách)', () => {
    const nav = mkNav(threeRooms());
    eq(nav.rooms.length === 3, 'số phòng ' + nav.rooms.length);
    eq(nav.rooms.every(r => Math.abs(r.area - 16) < 0.2), 'diện tích ' + nav.rooms.map(r => r.area.toFixed(1)));
    eq(Nav.pointInRoom(nav, 7, 7) !== Nav.OUT_ID && Nav.pointInRoom(nav, 0, 0) === Nav.OUT_ID, 'pointInRoom');
  });

  t('159 pointInRoom ưu tiên phòng nhỏ nhất khi lồng nhau', () => {
    const st = mk();
    st.wall(0, 0, 10, 0); st.wall(10, 0, 10, 10); st.wall(10, 10, 0, 10); st.wall(0, 10, 0, 0);
    st.wall(3, 3, 6, 3); st.wall(6, 3, 6, 6); st.wall(6, 6, 3, 6); st.wall(3, 6, 3, 3);
    const nav = mkNav(st);
    const inner = roomAt(nav, 4.5, 4.5), outer = roomAt(nav, 1, 1);
    eq(inner && outer && inner.area < outer.area && Math.abs(inner.area - 9) < 0.2, 'nhỏ nhất');
  });

  t('159 AC 3 phòng nối tiếp: đi 1->3 qua đúng 2 cửa', () => {
    const st = threeRooms(); st.door(st.div1, 2.0); st.door(st.div2, 2.0);
    const nav = mkNav(st); names(nav);
    const r = Nav.planRoute(nav, { x: 7, z: 7 }, { x: 15, z: 7 });
    eq(r.ok, 'route fail: ' + r.reason);
    eq(r.doors.length === 2, 'số cửa ' + r.doors.length);
    eq(nav.noDoor.length === 0, 'không còn phòng thiếu cửa');
    for (let i = 0; i + 1 < r.waypoints.length; i++) {
      const a = r.waypoints[i], b = r.waypoints[i + 1];
      if (a.door && b.door && a.door === b.door) continue; // đoạn xuyên khung cửa
      eq(Nav.lineOfSight(nav.blocked, cfg, a, b), 'đoạn ' + i + ' cắt tường');
    }
  });

  t('159 cửa đóng -> route lỗi có lý do', () => {
    const st = threeRooms(); st.door(st.div1, 2.0); const d2 = st.door(st.div2, 2.0);
    st.openings.find(o => o.id === d2).open = false;
    const nav = mkNav(st); names(nav);
    const r = Nav.planRoute(nav, { x: 7, z: 7 }, { x: 15, z: 7 });
    eq(!r.ok && /đóng/.test(r.reason) && r.reason.includes(d2), 'lý do: ' + r.reason);
  });

  t('159 xoá cửa duy nhất -> phòng "chưa có cửa" + route lỗi rõ', () => {
    const st = threeRooms(); st.door(st.div1, 2.0); const d2 = st.door(st.div2, 2.0);
    st.openings = st.openings.filter(o => o.id !== d2);
    const nav = mkNav(st); names(nav);
    const r3 = roomAt(nav, 15, 7);
    eq(nav.noDoor.includes(r3.id), 'phòng 3 phải bị đánh dấu');
    const r = Nav.planRoute(nav, { x: 7, z: 7 }, { x: 15, z: 7 });
    eq(!r.ok && /chưa có cửa/.test(r.reason) && r.reason.includes(r3.name), 'lý do: ' + r.reason);
    eq(!Nav.isRoomReachable(nav, r3.id), 'không được tới');
  });

  t('159 "Thêm cửa tự động" làm phòng tới được lại', () => {
    const st = threeRooms(); st.door(st.div1, 2.0);
    let nav = mkNav(st); names(nav);
    const r3 = roomAt(nav, 15, 7);
    eq(nav.noDoor.includes(r3.id), 'tiền điều kiện');
    const sug = Nav.suggestDoor(st, nav, r3.id);
    eq(sug.ok, 'suggest: ' + sug.reason);
    st.door(sug.wallId, sug.offset, 'door');
    nav = mkNav(st); names(nav);
    eq(nav.noDoor.length === 0, 'vẫn còn phòng thiếu cửa');
    eq(Nav.isRoomReachable(nav, roomAt(nav, 15, 7).id), 'reachable');
    const r = Nav.planRoute(nav, { x: 7, z: 7 }, { x: 15, z: 7 });
    eq(r.ok, 'route sau khi thêm: ' + r.reason);
  });

  t('159 mặt bằng không cửa: auto-add lần lượt -> mọi phòng có cửa', () => {
    const st = threeRooms();
    for (let k = 0; k < 6; k++) {
      const nav = mkNav(st);
      if (!nav.noDoor.length) break;
      const s = Nav.suggestDoor(st, nav, nav.noDoor[0]); eq(s.ok, s.reason);
      st.door(s.wallId, s.offset, 'door');
    }
    eq(mkNav(st).noDoor.length === 0, 'còn phòng thiếu cửa');
  });

  t('159 làm mượt line-of-sight không cắt ô chặn', () => {
    const st = threeRooms(); st.door(st.div1, 2.0);
    const nav = mkNav(st);
    const raw = Nav.astarPoints(nav.blocked, cfg, { x: 6, z: 6 }, { x: 8, z: 8 });
    const sm = Nav.smoothPath(nav.blocked, cfg, raw);
    eq(sm.length === 2, 'mượt trong phòng: ' + sm.length);
    eq(!Nav.lineOfSight(nav.blocked, cfg, { x: 7, z: 5.8 }, { x: 11, z: 5.8 }), 'xuyên tường phải bị chặn');
  });
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
