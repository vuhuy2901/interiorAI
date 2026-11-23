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
const code = block(158) + '\n' + block(159) + '\n' + block(160) + '\n' + block(161) + '\n' + block(162) + '\nreturn OfficeNav;';
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

/* ---------- FEAT-161 ---------- */
{
  const M = Nav.move, hyp = Math.hypot;
  const wallBlocked = (x, z) => Math.abs(x - 10) < 0.3 && Math.abs(z - 10) > 0.55;
  const mkWorld = (locked) => {
    const w = M.createWorld(wallBlocked);
    M.addDoor(w, { id: 'o1', center: { x: 10, z: 10 }, normal: { x: 1, z: 0 }, width: 0.9, locked: !!locked });
    return w;
  };
  const route = (from, to) => { // qua cửa o1 (trục x)
    const lr = from.x < 10, f = lr ? { x: 9.4, z: 10 } : { x: 10.6, z: 10 }, b = lr ? { x: 10.6, z: 10 } : { x: 9.4, z: 10 };
    return [{ x: f.x, z: f.z, door: 'o1', kind: 'front' }, { x: b.x, z: b.z, door: 'o1', kind: 'back' }, { x: to.x, z: to.z }];
  };
  function sim6() {
    const w = mkWorld(false), ms = [];
    const starts = [[7, 3], [7, 10], [7, 17], [13, 4], [13, 10.4], [13, 16]], ends = [[15, 15], [15, 6], [16, 10], [5, 15], [4, 8], [5, 5]];
    starts.forEach((s, i) => { const m = M.createMover('a' + i, i + 1, s[0], s[1], s[0] < 10 ? Math.PI / 2 : -Math.PI / 2); m.arrived = false; m.done = () => { m.arrived = true; }; w.movers.push(m); M.setPath(m, route({ x: s[0], z: s[1] }, { x: ends[i][0], z: ends[i][1] })); ms.push(m); });
    const stat = { minPair: 9, wallHits: 0, maxInFrame: 0, maxFrameStill: 0, maxStuck: 0, maxStill: 0, maxTurn: 0, backward: 0, backDisp: 0, maxAcc: 0, maxFrameSpeed: 0, openBeforeEnter: true, t: 0 };
    const D = w.doors.get('o1'), lastYaw = ms.map(m => m.yaw), lastV = ms.map(() => 0), still = ms.map(() => 0), lastP = ms.map(m => ({ x: m.x, z: m.z }));
    const dt = 1 / 60;
    for (let k = 0; k < 60 * 80; k++) {
      M.stepAll(w, dt); stat.t += dt;
      let inF = 0;
      ms.forEach((m, i) => {
        if (wallBlocked(m.x, m.z)) stat.wallHits++;
        const fr = M.inFrame(D, m.x, m.z);
        if (fr) { inF++; still[i] = m.v < 0.1 ? still[i] + dt : 0; stat.maxFrameStill = Math.max(stat.maxFrameStill, still[i]); stat.maxFrameSpeed = Math.max(stat.maxFrameSpeed, m.v); if (D.animT < 0.85) stat.openBeforeEnter = false; } else still[i] = 0;
        stat.maxTurn = Math.max(stat.maxTurn, Math.abs(M.angDiff(lastYaw[i], m.yaw)) / dt); lastYaw[i] = m.yaw;
        const vx = (m.x - lastP[i].x) / dt, vz = (m.z - lastP[i].z) / dt, sp = hyp(vx, vz);
        if (sp > 0.2 && Math.cos(m.yaw) * vz + Math.sin(m.yaw) * vx < 0) stat.backDisp++;
        if (m.v > 0.2 && Math.cos(m.yaw) * m.hz + Math.sin(m.yaw) * m.hx < 0) stat.backward++;
        lastP[i] = { x: m.x, z: m.z };
        stat.maxAcc = Math.max(stat.maxAcc, Math.abs(m.v - lastV[i]) / dt); lastV[i] = m.v;
        stat.maxStuck = Math.max(stat.maxStuck, m.maxStuck); stat.maxStill = Math.max(stat.maxStill, m.maxStill);
        for (let j = 0; j < i; j++) stat.minPair = Math.min(stat.minPair, hyp(m.x - ms[j].x, m.z - ms[j].z));
      });
      stat.maxInFrame = Math.max(stat.maxInFrame, inF);
      if (ms.every(m => m.arrived)) break;
    }
    stat.arrived = ms.filter(m => m.arrived).length; stat.ms = ms; stat.w = w;
    return stat;
  }

  t('161 smoothAngle: giới hạn tốc độ quay, đi đường ngắn, hội tụ', () => {
    let a = 0, mx = 0; const dt = 1 / 60;
    for (let i = 0; i < 200; i++) { const n = M.smoothAngle(a, Math.PI * 0.99, dt); mx = Math.max(mx, Math.abs(n - a) / dt); a = n; }
    eq(mx <= M.P.TURN + 1e-6, 'rate ' + mx); eq(Math.abs(a - Math.PI * 0.99) < 1e-3, 'hội tụ ' + a);
    eq(M.smoothAngle(3.0, -3.0, 0.5) > 3.0, 'đi đường ngắn qua ±π');
    eq(M.cornerSpeed(Math.PI / 3) <= 0.75 && M.cornerSpeed(0) >= 1.1 && M.stopSpeed(0) === 0, 'cornerSpeed/stopSpeed');
  });

  t('161 Reservations: xung đột ô cùng cửa sổ thời gian, bỏ qua của chính mình và khác thời điểm', () => {
    const R = new M.Reservations(0.5);
    R.add('a', 5.1, 5.1, 1.0);
    eq(R.conflict('b', 5.3, 5.2, 1.2) === 'a', 'phải xung đột');
    eq(R.conflict('a', 5.1, 5.1, 1.0) === null, 'bỏ qua chính mình');
    eq(R.conflict('b', 5.3, 5.2, 2.5) === null, 'khác thời điểm');
    eq(R.conflict('b', 6.5, 5.2, 1.0) === null, 'xa');
    R.clear(); eq(R.conflict('b', 5.1, 5.1, 1.0) === null, 'clear');
  });

  t('161 pickDoorTurn: người giữ lượt giữ tiếp; không thì chờ lâu nhất, hoà: gần hơn, rồi ưu tiên', () => {
    eq(M.pickDoorTurn([{ id: 'a', wait: 1, dist: 1, prio: 1 }, { id: 'b', wait: 5, dist: 1, prio: 2 }], 'a') === 'a', 'giữ lượt');
    eq(M.pickDoorTurn([{ id: 'a', wait: 1, dist: 1, prio: 1 }, { id: 'b', wait: 5, dist: 1, prio: 2 }], null) === 'b', 'chờ lâu');
    eq(M.pickDoorTurn([{ id: 'a', wait: 2, dist: 0.5, prio: 1 }, { id: 'b', wait: 2, dist: 1, prio: 9 }], null) === 'a', 'gần hơn');
    eq(M.pickDoorTurn([{ id: 'a', wait: 2, dist: 1, prio: 1 }, { id: 'b', wait: 2, dist: 1, prio: 9 }], null) === 'b', 'ưu tiên');
    eq(M.pickDoorTurn([], null) === null, 'rỗng');
  });

  t('161 cửa tự động: mở khi <1.2 m, đóng sau 1.5 s, khoá thì không mở (khoá khác tự đóng)', () => {
    const D = { animT: 0, target: 0, lastPresent: -1e9, locked: false }; let now = 0; const dt = 0.02;
    for (let i = 0; i < 50; i++) { now += dt; M.doorTick(D, true, now, dt); }
    eq(D.animT >= 0.999, 'mở hẳn');
    let tClose = -1; const t0 = now;
    for (let i = 0; i < 400; i++) { now += dt; M.doorTick(D, false, now, dt); if (D.animT < 0.05 && tClose < 0) { tClose = now - t0; break; } }
    eq(tClose >= 1.5 && tClose <= 2.5, 'đóng sau ' + tClose.toFixed(2));
    const L = { animT: 0, target: 0, lastPresent: -1e9, locked: true };
    for (let i = 0; i < 100; i++) { now += dt; M.doorTick(L, true, now, dt); }
    eq(L.animT === 0, 'khoá không mở');
  });

  t('161 AC-05 mô phỏng 6 agent đi chéo qua 1 cửa: không xuyên nhau/tường, 1 người trong khung, không kẹt >5 s', () => {
    const s = sim6();
    console.log('   [sim6]', JSON.stringify({ t: +s.t.toFixed(1), arrived: s.arrived, minPair: +s.minPair.toFixed(2), wallHits: s.wallHits, maxInFrame: s.maxInFrame, maxFrameStill: +s.maxFrameStill.toFixed(2), maxStuck: +s.maxStuck.toFixed(2), maxStill: +s.maxStill.toFixed(2), maxFrameSpeed: +s.maxFrameSpeed.toFixed(2) }));
    eq(s.arrived === 6, 'tới đích ' + s.arrived);
    eq(s.minPair >= 0.3, 'minPair ' + s.minPair);
    eq(s.wallHits === 0, 'wallHits');
    eq(s.maxInFrame <= 1, 'maxInFrame ' + s.maxInFrame);
    eq(s.maxFrameStill <= 2, 'frameStill ' + s.maxFrameStill);
    eq(s.maxStuck <= 5, 'maxStuck ' + s.maxStuck);
    eq(s.openBeforeEnter, 'vào khung khi cửa chưa mở');
  });

  t('161 AC-01/02 mô phỏng: tốc độ, quay, không lùi, gia tốc, tốc độ trong khung cửa', () => {
    const s = sim6();
    console.log('   [sim6b]', JSON.stringify({ maxTurn: +s.maxTurn.toFixed(2), backward: s.backward, backDisp: s.backDisp, maxAcc: +s.maxAcc.toFixed(2), maxFrameSpeed: +s.maxFrameSpeed.toFixed(2) }));
    eq(s.maxTurn <= 4.5, 'turn ' + s.maxTurn); eq(s.backward === 0, 'lùi ' + s.backward);
    eq(s.maxAcc <= 4.0, 'acc ' + s.maxAcc); eq(s.maxFrameSpeed <= 0.9, 'frameSpeed ' + s.maxFrameSpeed);
    const w = M.createWorld(() => false), m = M.createMover('s', 1, 0, 0, Math.PI / 2); w.movers.push(m);
    M.setPath(m, [{ x: 20, z: 0 }]); let t0 = 0, x5 = 0, x15 = 0;
    for (let i = 0; i < 60 * 40 && m.pts; i++) { M.stepAll(w, 1 / 60); t0 += 1 / 60; if (!x5 && m.x >= 5) x5 = t0; if (!x15 && m.x >= 15) x15 = t0; }
    const sp = 10 / (x15 - x5); eq(sp >= 1.1 && sp <= 1.3, 'v tb ' + sp);
  });

  t('161 góc rẽ: tốc độ giảm quanh góc >=60°, tới đích chính xác', () => {
    const w = M.createWorld(() => false), m = M.createMover('c', 1, 0, 0, 0); w.movers.push(m);
    M.setPath(m, [{ x: 0, z: 8 }, { x: 8, z: 8 }]); let atCorner = 9;
    for (let i = 0; i < 60 * 30 && m.pts; i++) { M.stepAll(w, 1 / 60); if (Math.hypot(m.x, m.z - 8) < 0.6) atCorner = Math.min(atCorner, m.v); }
    eq(atCorner <= 0.75, 'v gần góc ' + atCorner); eq(Math.abs(m.x - 8) < 0.01 && Math.abs(m.z - 8) < 0.01, 'tới đích');
  });

  t('161 phá kẹt: 2 agent đối đầu hành lang hẹp không kẹt quá 5 s', () => {
    const w = M.createWorld((x, z) => Math.abs(z - 5) > 0.9), a = M.createMover('a', 1, 0, 5, Math.PI / 2), b = M.createMover('b', 2, 12, 5, -Math.PI / 2);
    w.movers.push(a, b); a.done = () => { a.arr = 1; }; b.done = () => { b.arr = 1; };
    M.setPath(a, [{ x: 12, z: 5 }]); M.setPath(b, [{ x: 0, z: 5 }]);
    let minD = 9; for (let i = 0; i < 60 * 60 && !(a.arr && b.arr); i++) { M.stepAll(w, 1 / 60); minD = Math.min(minD, Math.hypot(a.x - b.x, a.z - b.z)); }
    console.log('   [corridor]', JSON.stringify({ arr: [a.arr, b.arr], maxStuck: +Math.max(a.maxStuck, b.maxStuck).toFixed(2), minD: +minD.toFixed(2) }));
    eq(a.arr && b.arr, 'cả hai tới'); eq(Math.max(a.maxStuck, b.maxStuck) <= 5, 'stuck');
  });

  t('161 cửa khoá: agent chờ ở điểm vào, không vào khung, cờ kẹt kích hoạt tính lại đường', () => {
    const w = mkWorld(true), m = M.createMover('k', 1, 7, 10, Math.PI / 2); w.movers.push(m);
    M.setPath(m, route({ x: 7, z: 10 }, { x: 13, z: 10 })); let inF = false, replan = false;
    for (let i = 0; i < 60 * 8; i++) { M.stepAll(w, 1 / 60); if (M.inFrame(w.doors.get('o1'), m.x, m.z)) inF = true; if (m.needReplan) replan = true; }
    eq(!inF, 'vào khung dù khoá'); eq(w.doors.get('o1').animT === 0, 'cửa khoá tự mở'); eq(replan, 'không báo tính lại'); eq(Math.abs(m.x - 9.4) < 0.1, 'điểm chờ ' + m.x);
  });
  t('161 AC-05 ngẫu nhiên: 90 kịch bản 6 agent qua 1 cửa (3 seed x 30): tới đích, 0 xuyên tường, <=1 trong khung, không kẹt >5 s, >=90% không chồng nhau <0.3 m', () => {
    let overlapRuns = 0, bad = [], worstStuck = 0, maxT = 0, ghostRuns = 0;
    for (const sd of [7, 99, 2024]) {
      let seed = sd; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
      for (let it = 0; it < 30; it++) {
        const w = mkWorld(false), pts = [];
        const pickPt = side => { for (let g = 0; g < 200; g++) { const p = { x: side ? 11.5 + rnd() * 6.5 : 2 + rnd() * 6.5, z: 2 + rnd() * 16 }; if (pts.every(q => hyp(q.x - p.x, q.z - p.z) > 1.3)) { pts.push(p); return p; } } };
        const sides = [0, 0, 0, 1, 1, 1], S = sides.map(pickPt), E = sides.map(sd2 => pickPt(1 - sd2));
        const ms = S.map((p, i) => { const m = M.createMover('a' + i, i + 1, p.x, p.z, p.x < 10 ? Math.PI / 2 : -Math.PI / 2); m.arr = false; m.done = () => { m.arr = true; }; w.movers.push(m); M.setPath(m, route(p, E[i])); return m; });
        const D = w.doors.get('o1'); let minP = 9, wall = 0, maxIn = 0, ghost = 0;
        for (let k = 0; k < 60 * 120 && !ms.every(m => m.arr); k++) {
          M.stepAll(w, 1 / 60); let inF = 0;
          ms.forEach((m, i) => { if (wallBlocked(m.x, m.z)) wall++; if (m.ghostT > 0) ghost++; if (m.pts && M.inFrame(D, m.x, m.z)) inF++; for (let j = 0; j < i; j++) minP = Math.min(minP, hyp(m.x - ms[j].x, m.z - ms[j].z)); });
          maxIn = Math.max(maxIn, inF); maxT = Math.max(maxT, k / 60);
        }
        const stuck = Math.max(...ms.map(m => m.maxStuck)); worstStuck = Math.max(worstStuck, stuck); if (ghost) ghostRuns++;
        if (minP < 0.3) overlapRuns++;
        if (ms.some(m => !m.arr) || wall || maxIn > 1 || stuck > 5) bad.push({ sd, it, arr: ms.filter(m => m.arr).length, wall, maxIn, stuck });
      }
    }
    console.log('   [rand90]', JSON.stringify({ bad: bad.length, overlapRuns, ghostRuns, worstStuck: +worstStuck.toFixed(2), maxT: +maxT.toFixed(1) }));
    eq(bad.length === 0, 'kịch bản lỗi ' + JSON.stringify(bad.slice(0, 3)));
    eq(overlapRuns <= 3, 'chồng nhau ' + overlapRuns + '/90 (CR-4: trước 7/90)');
  });
}

