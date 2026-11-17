import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export type StudioCameraMode = 'orbit' | 'top' | 'walk'
export interface WalkNavigation {
  spawn: () => THREE.Vector3 | null
  resolve: (current: THREE.Vector3, candidate: THREE.Vector3) => THREE.Vector3
  onPosition: (position: THREE.Vector3) => void
  onModeChange: (mode: StudioCameraMode) => void
  onEscape: () => void
}

const DEFAULT_DIRECTION = new THREE.Vector3(1, 0.82, 1.08).normalize()
const TOP_DIRECTION = new THREE.Vector3(0, 1, 0.0001).normalize()

export function fitPerspectiveCamera(
  camera: THREE.PerspectiveCamera,
  bounds: THREE.Box3,
  direction = DEFAULT_DIRECTION,
) {
  const target = bounds.getCenter(new THREE.Vector3())
  const size = bounds.getSize(new THREE.Vector3())
  const verticalFov = THREE.MathUtils.degToRad(camera.getEffectiveFOV())
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect)
  const distance = Math.max(
    size.y / (2 * Math.tan(verticalFov / 2)),
    size.x / (2 * Math.tan(horizontalFov / 2)),
    size.z / (2 * Math.tan(verticalFov / 2)),
  ) * 1.35
  camera.position.copy(target).addScaledVector(direction.clone().normalize(), Math.max(distance, 0.5))
  camera.near = Math.max(0.01, distance / 1000)
  camera.far = Math.max(100, distance * 20)
  camera.updateProjectionMatrix()
  camera.lookAt(target)
  return target
}

