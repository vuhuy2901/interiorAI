import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const $ = (id) => document.getElementById(id)
const state = (window.__PREVIEW_STATE__ = { loaded: false, glbLoaded: 0, glbFailed: 0, selectedId: null, mode: '3d' })
const NA = 'Not available'
const MM = 1000

const token = decodeURIComponent((location.pathname.match(/^\/preview\/([^/?#]+)/) || [])[1] || '')
const base = `/p/${encodeURIComponent(token)}/`

function showError(title, msg) {
  $('loading').classList.add('done')
  $('errorTitle').textContent = title
  $('errorMsg').textContent = msg
  $('errorBox').hidden = false
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')))
  } catch {
    return false
  }
}

async function loadManifest() {
  let res
  try {
    res = await fetch(`${base}manifest.json`, { cache: 'no-store' })
  } catch {
    throw { title: 'Không kết nối được', msg: 'Không thể kết nối tới máy chủ. Hãy kiểm tra điện thoại và máy tính đang dùng cùng mạng Wi-Fi, và tường lửa cho phép cổng này.' }
  }
  if (res.status === 410) throw { title: 'Liên kết đã hết hạn', msg: 'Bản xem trước này đã hết hạn. Hãy nhờ người chia sẻ tạo liên kết mới.' }
  if (res.status === 403) throw { title: 'Liên kết đã bị thu hồi', msg: 'Người chia sẻ đã dừng chia sẻ bản xem trước này.' }
  if (res.status === 404) throw { title: 'Liên kết không hợp lệ', msg: 'Không tìm thấy bản xem trước. Hãy kiểm tra lại liên kết hoặc quét lại mã QR.' }
  if (!res.ok) throw { title: 'Lỗi máy chủ', msg: 'Máy chủ xem trước gặp sự cố. Hãy thử lại sau.' }
  try {
    const m = await res.json()
    if (!m || m.schema !== 1 || !Array.isArray(m.walls) || !Array.isArray(m.furniture)) throw new Error('bad')
    return m
  } catch {
    throw { title: 'Gói dữ liệu bị lỗi', msg: 'Dữ liệu bản xem trước không đọc được. Hãy nhờ người chia sẻ cập nhật lại.' }
  }
}

function boot() {
  if (!token) return showError('Liên kết không hợp lệ', 'Thiếu mã truy cập trong liên kết.')
  if (!hasWebGL()) return showError('Thiết bị không hỗ trợ WebGL', 'Trình duyệt này không chạy được đồ họa 3D. Hãy thử Chrome hoặc Safari bản mới.')
  loadManifest().then(start).catch((e) => showError(e.title || 'Không tải được', e.msg || 'Đã xảy ra lỗi khi tải bản xem trước.'))
}

function fmtDims(f) {
  const ok = f.dimensions_known !== false && [f.width_mm, f.depth_mm, f.height_mm].every((v) => Number.isFinite(v) && v > 0)
  return ok ? `${Math.round(f.width_mm)} × ${Math.round(f.depth_mm)} × ${Math.round(f.height_mm)} mm (R×S×C)` : null
}

function start(m) {
  document.title = `${m.project?.name || 'ATELIER'} — 3D Preview`
  $('projectName').textContent = m.project?.name || 'ATELIER'
  fillMenu(m)

  const canvas = $('gl')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  renderer.setPixelRatio(pixelRatio)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#F5F2EB')
  scene.add(new THREE.HemisphereLight('#ffffff', '#cfc5b6', 1.5))
  const sun = new THREE.DirectionalLight('#fff4e0', 1.6)
  sun.position.set(6, 10, 4)
  scene.add(sun)

  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200)
  const root = new THREE.Group()
  scene.add(root)

  // ---- bounds
  const poly = (m.room?.polygon_mm?.length ? m.room.polygon_mm : [[0, 0], [4000, 0], [4000, 5000], [0, 5000]])
  const pts = [...poly, ...m.walls.flatMap((w) => [w.start_mm, w.end_mm])]
  let bmin = [Math.min(...pts.map((p) => p[0])), 0, Math.min(...pts.map((p) => p[1]))]
  let bmax = [Math.max(...pts.map((p) => p[0])), (m.room?.ceiling_height_mm || 2800), Math.max(...pts.map((p) => p[1]))]
  if (m.bounds_mm?.min && m.bounds_mm?.max) {
    bmin = [Math.min(bmin[0], m.bounds_mm.min[0]), 0, Math.min(bmin[2], m.bounds_mm.min[1])]
    bmax = [Math.max(bmax[0], m.bounds_mm.max[0]), Math.max(bmax[1], m.bounds_mm.max[2] || 0), Math.max(bmax[2], m.bounds_mm.max[1])]
  }
  const bc = new THREE.Vector3((bmin[0] + bmax[0]) / 2 / MM, 0.6, (bmin[2] + bmax[2]) / 2 / MM)
  const bsize = new THREE.Vector3((bmax[0] - bmin[0]) / MM, (bmax[1] - bmin[1]) / MM, (bmax[2] - bmin[2]) / MM)
  const diag = Math.max(2, bsize.length())

  // ---- floor
  const rx = poly.map((p) => p[0]), ry = poly.map((p) => p[1])
  const roomMinX = Math.min(...rx), roomMaxX = Math.max(...rx), roomMinY = Math.min(...ry), roomMaxY = Math.max(...ry)
  const roomW = Math.max(1, roomMaxX - roomMinX), roomD = Math.max(1, roomMaxY - roomMinY)
  const fl = m.room?.floor || {}
  const floorTex = makeTileTexture(fl, roomW, roomD)
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(roomW / MM, 0.08, roomD / MM),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: fl.roughness ?? 0.5, metalness: 0.04 })
  )
  floor.position.set((roomMinX + roomMaxX) / 2 / MM, -0.04, (roomMinY + roomMaxY) / 2 / MM)
  root.add(floor)

  // ---- walls (+ per-wall auto cutaway when camera is outside)
  const wallInfos = []
  const wallById = new Map()
  const roomCenter = new THREE.Vector2((roomMinX + roomMaxX) / 2 / MM, (roomMinY + roomMaxY) / 2 / MM)
  m.walls.forEach((w) => {
    const x0 = w.start_mm[0] / MM, z0 = w.start_mm[1] / MM, x1 = w.end_mm[0] / MM, z1 = w.end_mm[1] / MM
    const len = Math.hypot(x1 - x0, z1 - z0)
    if (len <= 0) return
    const h = (w.height_mm || 2800) / MM, th = (w.thickness_mm || 200) / MM
    const mat = new THREE.MeshStandardMaterial({ color: w.color || '#F5F2EB', roughness: w.roughness ?? 0.82, transparent: true, opacity: 1 })
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, h, th), mat)
    const angle = Math.atan2(z1 - z0, x1 - x0)
    mesh.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2)
    mesh.rotation.y = -angle
    root.add(mesh)
    const mid = new THREE.Vector2((x0 + x1) / 2, (z0 + z1) / 2)
    let nrm = new THREE.Vector2(-(z1 - z0), x1 - x0).normalize()
    if (nrm.dot(mid.clone().sub(roomCenter)) < 0) nrm.negate()
    const info = { mat, mid, nrm, x0, z0, x1, z1, angle, th, h }
    wallInfos.push(info)
    wallById.set(w.id, info)
  })

  // ---- openings (visual frames only)
  ;(m.openings || []).forEach((o) => {
    const w = wallById.get(o.wall_id) || wallInfos[0]
    if (!w) return
    const t = o.t ?? 0.5
    const ox = w.x0 + (w.x1 - w.x0) * t, oz = w.z0 + (w.z1 - w.z0) * t
    const ow = (o.width_mm || 900) / MM, oh = (o.height_mm || 2100) / MM, sill = (o.sill_height_mm || 0) / MM
    const isWin = o.kind === 'window'
    const g = new THREE.Group()
    const frameMat = new THREE.MeshStandardMaterial({ color: isWin ? '#8a7d6e' : '#6b4f3a', roughness: 0.6 })
    const ft = 0.05, depth = w.th + 0.03
    const mk = (sx, sy, sz, px, py, mat) => {
      const me = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat)
      me.position.set(px, py, 0)
      g.add(me)
    }
    mk(ft, oh, depth, -ow / 2, sill + oh / 2, frameMat)
    mk(ft, oh, depth, ow / 2, sill + oh / 2, frameMat)
    mk(ow, ft, depth, 0, sill + oh - ft / 2, frameMat)
    if (isWin) {
      mk(ow, ft, depth, 0, sill + ft / 2, frameMat)
      mk(ow - ft, oh - ft * 2, 0.02, 0, sill + oh / 2, new THREE.MeshStandardMaterial({ color: '#BAE6FD', transparent: true, opacity: 0.45, roughness: 0.1, depthWrite: false }))
    } else {
      mk(ow - ft, oh - ft, 0.04, 0, sill + (oh - ft) / 2, new THREE.MeshStandardMaterial({ color: '#B9946B', roughness: 0.65 }))
    }
    g.position.set(ox, 0, oz)
    g.rotation.y = -w.angle
    root.add(g)
  })

  // ---- furniture
  const pickables = []
  const objects = new Map() // id -> {f, group, status, center}
  const gltfLoader = new GLTFLoader()
  const glbCache = new Map()
  const glbUrls = [...new Set(m.furniture.map((f) => f.glb).filter(Boolean))]
  let glbDone = 0
  const warnings = $('warnings')
  const setProgress = () => {
    const pct = glbUrls.length ? Math.round((glbDone / glbUrls.length) * 100) : 100
    $('loadingBar').style.width = pct + '%'
    $('loadingText').textContent = glbUrls.length ? `Đang tải mô hình 3D ${glbDone}/${glbUrls.length}...` : 'Đang dựng scene...'
  }
  setProgress()

  const loadGlb = (url) => {
    if (!glbCache.has(url)) {
      glbCache.set(url, new Promise((resolve, reject) => {
        gltfLoader.load(base + url, resolve, undefined, reject)
      }))
    }
    return glbCache.get(url)
  }
  const warn = (text) => {
    const c = document.createElement('div')
    c.className = 'chip'
    c.textContent = text
    warnings.appendChild(c)
  }

  const outlineMat = new THREE.LineBasicMaterial({ color: 0x14b8a6 })
  const pending = []
  m.furniture.forEach((f) => {
    const fw = (f.width_mm || 1000) / MM, fd = (f.depth_mm || 800) / MM, fh = (f.height_mm || 750) / MM
    const group = new THREE.Group()
    group.position.set((f.x_mm ?? 0) / MM, (f.z_mm ?? 0) / MM, (f.y_mm ?? 0) / MM)
    group.rotation.y = -((f.rotation_deg || 0) * Math.PI) / 180
    group.userData.entityId = f.id
    const rec = { f, group, status: f.glb ? 'loading' : 'box', fw, fd, fh }
    objects.set(f.id, rec)
    root.add(group)

    const addBox = () => {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(fw, fh, fd),
        new THREE.MeshStandardMaterial({ color: f.color_hex || '#E4DDD3', roughness: 0.7 })
      )
      box.position.y = fh / 2
      box.userData.entityId = f.id
      group.add(box)
      pickables.push(box)
      rec.fallback = box
    }

    if (!f.glb) {
      addBox()
      return
    }
    pending.push(
      loadGlb(f.glb).then((gltf) => {
        const model = gltf.scene.clone(true)
        const sb = new THREE.Box3().setFromObject(model)
        const ss = sb.getSize(new THREE.Vector3())
        if (ss.x <= 0 || ss.y <= 0 || ss.z <= 0) throw new Error('empty')
        const fit = Math.min(fw / ss.x, fh / ss.y, fd / ss.z)
        const axes = new Set(f.parametric_axes || [])
        const para = f.sizing_policy === 'PARAMETRIC'
        model.scale.set(para && axes.has('width') ? fw / ss.x : fit, para && axes.has('height') ? fh / ss.y : fit, para && axes.has('depth') ? fd / ss.z : fit)
        model.updateMatrixWorld(true)
        const nb = new THREE.Box3().setFromObject(model)
        const nc = nb.getCenter(new THREE.Vector3())
        model.position.set(-nc.x, -nb.min.y, -nc.z)
        model.traverse((n) => {
          if (n.isMesh) {
            n.userData.entityId = f.id
            pickables.push(n)
          }
        })
        group.add(model)
        rec.status = 'glb'
        state.glbLoaded++
      }).catch(() => {
        rec.status = 'failed'
        state.glbFailed++
        addBox()
        warn(`Không tải được mô hình 3D: ${f.name || f.id}`)
      }).finally(() => {
        glbDone++
        setProgress()
        dirty = true
      })
    )
  })

  // selection outline
  let outline = null
  function setSelected(id, { focus = false, fromList = false } = {}) {
    if (outline) {
      outline.parent?.remove(outline)
      outline.geometry.dispose()
      outline = null
    }
    state.selectedId = id
    document.body.classList.toggle('sheet-open', !!id)
    const rec = id && objects.get(id)
    if (!rec) {
      $('sheet').hidden = true
      renderList()
      dirty = true
      drawPlan()
      return
    }
    outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(rec.fw + 0.04, rec.fh + 0.04, rec.fd + 0.04)), outlineMat)
    outline.position.y = rec.fh / 2
    rec.group.add(outline)
    fillSheet(rec)
    renderList()
    if (focus) focusObject(rec)
    dirty = true
    drawPlan()
  }

  function fillSheet(rec) {
    const f = rec.f
    $('sName').textContent = f.name || f.id
    $('sCat').textContent = f.category || NA
    const body = $('sBody')
    body.textContent = ''
    const add = (k, v, extra) => {
      const dt = document.createElement('dt'); dt.textContent = k
      const dd = document.createElement('dd')
      dd.textContent = v || NA
      if (!v) dd.className = 'na'
      body.append(dt, dd)
      return dd
    }
    add('Kích thước', fmtDims(f))
    add('Vật liệu', f.material)
    add('Mã', f.id)
    if (f.description) add('Mô tả', f.description)
    if (f.vendor) add('Nhà cung cấp', f.vendor)
    if (f.source_url && /^https?:\/\//i.test(f.source_url)) add('Nguồn', f.source_url)
    const modelState = rec.status === 'glb' ? 'Mô hình 3D thật' : rec.status === 'failed' ? 'Tải mô hình lỗi — đang hiển thị khối ước lượng' : rec.status === 'loading' ? 'Đang tải...' : 'Không có mô hình 3D (khối ước lượng theo kích thước)'
    add('Mô hình', modelState)
    $('sheet').hidden = false
  }

  function renderList() {
    const ul = $('objList')
    ul.textContent = ''
    m.furniture.forEach((f) => {
      const li = document.createElement('li')
      if (f.id === state.selectedId) li.className = 'sel'
      const a = document.createElement('span'); a.textContent = f.name || f.id
      const b = document.createElement('small'); b.textContent = f.category || ''
      li.append(a, b)
      li.addEventListener('click', () => {
        setSelected(f.id, { focus: state.mode === '3d' })
        if (window.innerWidth < 900) $('drawer').hidden = true
      })
      ul.appendChild(li)
    })
  }
  renderList()

  // ---- controls
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.screenSpacePanning = true
  controls.minDistance = Math.max(0.6, diag * 0.12)
  controls.maxDistance = diag * 2.2
  controls.minPolarAngle = 0.08
  controls.maxPolarAngle = Math.PI / 2 - 0.04
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
  const tmin = new THREE.Vector3(bmin[0] / MM - 1, 0, bmin[2] / MM - 1)
  const tmax = new THREE.Vector3(bmax[0] / MM + 1, 3.2, bmax[2] / MM + 1)

  let dirty = true
  let tween = null
  const preset = m.camera_presets?.[0]
  function defaultView() {
    if (preset?.position_m && preset?.target_m) {
      return { pos: new THREE.Vector3(...preset.position_m), target: new THREE.Vector3(...preset.target_m) }
    }
    return {
      pos: bc.clone().add(new THREE.Vector3(0.55, 0.75, 0.95).normalize().multiplyScalar(diag * 1.3)),
      target: bc.clone(),
    }
  }
  function tweenTo(pos, target, ms = 550) {
    tween = { t0: performance.now(), ms, p0: camera.position.clone(), q0: controls.target.clone(), p1: pos, q1: target }
  }
  function resetCamera(animate = true) {
    const v = defaultView()
    if (animate) tweenTo(v.pos, v.target)
    else {
      camera.position.copy(v.pos)
      controls.target.copy(v.target)
      controls.update()
    }
  }
  function focusObject(rec) {
    const c = rec.group.position.clone()
    c.y += rec.fh / 2
    const dist = Math.max(1.6, Math.max(rec.fw, rec.fd, rec.fh) * 2.6)
    const dir = camera.position.clone().sub(controls.target).normalize()
    dir.y = Math.max(dir.y, 0.35)
    dir.normalize()
    tweenTo(c.clone().add(dir.multiplyScalar(dist)), c)
  }
  function zoomBy(f) {
    const off = camera.position.clone().sub(controls.target)
    const d = THREE.MathUtils.clamp(off.length() * f, controls.minDistance, controls.maxDistance)
    off.setLength(d)
    tweenTo(controls.target.clone().add(off), controls.target.clone(), 200)
  }
  resetCamera(false)
  controls.addEventListener('change', () => { dirty = true })
  controls.addEventListener('start', hideHint)

  // ---- picking (tap vs drag)
  const ray = new THREE.Raycaster()
  let down = null
  let lastTap = { t: 0, id: null }
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() } })
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
    const dt = performance.now() - down.t
    down = null
    if (moved > 8 || dt > 500) return
    const r = canvas.getBoundingClientRect()
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
    const hit = ray.intersectObjects(pickables, false)[0]
    const id = hit ? hit.object.userData.entityId : null
    const now = performance.now()
    if (id && id === lastTap.id && now - lastTap.t < 380) {
      setSelected(id, { focus: true })
      lastTap = { t: 0, id: null }
      return
    }
    lastTap = { t: now, id }
    if (id !== state.selectedId) setSelected(id)
  })

  // ---- sizing + render loop
  function resize() {
    const st = $('stage')
    const w = st.clientWidth, h = st.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    resizePlan()
    dirty = true
  }
  window.addEventListener('resize', resize)
  new ResizeObserver(resize).observe($('stage'))

  let frameSamples = []
  let lastRender = performance.now()
  const camV = new THREE.Vector3()
  function applyCutaway() {
    camV.copy(camera.position)
    wallInfos.forEach((w) => {
      const outside = (camV.x - w.mid.x) * w.nrm.x + (camV.z - w.mid.y) * w.nrm.y > 0.15
      const target = outside ? 0.18 : 1
      if (Math.abs(w.mat.opacity - target) > 0.001) {
        w.mat.opacity = target
        w.mat.depthWrite = !outside
        w.mat.needsUpdate = true
      }
    })
  }
  function tick() {
    rafId = requestAnimationFrame(tick)
    if (tween) {
      const k = Math.min(1, (performance.now() - tween.t0) / tween.ms)
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      camera.position.lerpVectors(tween.p0, tween.p1, e)
      controls.target.lerpVectors(tween.q0, tween.q1, e)
      if (k >= 1) tween = null
      dirty = true
    }
    const changed = controls.update()
    controls.target.clamp(tmin, tmax)
    if (camera.position.y < 0.25) camera.position.y = 0.25
    if (changed) dirty = true
    if (state.mode !== '3d' || !dirty) return
    dirty = false
    applyCutaway()
    const now = performance.now()
    frameSamples.push(now - lastRender)
    lastRender = now
    if (frameSamples.length >= 40) {
      const avg = frameSamples.reduce((a, b) => a + b, 0) / frameSamples.length
      frameSamples = []
      if (avg > 28 && pixelRatio > 1) {
        pixelRatio = pixelRatio > 1.5 ? 1.5 : 1
        renderer.setPixelRatio(pixelRatio)
        resize()
      }
    }
    renderer.render(scene, camera)
  }
  let rafId = requestAnimationFrame(tick)

  // ---- 2D plan
  const plan = $('plan')
  const pctx = plan.getContext('2d')
  const pv = { s: 0.1, ox: 0, oy: 0 }
  const rooms = m.rooms?.length ? m.rooms : [{ id: m.room?.id, name: m.room?.name, polygon_mm: poly }]
  function fitPlan() {
    const w = plan.clientWidth, h = plan.clientHeight
    if (!w || !h) return
    const pad = 70
    const bw = bmax[0] - bmin[0] || 1, bh = bmax[2] - bmin[2] || 1
    pv.s = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh)
    pv.ox = w / 2 - ((bmin[0] + bmax[0]) / 2) * pv.s
    pv.oy = h / 2 - ((bmin[2] + bmax[2]) / 2) * pv.s
  }
  function resizePlan() {
    const w = plan.clientWidth, h = plan.clientHeight
    if (!w || !h) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    if (plan.width !== Math.round(w * dpr) || plan.height !== Math.round(h * dpr)) {
      plan.width = Math.round(w * dpr)
      plan.height = Math.round(h * dpr)
      fitPlan()
    }
    drawPlan()
  }
  const toS = (x, y) => [x * pv.s + pv.ox, y * pv.s + pv.oy]
  function drawPlan() {
    if (state.mode !== '2d') return
    const dpr = plan.width / (plan.clientWidth || 1)
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    pctx.clearRect(0, 0, plan.clientWidth, plan.clientHeight)
    // rooms
    rooms.forEach((r) => {
      if (!r.polygon_mm?.length) return
      pctx.beginPath()
      r.polygon_mm.forEach((p, i) => { const [sx, sy] = toS(p[0], p[1]); i ? pctx.lineTo(sx, sy) : pctx.moveTo(sx, sy) })
      pctx.closePath()
      pctx.fillStyle = '#EFE9DD'
      pctx.fill()
    })
    // walls
    pctx.lineCap = 'butt'
    m.walls.forEach((w) => {
      const [ax, ay] = toS(w.start_mm[0], w.start_mm[1]), [bx, by] = toS(w.end_mm[0], w.end_mm[1])
      pctx.strokeStyle = '#5E564D'
      pctx.lineWidth = Math.max(2, (w.thickness_mm || 200) * pv.s)
      pctx.beginPath(); pctx.moveTo(ax, ay); pctx.lineTo(bx, by); pctx.stroke()
    })
    // openings
    ;(m.openings || []).forEach((o) => {
      const w = m.walls.find((x) => x.id === o.wall_id) || m.walls[0]
      if (!w) return
      const t = o.t ?? 0.5
      const x = w.start_mm[0] + (w.end_mm[0] - w.start_mm[0]) * t
      const y = w.start_mm[1] + (w.end_mm[1] - w.start_mm[1]) * t
      const ang = Math.atan2(w.end_mm[1] - w.start_mm[1], w.end_mm[0] - w.start_mm[0])
      const [sx, sy] = toS(x, y)
      const ow = (o.width_mm || 900) * pv.s, th = Math.max(3, (w.thickness_mm || 200) * pv.s)
      pctx.save(); pctx.translate(sx, sy); pctx.rotate(ang)
      pctx.fillStyle = '#FBF9F4'
      pctx.fillRect(-ow / 2, -th / 2 - 1, ow, th + 2)
      if (o.kind === 'window') {
        pctx.strokeStyle = '#38BDF8'; pctx.lineWidth = 2
        pctx.beginPath(); pctx.moveTo(-ow / 2, 0); pctx.lineTo(ow / 2, 0); pctx.stroke()
      } else {
        pctx.strokeStyle = '#8a6a4a'; pctx.lineWidth = 1.5
        pctx.beginPath(); pctx.moveTo(-ow / 2, 0); pctx.lineTo(-ow / 2, -ow); pctx.stroke()
        pctx.beginPath(); pctx.arc(-ow / 2, 0, ow, -Math.PI / 2, 0); pctx.stroke()
      }
      pctx.restore()
    })
    // furniture footprints
    m.furniture.forEach((f) => {
      const [sx, sy] = toS(f.x_mm, f.y_mm)
      const sel = f.id === state.selectedId
      pctx.save(); pctx.translate(sx, sy); pctx.rotate(((f.rotation_deg || 0) * Math.PI) / 180)
      const w = f.width_mm * pv.s, d = f.depth_mm * pv.s
      pctx.fillStyle = sel ? 'rgba(20,184,166,.45)' : 'rgba(15,118,110,.18)'
      pctx.strokeStyle = sel ? '#0F766E' : '#6b8f8a'
      pctx.lineWidth = sel ? 2.5 : 1
      pctx.fillRect(-w / 2, -d / 2, w, d); pctx.strokeRect(-w / 2, -d / 2, w, d)
      pctx.restore()
      if (w > 34 || sel) {
        pctx.fillStyle = '#2B2723'; pctx.font = '11px system-ui'; pctx.textAlign = 'center'
        pctx.fillText(f.name || f.id, sx, sy + 4)
      }
    })
    // room labels
    rooms.forEach((r) => {
      if (!r.polygon_mm?.length || !r.name) return
      const cx = r.polygon_mm.reduce((a, p) => a + p[0], 0) / r.polygon_mm.length
      const cy = r.polygon_mm.reduce((a, p) => a + p[1], 0) / r.polygon_mm.length
      const [sx, sy] = toS(cx, cy)
      pctx.fillStyle = '#0F766E'; pctx.font = '600 13px system-ui'; pctx.textAlign = 'center'
      pctx.fillText(r.name, sx, sy - Math.min(40, (roomD * pv.s) / 2 - 8))
    })
  }
  const ptrs = new Map()
  let planDown = null, pinch0 = null
  plan.addEventListener('pointerdown', (e) => {
    plan.setPointerCapture(e.pointerId)
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
    planDown = { x: e.clientX, y: e.clientY, t: performance.now() }
    if (ptrs.size === 2) pinch0 = pinchState()
    hideHint()
  })
  function pinchState() {
    const [a, b] = [...ptrs.values()]
    return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, s: pv.s, ox: pv.ox, oy: pv.oy }
  }
  plan.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId)
    if (!p) return
    if (ptrs.size === 1) {
      pv.ox += e.clientX - p.x; pv.oy += e.clientY - p.y
    }
    p.x = e.clientX; p.y = e.clientY
    if (ptrs.size === 2 && pinch0) {
      const cur = pinchState()
      const r = plan.getBoundingClientRect()
      const k = cur.d / (pinch0.d || 1)
      const s = THREE.MathUtils.clamp(pinch0.s * k, 0.02, 2)
      const px = pinch0.cx - r.left, py = pinch0.cy - r.top
      const wx = (px - pinch0.ox) / pinch0.s, wy = (py - pinch0.oy) / pinch0.s
      pv.s = s
      pv.ox = cur.cx - r.left - wx * s
      pv.oy = cur.cy - r.top - wy * s
    }
    drawPlan()
  })
  const planUp = (e) => {
    const was = ptrs.has(e.pointerId)
    ptrs.delete(e.pointerId)
    if (ptrs.size < 2) pinch0 = null
    if (!was || !planDown) return
    const moved = Math.hypot(e.clientX - planDown.x, e.clientY - planDown.y)
    const single = ptrs.size === 0
    if (single && moved < 8 && performance.now() - planDown.t < 500) {
      const r = plan.getBoundingClientRect()
      const wx = (e.clientX - r.left - pv.ox) / pv.s, wy = (e.clientY - r.top - pv.oy) / pv.s
      let hitId = null
      m.furniture.forEach((f) => {
        const a = -((f.rotation_deg || 0) * Math.PI) / 180
        const dx = wx - f.x_mm, dy = wy - f.y_mm
        const lx = dx * Math.cos(a) + dy * Math.sin(a), ly = -dx * Math.sin(a) + dy * Math.cos(a)
        if (Math.abs(lx) <= f.width_mm / 2 && Math.abs(ly) <= f.depth_mm / 2) hitId = f.id
      })
      setSelected(hitId)
    }
    planDown = null
  }
  plan.addEventListener('pointerup', planUp)
  plan.addEventListener('pointercancel', planUp)
  plan.addEventListener('wheel', (e) => {
    e.preventDefault()
    const r = plan.getBoundingClientRect()
    const px = e.clientX - r.left, py = e.clientY - r.top
    const k = Math.exp(-e.deltaY * 0.0015)
    const s = THREE.MathUtils.clamp(pv.s * k, 0.02, 2)
    const wx = (px - pv.ox) / pv.s, wy = (py - pv.oy) / pv.s
    pv.s = s; pv.ox = px - wx * s; pv.oy = py - wy * s
    drawPlan()
  }, { passive: false })

  function setMode(mode) {
    state.mode = mode
    $('app').dataset.mode = mode
    $('gl').hidden = mode !== '3d'
    plan.hidden = mode !== '2d'
    $('btnMode').textContent = mode === '3d' ? 'Mặt bằng 2D' : 'Xem 3D'
    $('btnReset').title = mode === '3d' ? 'Đặt lại góc nhìn' : 'Đặt lại mặt bằng'
    if (mode === '2d') { resizePlan(); fitPlan(); drawPlan() } else dirty = true
  }

  // ---- UI wiring
  $('btnMode').addEventListener('click', () => setMode(state.mode === '3d' ? '2d' : '3d'))
  $('btnReset').addEventListener('click', () => {
    if (state.mode === '3d') resetCamera(true)
    else { fitPlan(); drawPlan() }
  })
  $('btnZoomIn').addEventListener('click', () => {
    if (state.mode === '3d') zoomBy(0.75)
    else { zoomPlan(1.3) }
  })
  $('btnZoomOut').addEventListener('click', () => {
    if (state.mode === '3d') zoomBy(1.33)
    else { zoomPlan(1 / 1.3) }
  })
  function zoomPlan(k) {
    const cx = plan.clientWidth / 2, cy = plan.clientHeight / 2
    const s = THREE.MathUtils.clamp(pv.s * k, 0.02, 2)
    const wx = (cx - pv.ox) / pv.s, wy = (cy - pv.oy) / pv.s
    pv.s = s; pv.ox = cx - wx * s; pv.oy = cy - wy * s
    drawPlan()
  }
  $('btnList').addEventListener('click', () => { $('drawer').hidden = !$('drawer').hidden })
  $('drawerClose').addEventListener('click', () => { $('drawer').hidden = true })
  $('sClose').addEventListener('click', () => setSelected(null))
  $('sFocus').addEventListener('click', () => {
    const rec = objects.get(state.selectedId)
    if (!rec) return
    if (state.mode === '2d') setMode('3d')
    focusObject(rec)
  })
  $('btnMenu').addEventListener('click', () => { $('menuPanel').hidden = !$('menuPanel').hidden })

  const fsTarget = document.documentElement
  const fsSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !!(fsTarget.requestFullscreen || fsTarget.webkitRequestFullscreen)
  if (!fsSupported) $('btnFullscreen').hidden = true
  $('btnFullscreen').addEventListener('click', () => {
    const el = document.fullscreenElement || document.webkitFullscreenElement
    if (el) (document.exitFullscreen || document.webkitExitFullscreen).call(document)
    else (fsTarget.requestFullscreen || fsTarget.webkitRequestFullscreen).call(fsTarget)
  })

  // hint
  let hintHidden = false
  function hideHint() {
    if (hintHidden) return
    hintHidden = true
    const h = $('hint')
    h.classList.add('fade')
    setTimeout(() => { h.hidden = true }, 600)
    try { localStorage.setItem('atelier_preview_hint', '1') } catch { /* ignore */ }
  }
  let seen = false
  try { seen = localStorage.getItem('atelier_preview_hint') === '1' } catch { /* ignore */ }
  if (!seen) {
    $('hint').hidden = false
    setTimeout(hideHint, 6000)
  } else hintHidden = true

  // context loss + cleanup
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    showError('Thiếu bộ nhớ đồ họa', 'Trình duyệt đã ngắt đồ họa 3D do thiếu bộ nhớ. Hãy tải lại trang hoặc đóng bớt tab khác.')
  })
  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(rafId)
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []
      mats.forEach((mt) => {
        Object.values(mt).forEach((v) => v && v.isTexture && v.dispose())
        mt.dispose()
      })
    })
    renderer.dispose()
  })

  resize()
  Promise.all(pending).then(() => {
    state.loaded = true
    $('loading').classList.add('done')
    dirty = true
    resize()
  })
  if (!pending.length) {
    state.loaded = true
    $('loading').classList.add('done')
  }
}