/* ---------- FEAT-161 CR-4: mặt bằng mặc định, gieo cửa từ khe lưới cũ, mọi agent đi bằng planRoute ---------- */
{
  const M = Nav.move, hyp = Math.hypot, W2 = 60, H2 = 64;
  /* mặt bằng FP2 mặc định: trích từ fp2SeedDefaultWalls */
  /* hỗ trợ cả dạng cũ `const segs=[[...,T2,H2],...]` và dạng mới `const segments = [ [x0,z0,x1,z1], ... ]` */
  const segMatch = html.match(/fp2SeedDefaultWalls\(\)\s*\{[^]*?const (?:segs|segments)\s*=\s*(\[\s*\[[^]*?\]\s*,?\s*\]);/);
  if (!segMatch) throw new Error('Không tìm thấy danh sách tường mặc định trong fp2SeedDefaultWalls');
  const segSrc = segMatch[1].replace(/T2/g, '0.15').replace(/H2/g, '2.6');
  const segs = eval(segSrc);
  const defaultState = () => { const st = mk(); for (const [x0, z0, x1, z1] of segs) st.wall(x0, z0, x1, z1); return st; };
  /* lưới cũ xấp xỉ: tường phòng (trừ khe d), hành lang, các khối blk() cấp cao nhất, 9 bàn lõi, cánh nam bị chặn */
  const legacy = new Uint8Array(W2 * H2);
  const B = (c, r) => { if (c >= 0 && r >= 0 && c < W2 && r < H2) legacy[r * W2 + c] = 1; };
  const blk = (a, b, c, d) => { for (let i = a; i <= c; i++) for (let j = b; j <= d; j++) B(i, j); };
  for (let r = 40; r < H2; r++) for (let c = 0; c < W2; c++) legacy[r * W2 + c] = 1;
  const roomsSrc = html.slice(html.indexOf('const rooms = ['), html.indexOf('function customFloor'));
  const wallSet = new Set(), rms = [...roomsSrc.matchAll(/r: \[(\d+), (\d+), (\d+), (\d+)\][^}]*?d: \[(\d+), (\d+)\]/g)].map(m => m.slice(1).map(Number));
  for (const [c0, r0, c1, r1] of rms) for (let c = c0; c < c1; c++) for (let r = r0; r < r1; r++) if (c === c0 || c === c1 - 1 || r === r0 || r === r1 - 1) wallSet.add(c + ',' + r);
  for (let r = 16; r < 22; r++) { wallSet.add('0,' + r); wallSet.add('59,' + r); }
  for (const [, , , , d0, d1] of rms) for (let i = 0; i < 4; i++) wallSet.delete((d0 + i) + ',' + d1);
  for (const k of wallSet) { const [c, r] = k.split(',').map(Number); B(c, r); }
  for (const m of html.matchAll(/^blk\((\d+), (\d+), (\d+), (\d+)\);/gm)) blk(+m[1], +m[2], +m[3], +m[4]);
  const AGsrc = html.slice(html.indexOf('const AG = ['), html.indexOf('AG.forEach(([id, , , , c, r'));
  const core = [...AGsrc.matchAll(/\['(\w+)', '[^']*', '[^']*', 0x\w+, (\d+), (\d+),/g)].map(m => ({ id: m[1], c: +m[2], r: +m[3] }));
  for (const a of core) blk(a.c, a.r, a.c + 3, a.r + 1);
  const walkLegacy = (x, z) => { const c = Math.floor(x / CS), r = Math.floor(z / CS); return c >= 0 && r >= 0 && c < W2 && r < H2 && !legacy[r * W2 + c]; };
  const nameRooms = nav => nav.rooms.forEach((r, i) => { r.name = 'Phòng ' + (i + 1); });
  const seeded = () => {
    const st = defaultState(); let nav = Nav.buildNav(st, cfg);
    const before = { rooms: nav.rooms.length, doors: nav.doors.filter(d => d.pass).length, noDoor: nav.noDoor.length };
    const specs = Nav.seed.legacyDoorSpecs(st, walkLegacy);
    for (const sp of specs) st.door(sp.wallId, sp.offset, sp.type, sp.width);
    nav = Nav.buildNav(st, cfg); nameRooms(nav);
    const afterSeed = nav.noDoor.length; let auto = 0;
    for (let g = 0; g < 30 && nav.noDoor.length; g++) { const sg = Nav.suggestDoor(st, nav, nav.noDoor[0]); if (!sg.ok) break; st.door(sg.wallId, sg.offset, 'door', sg.width); auto++; nav = Nav.buildNav(st, cfg); nameRooms(nav); }
    return { st, nav, before, specs, afterSeed, auto };
  };
  const baseCore = () => new Uint8Array(legacy);
  const nearestFree = (nav, base, pt) => {
    const c0 = Math.floor(pt.x / CS), r0 = Math.floor(pt.z / CS);
    for (let rad = 0; rad <= 5; rad++) for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) { if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue; if (!Nav.cellBlocked(nav.blocked, W2, H2, base, c0 + dc, r0 + dr)) return rad === 0 ? pt : { x: (c0 + dc + 0.5) * CS, z: (r0 + dr + 0.5) * CS }; }
    return pt;
  };
  const apOf = a => ({ x: (a.c + 1 + 0.5) * CS, z: (a.r + 3 + 0.5) * CS });

  t('161 CR-4 mặt bằng mặc định: 8 phòng, 0 cửa FP2 -> gieo từ khe lưới cũ -> 0 phòng thiếu cửa', () => {
    const r = seeded();
    console.log('   [seed]', JSON.stringify({ before: r.before, seeded: r.specs.length, noDoorAfterSeed: r.afterSeed, autoAdd: r.auto, noDoorFinal: r.nav.noDoor.length }));
    eq(r.before.rooms === 8 && r.before.doors === 0 && r.before.noDoor === 8, 'trạng thái đầu ' + JSON.stringify(r.before));
    eq(r.specs.length >= 7, 'gieo ' + r.specs.length + ' cửa');
    eq(r.nav.noDoor.length === 0, 'còn phòng thiếu cửa ' + r.nav.noDoor);
    const fresh = Nav.buildNav(defaultState(), cfg);
    eq(Nav.seed.needSeed(false, fresh) && !Nav.seed.needSeed(true, fresh), 'needSeed theo cờ');
    eq(!Nav.seed.needSeed(false, r.nav), 'đã có cửa thì không gieo lại');
  });

  t('161 CR-4 cửa gieo nằm đúng khe lối đi cũ (không ở chỗ tường đặc của lưới cũ)', () => {
    const r = seeded();
    for (const op of r.st.openings) {
      const d = Nav.doorInfo(r.st, op);
      eq(walkLegacy(d.center.x, d.center.z) && walkLegacy(d.frontPt.x, d.frontPt.z) && walkLegacy(d.backPt.x, d.backPt.z), 'cửa ' + op.id + ' lệch khe cũ');
    }
  });

  t('161 CR-4 9 agent lõi: mọi bàn tới được mọi bàn khác qua planRoute (72 cặp)', () => {
    const { nav } = seeded(), base = baseCore(); let n = 0; const bad = [];
    eq(core.length === 9, 'số agent lõi ' + core.length);
    nav.cfg.base = base;
    for (const a of core) for (const b of core) {
      if (a === b) continue;
      const r = Nav.planRoute(nav, nearestFree(nav, base, apOf(a)), nearestFree(nav, base, apOf(b))); n++;
      if (!r.ok) bad.push(a.id + '->' + b.id + ':' + r.reason);
    }
    nav.cfg.base = null;
    console.log('   [reach]', JSON.stringify({ pairs: n, fail: bad.length }));
    eq(bad.length === 0, bad.length + '/' + n + ' lỗi: ' + bad.slice(0, 4));
  });

  t('161 CR-4 mô phỏng 9 agent lõi đi chéo giữa các bàn: tới đích, 0 mẫu trong ô tường, không xuyên bàn', () => {
    const { nav } = seeded(), base = baseCore();
    const blockedAt = (x, z) => Nav.cellBlocked(nav.blocked, W2, H2, base, Math.floor(x / CS), Math.floor(z / CS));
    const wallAt = (x, z) => { const c = Math.floor(x / CS), r = Math.floor(z / CS); return c < 0 || r < 0 || c >= W2 || r >= H2 || nav.blocked[r * W2 + c] === 1; };
    let seed = 5; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    let wallHits = 0, deskHits = 0, arrived = 0, total = 0, rounds = 0, maxStuck = 0, samples = 0;
    for (let round = 0; round < 6; round++) {
      const w = M.createWorld(blockedAt);
      for (const d of nav.doors) if (d.pass) M.addDoor(w, { id: d.id, center: d.center, normal: d.normal, width: d.width, locked: !d.open });
      const perm = core.map((_, i) => i).sort(() => rnd() - 0.5), ms = [];
      core.forEach((a, i) => {
        let tgt = core[perm[i]]; if (tgt === a) tgt = core[(perm[i] + 1) % core.length];
        const from = nearestFree(nav, base, apOf(a)), to = nearestFree(nav, base, apOf(tgt));
        nav.cfg.base = base; const r = Nav.planRoute(nav, from, to); nav.cfg.base = null;
        eq(r.ok, 'route ' + a.id + ': ' + r.reason);
        const m = M.createMover(a.id, i + 1, from.x, from.z, 0); m.arr = false; m.done = () => { m.arr = true; }; w.movers.push(m); ms.push(m); M.setPath(m, r.waypoints.slice(1)); total++;
      });
      for (let k = 0; k < 60 * 120 && !ms.every(m => m.arr); k++) {
        M.stepAll(w, 1 / 60);
        for (const m of ms) { samples++; if (wallAt(m.x, m.z)) wallHits++; else if (blockedAt(m.x, m.z)) deskHits++; }
      }
      arrived += ms.filter(m => m.arr).length; maxStuck = Math.max(maxStuck, ...ms.map(m => m.maxStuck)); rounds++;
    }
    console.log('   [core9]', JSON.stringify({ rounds, agents: total, arrived, samples, wallHits, deskHits, maxStuck: +maxStuck.toFixed(2) }));
    eq(arrived === total, 'tới đích ' + arrived + '/' + total);
    eq(wallHits === 0, 'mẫu trong ô tường ' + wallHits);
    eq(deskHits === 0, 'mẫu trong ô bàn/đồ ' + deskHits);
  });

  t('161 CR-4 ghost: không bao giờ xuyên tường/bàn; chỉ sau kẹt >=4 s, tối đa 1 s, giữ >=0.3 m giữa agent', () => {
    eq(M.P.GHOST_AFTER >= 4 && M.P.GHOST_MAX <= 1.0, 'tham số ghost');
    /* hành lang hẹp 1.0 m, một agent đứng yên chặn lối: agent đi tới không bao giờ vào ô tường */
    const wallC = (x, z) => Math.abs(z - 5) > 0.5;
    const w = M.createWorld(wallC), blk2 = M.createMover('s', 9, 6, 5, Math.PI / 2), a = M.createMover('a', 1, 0, 5, Math.PI / 2);
    w.movers.push(blk2, a); a.done = () => { a.arr = 1; }; M.setPath(a, [{ x: 12, z: 5 }]);
    let hits = 0, ghostT = 0, firstGhost = -1, minD = 9;
    for (let i = 0; i < 60 * 40; i++) { M.stepAll(w, 1 / 60); if (wallC(a.x, a.z)) hits++; if (a.ghostT > 0) { ghostT += 1 / 60; if (firstGhost < 0) firstGhost = i / 60; } minD = Math.min(minD, hyp(a.x - blk2.x, a.z - blk2.z)); }
    console.log('   [ghost]', JSON.stringify({ wallHits: hits, firstGhost: +firstGhost.toFixed(2), ghostSeconds: +ghostT.toFixed(2), minD: +minD.toFixed(2) }));
    eq(hits === 0, 'xuyên tường ' + hits);
    eq(firstGhost < 0 || firstGhost >= 4.0, 'ghost sớm ' + firstGhost);
    eq(minD >= 0.29, 'chồng agent ' + minD);
  });
}

