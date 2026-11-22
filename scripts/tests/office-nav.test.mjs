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
const code = block(158) + '\n' + block(159) + '\n' + block(160) + '\nreturn OfficeNav;';
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

/* ---------- FEAT-160 ---------- */
{
  const D = Nav.desk;
  const mk3 = () => {
    const st = threeRooms();
    st.door(st.div1, 2.0); st.door(st.div2, 2.0); st.door(st.left, 2.0);
    const nav = Nav.buildNav(st, cfg);
    return { st, nav };
  };
  const place = (st, nav, desks, x, z, rot, agentId) => {
    const v = D.validate(st, nav, desks, { x, z, rot });
    if (v.ok) { v.desk.id = 'D' + (desks.length + 1); v.desk.agentId = agentId || null; desks.push(v.desk); }
    return v;
  };
  const near = (a, b) => Math.abs(a - b) < 1e-6;

  t('160 AC-01 geom: seat/approach/facing cho rot 0..3', () => {
    const g0 = D.geom(10, 10, 0), g1 = D.geom(10, 10, 1), g2 = D.geom(10, 10, 2), g3 = D.geom(10, 10, 3);
    eq(near(g0.seatPt.x, 10) && near(g0.seatPt.z, 10.75) && near(g0.approachPt.z, 11.25) && near(g0.facing, Math.PI), 'rot0');
    eq(near(g1.seatPt.x, 10.75) && near(g1.seatPt.z, 10) && near(g1.approachPt.x, 11.25) && near(g1.facing, 1.5 * Math.PI), 'rot1');
    eq(near(g2.seatPt.z, 9.25) && near(g2.approachPt.z, 8.75) && near(g2.facing, 0), 'rot2');
    eq(near(g3.seatPt.x, 9.25) && near(g3.approachPt.x, 8.75) && near(g3.facing, 0.5 * Math.PI), 'rot3');
    for (const g of [g0, g1, g2, g3]) { const vx = Math.sin(g.facing), vz = Math.cos(g.facing); eq(vx * (g.approachPt.x - 10) + vz * (g.approachPt.z - 10) < -1.2, 'quay mặt về bàn rot' + g.rot); }
    const grid = D.baseGrid([D.make('a', 10, 10, 0, null)], cfg), c = Nav.worldToCell(CS, 10), r = Nav.worldToCell(CS, 11.25);
    eq(!grid[r * W + c], 'approach cell trống');
    eq(grid[Nav.worldToCell(CS, 10.2) + W * Nav.worldToCell(CS, 10.2)] === 1, 'thân bàn chặn');
  });

  t('160 AC-02 10 bàn ở 3 phòng hợp lệ; serialize/parse giữ nguyên', () => {
    const st = mk();
    st.wall(5, 5, 23, 5); st.wall(23, 5, 23, 11); st.wall(23, 11, 5, 11); st.wall(5, 11, 5, 5);
    const w1 = st.wall(11, 5, 11, 11), w2 = st.wall(17, 5, 17, 11);
    st.door(w1, 3.0); st.door(w2, 3.0);
    const nav = Nav.buildNav(st, cfg), desks = [], per = {}, cap = { R1: 4, R2: 3, R3: 3 };
    for (let x = 5.25; x <= 22.75; x += 0.25) for (let z = 5.25; z <= 10.75; z += 0.25) for (const rot of [0, 2, 1, 3]) {
      const rid = Nav.pointInRoom(nav, x, z);
      if (rid === 'OUT' || (per[rid] || 0) >= cap[rid]) continue;
      const v = place(st, nav, desks, x, z, rot);
      if (v.ok) { per[rid] = (per[rid] || 0) + 1; break; }
    }
    eq(desks.length === 10, 'đặt được ' + desks.length + ' bàn: ' + JSON.stringify(per));
    eq(Object.keys(per).length === 3, 'đủ 3 phòng: ' + JSON.stringify(per));
    const js = D.serialize(desks, ['dp_x'], 11), back = D.parse(js);
    eq(back && back.desks.length === 10 && back.deskless[0] === 'dp_x' && back.next === 11, 'parse');
    eq(JSON.stringify(back.desks) === JSON.stringify(desks.map(d => JSON.parse(JSON.stringify(d)))), 'giữ nguyên');
    eq(D.parse(JSON.stringify({ v: 99, desks: [] })) === null, 'sai version bị từ chối');
  });

  t('160 AC-03 từ chối: khung cửa, tường, bàn khác, ngoài phòng, phòng chưa có cửa', () => {
    const { st, nav } = mk3(), desks = [];
    const door = nav.doors.find(d => Math.abs(d.center.x - 9) < 0.01);
    let v = D.validate(st, nav, desks, { x: door.center.x - 1.0, z: door.center.z, rot: 1 });
    eq(!v.ok && /khung cửa|tường/.test(v.reason), 'chắn cửa: ' + v.reason);
    v = D.validate(st, nav, desks, { x: 10.0, z: 7, rot: 1 });
    eq(!v.ok && /khung cửa/.test(v.reason), 'vùng frontPt: ' + v.reason);
    v = D.validate(st, nav, desks, { x: 5.4, z: 7, rot: 3 });
    eq(!v.ok, 'sát tường');
    v = D.validate(st, nav, desks, { x: 4.0, z: 7, rot: 0 });
    eq(!v.ok && /phòng/.test(v.reason), 'ngoài phòng: ' + v.reason);
    place(st, nav, desks, 6.5, 5.75, 0);
    v = D.validate(st, nav, desks, { x: 7.0, z: 5.75, rot: 0 });
    eq(!v.ok && /bàn khác/.test(v.reason), 'chồng bàn: ' + v.reason);
    const st2 = threeRooms(); st2.door(st2.div1, 2.0); st2.door(st2.left, 2.0);
    const nav2 = Nav.buildNav(st2, cfg);
    v = D.validate(st2, nav2, [], { x: 15, z: 7, rot: 0 });
    eq(!v.ok && /chưa có cửa/.test(v.reason), 'phòng chưa cửa: ' + v.reason);
  });

  t('160 AC-03b từ chối bàn làm mất lối đi tới cửa', () => {
    const { st, nav } = mk3(), desks = [];
    place(st, nav, desks, 6.25, 5.75, 1); place(st, nav, desks, 6.25, 7.75, 1);
    place(st, nav, desks, 7.5, 5.75, 1); place(st, nav, desks, 7.5, 7.75, 1);
    const reasons = {};
    for (let x = 5.5; x <= 8.5; x += 0.25) for (let z = 5.5; z <= 8.5; z += 0.25) for (const rot of [0, 1, 2, 3]) {
      const v = D.validate(st, nav, desks, { x, z, rot });
      if (!v.ok) reasons[v.reason] = (reasons[v.reason] || 0) + 1;
    }
    const lost = Object.keys(reasons).filter(r => /lối đi|chặn lối|tiếp cận bị/.test(r));
    eq(lost.length > 0, 'cần có vị trí bị từ chối vì lối đi: ' + JSON.stringify(reasons));
  });

  t('160 AC-03c từ chối bàn chia đôi phòng, cắt đường nối giữa hai cửa', () => {
    const st = mk();
    st.wall(5, 5, 9, 5); const right = st.wall(9, 5, 9, 8); st.wall(9, 8, 5, 8); const left = st.wall(5, 8, 5, 5);
    st.door(left, 1.5); st.door(right, 1.5);
    const nav = Nav.buildNav(st, cfg);
    const ok = D.validate(st, nav, [], { x: 7.0, z: 5.75, rot: 0 });
    eq(ok.ok, 'đối chứng hợp lệ: ' + ok.reason);
    const b = D.validate(st, nav, [], { x: 7.0, z: 6.25, rot: 1 });
    eq(!b.ok && /đứt đường|lối đi|chặn/.test(b.reason), 'phải từ chối: ' + JSON.stringify(b.reason));
  });


  t('160 AC-04 bàn là vật cản planRoute (useBase); đường qua đúng cửa, không cắt bàn/tường', () => {
    const { st, nav } = mk3(), desks = [];
    place(st, nav, desks, 11.0, 6.0, 0, 'a1');
    place(st, nav, desks, 15.0, 6.0, 0, 'a2');
    eq(desks.length === 2, 'đặt 2 bàn');
    const target = desks[0].approachPt, base = D.baseGrid(desks, cfg);
    const from = { x: 6, z: 6 };
    nav.cfg.base = base;
    const r = Nav.planRoute(nav, from, target);
    nav.cfg.base = null;
    eq(r.ok && r.doors.length === 1, 'qua đúng 1 cửa: ' + JSON.stringify(r.reason || r.doors));
    const wp = r.waypoints, cfgB = Object.assign({}, cfg, { base });
    for (let i = 0; i + 1 < wp.length; i++) eq(Nav.lineOfSight(nav.blocked, cfgB, wp[i], wp[i + 1]) || (wp[i].door && wp[i].door === wp[i + 1].door), 'đoạn ' + i + ' cắt vật cản');
    const end = wp[wp.length - 1]; eq(near(end.x, target.x) && near(end.z, target.z), 'kết thúc ở approachPt');
    nav.cfg.base = base;
    const r3 = Nav.planRoute(nav, from, desks[1].approachPt);
    nav.cfg.base = null;
    eq(r3.ok && r3.doors.length === 2, 'phòng 1->3 qua 2 cửa: ' + (r3.reason || ''));
  });

  t('160 AC-06 migratePool: poolIdx -> bàn tự do, không mất agent, idempotent', () => {
    const pool = [{ id: 'dp_0', c: 8, r: 27, screenType: 'design' }, { id: 'dp_1', c: 8, r: 34, screenType: 'bim' }, { id: 'dp_2', c: 13, r: 34, screenType: 'po' }];
    const cfgs = [{ name: 'A', poolIdx: 1 }, { name: 'B' }, { name: 'C', poolIdx: 2 }];
    const m = D.migratePool(pool, cfgs, CS);
    eq(m.desks.length === 2 && m.desks[0].agentId === 'dp_1' && m.desks[1].agentId === 'dp_2', 'agent giữ: ' + m.desks.map(d => d.agentId));
    eq(near(m.desks[0].x, (8 + 2) * CS) && near(m.desks[0].z, (34 + 1) * CS) && m.desks[0].rot === 0, 'cùng vị trí DESK_POOL');
    eq(JSON.stringify(m) === JSON.stringify(D.migratePool(pool, cfgs, CS)), 'idempotent');
  });
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