function makeTileTexture(fl, roomW, roomD) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = fl.color || '#C8A986'
  g.fillRect(0, 0, 256, 256)
  const grout = Math.max(0, fl.grout_width_mm ?? 3)
  const tw = fl.tile_width_mm || 600
  if (grout > 0) {
    g.fillStyle = fl.grout_color || '#B8B1A6'
    const px = Math.max(2, (grout / tw) * 256)
    g.fillRect(0, 0, 256, px)
    g.fillRect(0, 0, px, 256)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(roomW / tw, roomD / (fl.tile_length_mm || tw))
  tex.anisotropy = 4
  return tex
}

function fillMenu(m) {
  const box = $('menuInfo')
  const dl = document.createElement('dl')
  const add = (k, v) => {
    const dt = document.createElement('dt'); dt.textContent = k
    const dd = document.createElement('dd'); dd.textContent = v
    dl.append(dt, dd)
  }
  add('Dự án', m.project?.name || NA)
  add('Revision', m.revision != null ? String(m.revision) : NA)
  add('Phát hành', m.published_at || NA)
  if (m.package?.size_bytes != null) add('Gói dữ liệu', `${(m.package.size_bytes / 1048576).toFixed(1)} MB · ${m.package.asset_count ?? 0} mô hình`)
  add('Chế độ', 'Xem trước cục bộ (chỉ đọc)')
  box.appendChild(dl)
}

boot()