/* ---------- FEAT-162: máy trạng thái agent ---------- */
{
  const S = Nav.state, M = Nav.move;
  const EXP = {
    no_desk: 'idle walking blocked meeting leaving', idle: 'no_desk walking sitting working blocked meeting leaving',
    walking: 'idle waiting_door blocked sitting working meeting leaving no_desk', waiting_door: 'walking blocked idle',
    blocked: 'idle walking no_desk sitting working leaving', sitting: 'idle working walking meeting leaving blocked no_desk',
    working: 'sitting idle walking blocked meeting leaving no_desk', meeting: 'idle walking sitting working leaving',
    leaving: 'walking idle no_desk blocked'
  };
  const apply = (m, to, info) => S.setState(m, to, info, 1);

  t('162 AC-01 bảng chuyển 9x9 đúng đặc tả; chuyển bất hợp lệ bị từ chối, trạng thái không đổi', () => {
    eq(S.STATES.length === 9, '9 trạng thái');
    let valid = 0, invalid = 0;
    for (const a of S.STATES) for (const b of S.STATES) {
      const want = a === b || EXP[a].split(' ').includes(b);
      eq(S.canTransition(a, b) === want, a + '->' + b);
      const m = S.createMachine(a), r = apply(m, b, b === 'blocked' ? { reason: 'x' } : {});
      eq(r.ok === want, 'setState ' + a + '->' + b + ' ok=' + r.ok);
      if (!want) { eq(m.state === a, 'trạng thái đổi dù bị từ chối ' + a + '->' + b); eq(m.rejected === 1, 'rejected'); invalid++; } else valid++;
    }
    for (const bad of [['no_desk', 'sitting'], ['no_desk', 'working'], ['idle', 'waiting_door'], ['waiting_door', 'sitting'], ['waiting_door', 'working'], ['sitting', 'waiting_door'], ['leaving', 'sitting'], ['leaving', 'working']]) eq(!S.canTransition(bad[0], bad[1]), 'phải không hợp lệ ' + bad);
    console.log('   [table]', JSON.stringify({ pairs: 81, valid, invalid }));
    eq(!S.setState(S.createMachine('idle'), 'flying', {}, 0).ok, 'trạng thái lạ');
  });

  t('162 AC-01b path(): mọi cặp có đường chuyển chỉ gồm bước hợp lệ; goTo không bao giờ ghi trạng thái bất hợp lệ', () => {
    for (const a of S.STATES) for (const b of S.STATES) {
      const p = S.path(a, b); eq(p !== null, 'không có đường ' + a + '->' + b);
      let cur = a; for (const n of p) { eq(S.canTransition(cur, n) && cur !== n, 'bước sai ' + cur + '->' + n); cur = n; }
      eq(cur === b, 'không tới đích');
      const m = S.createMachine(a), r = S.goTo(m, b, b === 'blocked' ? { reason: 'lý do' } : {}, 2);
      eq(m.state === b && r.ok, 'goTo ' + a + '->' + b);
      eq(m.log.every(e => S.canTransition(e.from, e.to)), 'log có chuyển bất hợp lệ');
    }
    eq(JSON.stringify(S.path('waiting_door', 'sitting')) === JSON.stringify(['walking', 'sitting']), 'waiting_door->sitting qua walking');
  });

  t('162 AC-02 blocked phải có reason; reason đọc được nguyên văn trong statusText/tagText', () => {
    const m = S.createMachine('walking');
    eq(!apply(m, 'blocked', {}).ok && m.state === 'walking', 'blocked không reason phải bị từ chối');
    eq(!apply(m, 'blocked', { reason: '   ' }).ok, 'reason rỗng');
    eq(apply(m, 'blocked', { reason: 'Phòng Họp chưa có cửa' }).ok && m.reason === 'Phòng Họp chưa có cửa', 'lưu reason');
    eq(S.statusText(m).includes('Phòng Họp chưa có cửa') && S.tagText(m).includes('Phòng Họp'), 'hiển thị reason');
    /* lý do thật từ planRoute: phòng không cửa; cửa bị khoá */
    const st = mk(); st.wall(5, 5, 9, 5); st.wall(9, 5, 9, 9); st.wall(9, 9, 5, 9); st.wall(5, 9, 5, 5);
    const nav1 = Nav.buildNav(st, cfg); nav1.rooms.forEach(r => { r.name = 'Phòng Họp'; });
    const r1 = Nav.planRoute(nav1, { x: 7, z: 7 }, { x: 2, z: 2 });
    eq(!r1.ok && /chưa có cửa/.test(r1.reason), 'reason planRoute: ' + r1.reason);
    const d = S.deriveFromNav({ blockReason: r1.reason, target: 'Ngoài trời' });
    eq(d.state === 'blocked' && d.info.reason === r1.reason, 'deriveFromNav giữ nguyên reason');
    const st2 = mk(); const w = st2.wall(5, 5, 9, 5); st2.wall(9, 5, 9, 9); st2.wall(9, 9, 5, 9); st2.wall(5, 9, 5, 5); const o = st2.door(w, 2); st2.openings.find(x => x.id === o).open = false;
    const nav2 = Nav.buildNav(st2, cfg); nav2.rooms.forEach(r => { r.name = 'Phòng X'; });
    const r2 = Nav.planRoute(nav2, { x: 7, z: 7 }, { x: 2, z: 2 });
    eq(!r2.ok && /đóng|khoá|khóa/.test(r2.reason), 'reason cửa khoá: ' + r2.reason);
    const m2 = S.createMachine('walking'); S.goTo(m2, 'blocked', { reason: r2.reason }, 3);
    eq(S.statusText(m2).endsWith(r2.reason), 'hiển thị nguyên văn');
  });

  t('162 deriveFromNav: đi/chờ cửa/chặn/ngồi/làm việc/không bàn/rời bàn/họp', () => {
    const base = { moving: false, doorWait: false, blockReason: null, sitting: false, atHome: false, hasDesk: true, business: 'idle', task: '', transitioning: false, leaving: false };
    const d = (o) => S.deriveFromNav(Object.assign({}, base, o));
    eq(d({ moving: true, target: 'Phòng A' }).state === 'walking', 'walking');
    eq(d({ moving: true, doorWait: true, doorId: 'o2' }).state === 'waiting_door' && /o2/.test(d({ moving: true, doorWait: true, doorId: 'o2' }).info.reason), 'waiting_door');
    eq(d({ blockReason: 'Cửa o2 bị khoá' }).state === 'blocked', 'blocked');
    eq(d({ sitting: true, atHome: true, business: 'working', task: 'T-1' }).state === 'working', 'working');
    eq(d({ sitting: true, atHome: false, business: 'working' }).state === 'sitting', 'ngồi chỗ khác = sitting');
    eq(d({ hasDesk: false }).state === 'no_desk', 'no_desk');
    eq(d({ leaving: true }).state === 'leaving', 'leaving');
    eq(d({ business: 'meeting' }).state === 'meeting', 'meeting');
    eq(d({ transitioning: true }) === null, 'đang chuyển cảnh giữ nguyên');
    eq(d({}).state === 'idle', 'idle');
  });

  t('162 AC-03 ETA giảm đơn điệu khi đi, = còn lại / 1.2 trong ±15%, về 0 khi tới', () => {
    const w = M.createWorld(() => false), m = M.createMover('e', 1, 0, 0, Math.PI / 2); w.movers.push(m);
    M.setPath(m, [{ x: 12, z: 0 }, { x: 12, z: 8 }]);
    let last = Infinity, n = 0, worst = 0, minEta = 99;
    for (let i = 0; i < 60 * 40 && m.pts; i++) {
      M.stepAll(w, 1 / 60);
      if (i % 15 === 0 && m.pts) { const eta = S.etaSeconds(m.L - m.s, M.P.V); eq(eta <= last + 1e-9, 'ETA tăng ' + last + '->' + eta); last = eta; n++; worst = Math.max(worst, Math.abs(eta - (m.L - m.s) / 1.2)); minEta = Math.min(minEta, eta); }
    }
    eq(!m.pts && S.etaSeconds(m.L - m.s, M.P.V) < 0.05, 'tới đích ETA ~0');
    eq(n > 20, 'đủ mẫu ' + n);
    const total = S.etaSeconds(20, 1.2); eq(Math.abs(total - 16.67) < 0.05, 'ETA 20 m');
    console.log('   [eta]', JSON.stringify({ samples: n, first: +S.etaSeconds(20, M.P.V).toFixed(2), monotonic: true }));
  });

  t('162 AC-04 log vòng <=40, cập nhật cùng trạng thái không sinh log', () => {
    const m = S.createMachine('idle');
    for (let i = 0; i < 200; i++) S.setState(m, i % 2 ? 'walking' : 'idle', { target: 'P' + i }, i);
    eq(m.log.length === S.LOG_MAX, 'log ' + m.log.length);
    const before = m.log.length; for (let i = 0; i < 50; i++) S.setState(m, m.state, { target: 'dích ' + i }, 300 + i);
    eq(m.log.length === before, 'cùng trạng thái sinh log');
    const b = S.createMachine('walking'); S.setState(b, 'blocked', { reason: 'A' }, 1); const l1 = b.log.length; S.setState(b, 'blocked', { reason: 'A' }, 2); eq(b.log.length === l1, 'cùng lý do không log'); S.setState(b, 'blocked', { reason: 'B' }, 3); eq(b.log.length === l1 + 1, 'đổi lý do có log');
    eq(!/console\./.test(html.slice(html.indexOf('FEAT-2026-162 CORE BEGIN'), html.indexOf('FEAT-2026-162 CORE END'))), 'CORE 162 không dùng console');
  });

  t('162 AC-05 paperclipIntent + mô phỏng poll: API lỗi/tắt giữ trạng thái cục bộ, có issue -> working, không -> idle', () => {
    eq(S.paperclipIntent(null) === null && S.paperclipIntent({ ok: false, agentFound: true, task: 'X' }) === null && S.paperclipIntent({ ok: true, agentFound: false }) === null, 'API lỗi/không thấy agent = null');
    const w = S.paperclipIntent({ ok: true, agentFound: true, task: 'BIM-1: dựng hình' }); eq(w.state === 'working' && w.task === 'BIM-1: dựng hình', 'working');
    eq(S.paperclipIntent({ ok: true, agentFound: true, task: null }).state === 'idle', 'idle');
    /* mô phỏng một vòng poll: máy chỉ đổi khi intent != null (đúng logic guard apiOk trong trang) */
    const agentsM = { a: S.createMachine('working'), b: S.createMachine('idle') };
    agentsM.a.task = 'BIM-1: dựng hình';
    const poll = (api) => { for (const [id, m] of Object.entries(agentsM)) { const it = S.paperclipIntent({ ok: api.ok, agentFound: true, task: api.tasks[id] || null }); if (it) S.goTo(m, it.state, { task: it.task }, 5); } };
    const snap = () => JSON.stringify(Object.values(agentsM).map(m => [m.state, m.task]));
    const s0 = snap(); poll({ ok: false, tasks: {} }); eq(snap() === s0, 'mất API đổi trạng thái');
    poll({ ok: true, tasks: { a: 'BIM-1: dựng hình', b: 'QA-2: kiểm' } }); eq(agentsM.a.state === 'working' && agentsM.b.state === 'working' && agentsM.b.task === 'QA-2: kiểm', 'có task -> working');
    poll({ ok: false, tasks: {} }); eq(agentsM.b.state === 'working', 'API chết giữa chừng không về idle');
    poll({ ok: true, tasks: { a: 'BIM-1: dựng hình' } }); eq(agentsM.b.state === 'idle' && agentsM.a.state === 'working', 'hết task -> idle');
    /* guard thật trong trang */
    eq(/const apiOk = Array\.isArray\(agentsData\) && Array\.isArray\(issuesData\)/.test(html) && /\(apiOk \? AGENT_MAPPINGS : \[\]\)\.forEach/.test(html), 'guard apiOk trong syncLiveCompanyStatus');
  });

  t('162 AC-06 chỉ setAgentState đổi trạng thái; panel dùng nguồn mới', () => {
    const outside = html.replace(/\/\* ===== FEAT-2026-162 CORE BEGIN[^]*?FEAT-2026-162 CORE END ===== \*\//, '');
    eq(!/\.ms\.state\s*=[^=]/.test(outside), 'gán trực tiếp ms.state ngoài CORE');
    eq(!/agent\.state === 'meeting' \?/.test(outside), 'chuỗi cũ agent.state === meeting ? còn trong panel');
    eq(/FEAT162\.statusText\(agent\)/.test(outside) && /FEAT162\.panelLines\(agent\)/.test(outside), 'panel chưa dùng FEAT162');
    eq(/window\.setAgentState/.test(outside) && /FEAT161\.onBlocked\.push/.test(outside), 'setAgentState/onBlocked');
  });
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