export function createStudioCameraController(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  sceneBounds: THREE.Box3,
  render: () => void,
  pick: (event: PointerEvent) => void,
) {
  const controls = new OrbitControls(camera, canvas)
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }
  controls.minDistance = 0.12
  controls.maxDistance = Infinity
  controls.enableDamping = false
  const pressedKeys = new Set<string>()
  const walkEuler = new THREE.Euler(0, 0, 0, 'YXZ')
  const forward = new THREE.Vector3()
  const right = new THREE.Vector3()
  const motion = new THREE.Vector3()
  let mode: StudioCameraMode = 'orbit'
  let navigation: WalkNavigation | null = null
  let visible = true
  let animationFrame = 0
  let previousTime: number | null = null
  let pointer: { id: number; x: number; y: number; distance: number; button: number } | null = null

  const fit = (bounds = sceneBounds, forcedDirection?: THREE.Vector3) => {
    const direction = forcedDirection ?? (mode === 'top' ? TOP_DIRECTION : camera.position.clone().sub(controls.target).normalize())
    controls.target.copy(fitPerspectiveCamera(camera, bounds, direction.lengthSq() ? direction : DEFAULT_DIRECTION))
    controls.update()
    render()
  }

  const stopWalk = () => {
    pressedKeys.clear()
    if (animationFrame) cancelAnimationFrame(animationFrame)
    animationFrame = 0
    previousTime = null
  }
  const syncWalkTarget = () => {
    camera.getWorldDirection(forward)
    controls.target.copy(camera.position).addScaledVector(forward,3)
  }
  const animateWalk = (time: number) => {
    animationFrame = 0
    const delta = previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 0.05)
    previousTime = time
    camera.getWorldDirection(forward)
    forward.y = 0
    forward.normalize()
    right.crossVectors(forward, camera.up).normalize()
    const longitudinal = Number(pressedKeys.has('KeyW')) - Number(pressedKeys.has('KeyS'))
    const lateral = Number(pressedKeys.has('KeyD')) - Number(pressedKeys.has('KeyA'))
    if (delta && (longitudinal || lateral)) {
      motion.copy(forward).multiplyScalar(longitudinal).addScaledVector(right, lateral).normalize()
      const candidate = camera.position.clone().addScaledVector(motion, delta * 2)
      camera.position.copy(navigation ? navigation.resolve(camera.position, candidate) : candidate)
      navigation?.onPosition(camera.position)
      syncWalkTarget()
      render()
    }
    if (pressedKeys.size) animationFrame = requestAnimationFrame(animateWalk)
    else previousTime = null
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (visible && mode !== 'walk' && event.code === 'KeyH') {
      event.preventDefault()
      pressedKeys.add(event.code)
      controls.enabled = false
      return
    }
    if (visible && mode === 'walk' && event.code === 'Escape') {
      event.preventDefault(); stopWalk(); navigation?.onEscape(); return
    }
    if (!visible || mode !== 'walk' || !['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return
    event.preventDefault()
    pressedKeys.add(event.code)
    if (!animationFrame) animationFrame = requestAnimationFrame(animateWalk)
  }
  const onKeyUp = (event: KeyboardEvent) => {
    pressedKeys.delete(event.code)
    if (event.code === 'KeyH') controls.enabled = visible && mode !== 'walk'
  }
  const onPointerDown = (event: PointerEvent) => {
    if (!visible || pointer || event.button > 2) return
    canvas.focus({ preventScroll: true })
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0, button: event.button }
    if (pressedKeys.has('KeyH') && mode !== 'walk') {
      event.preventDefault()
      canvas.setPointerCapture(event.pointerId)
    }
    if (mode === 'walk') canvas.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent) => {
    if (pointer?.id !== event.pointerId) return
    const dx = event.clientX - pointer.x
    const dy = event.clientY - pointer.y
    pointer.x = event.clientX
    pointer.y = event.clientY
    pointer.distance += Math.hypot(dx, dy)
    if (pressedKeys.has('KeyH') && mode !== 'walk') {
      const distance = Math.max(0.1, camera.position.distanceTo(controls.target))
      const height = Math.max(1, canvas.clientHeight)
      const worldPerPixel = (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2)) / height
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize()
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize()
      const pan = right.multiplyScalar(-dx * worldPerPixel).add(up.multiplyScalar(dy * worldPerPixel))
      camera.position.add(pan)
      controls.target.add(pan)
      camera.updateMatrixWorld()
      render()
      return
    }
    if (mode !== 'walk' || pointer.button !== 0) return
    walkEuler.setFromQuaternion(camera.quaternion)
    walkEuler.y -= dx * 0.004
    walkEuler.x = THREE.MathUtils.clamp(walkEuler.x - dy * 0.004, -1.54, 1.54)
    camera.quaternion.setFromEuler(walkEuler)
    syncWalkTarget()
    render()
  }
  const onPointerEnd = (event: PointerEvent) => {
    if (pointer?.id !== event.pointerId) return
    const shouldPick = mode !== 'walk' && event.type === 'pointerup' && pointer.button === 0 && pointer.distance < 5
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    pointer = null
    if (shouldPick) pick(event)
  }
  const onBlur = () => { stopWalk(); pointer = null; controls.enabled = visible && mode !== 'walk' }

  controls.addEventListener('change', render)
  canvas.tabIndex = 0
  canvas.setAttribute('aria-label', 'Khung 3D. Giữ H và kéo chuột để pan camera. Trong Walk, kéo để nhìn và dùng WASD để di chuyển')
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerEnd)
  canvas.addEventListener('pointercancel', onPointerEnd)
  canvas.addEventListener('keydown', onKeyDown)
  canvas.addEventListener('blur', onBlur)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)

  return {
    controls,
    render,
    fit,
    getMode: () => mode,
    setWalkNavigation(value: WalkNavigation | null) { navigation = value },
    setWalkPosition(position: THREE.Vector3) {
      stopWalk(); camera.position.copy(position); navigation?.onPosition(camera.position); syncWalkTarget(); render()
    },
    setMode(nextMode: StudioCameraMode, reset = false) {
      if (mode === nextMode && !reset) return
      const previousMode = mode
      stopWalk()
      mode = nextMode
      controls.enabled = visible && mode !== 'walk'
      controls.enableRotate = mode === 'orbit'
      controls.mouseButtons.LEFT = mode === 'top' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE
      if (mode === 'walk') {
        const center = sceneBounds.getCenter(new THREE.Vector3())
        const spawn = navigation?.spawn()
        if (spawn) camera.position.copy(spawn)
        else camera.position.set(center.x, Math.min(1.65, sceneBounds.max.y * 0.65), sceneBounds.max.z - 0.4)
        camera.lookAt(center.x, camera.position.y, sceneBounds.min.z)
        navigation?.onPosition(camera.position)
        render()
      } else {
        fit(sceneBounds, nextMode === 'orbit' && (reset || previousMode === 'top') ? DEFAULT_DIRECTION : undefined)
      }
      navigation?.onModeChange(mode)
      if(mode==='walk'){syncWalkTarget();render()}
    },
    setVisible(nextVisible: boolean) {
      visible = nextVisible
      controls.enabled = visible && mode !== 'walk'
      if (!visible) stopWalk()
    },
    resize(aspect: number) {
      camera.aspect = aspect
      camera.updateProjectionMatrix()
      render()
    },
    dispose() {
      stopWalk()
      controls.removeEventListener('change', render)
      controls.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerEnd)
      canvas.removeEventListener('pointercancel', onPointerEnd)
      canvas.removeEventListener('keydown', onKeyDown)
      canvas.removeEventListener('blur', onBlur)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    },
  }
}
