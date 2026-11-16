import * as THREE from 'three'

export const TOUR_EYE_HEIGHT = 1.6
export const TOUR_RADIUS = .25
export interface TourFloor { id: number; name: string; height: number; bounds: THREE.Box3; surfaces: THREE.Mesh[] }
export interface TourWorld {
  floors: TourFloor[]
  support: (floor: TourFloor, x: number, z: number) => number | null
  canStand: (floor: TourFloor, point: THREE.Vector3) => boolean
  move: (floor: TourFloor, current: THREE.Vector3, candidate: THREE.Vector3) => THREE.Vector3
  findSpawn: (floor: TourFloor, preferred?: THREE.Vector3) => THREE.Vector3 | null
  dispose: () => void
}

/** Geometry-only probes preserve source materials, visibility and transforms. */
export function createTourWorld(root: THREE.Object3D): TourWorld {
  root.updateMatrixWorld(true)
  const probeMaterial = new THREE.MeshBasicMaterial({side:THREE.DoubleSide})
  const probes: Array<{mesh:THREE.Mesh; bounds:THREE.Box3; solid:boolean}> = []
  const byOriginal = new Map<THREE.Object3D,THREE.Mesh>()
  root.traverse(node => {
    if (!(node as THREE.Mesh).isMesh || /^Sphere/.test(node.name)) return
    const source = node as THREE.Mesh
    const mesh = new THREE.Mesh(source.geometry,probeMaterial)
    mesh.matrixAutoUpdate = false; mesh.matrix.copy(source.matrixWorld); mesh.updateMatrixWorld(true)
    const entity = String(source.userData.entityId || '')
    const solid = entity.startsWith('construction:') && !/rug|window|railing|ceiling|art-|cabinet|curtain/.test(entity)
    probes.push({mesh,bounds:new THREE.Box3().setFromObject(mesh),solid}); byOriginal.set(node,mesh)
  })
  const floors: TourFloor[] = []
  for (const [name,id] of [['Plane',1],['Cube',2]] as const) {
    const node=root.getObjectByName(name); if(!node)continue
    const surfaces: THREE.Mesh[]=[]
    node.traverse(child=>{const probe=byOriginal.get(child);if(probe)surfaces.push(probe)})
    if(!surfaces.length)continue
    const bounds=new THREE.Box3();surfaces.forEach(mesh=>bounds.union(new THREE.Box3().setFromObject(mesh)))
    floors.push({id,name:`Tầng ${id}`,height:bounds.max.y,bounds,surfaces})
  }
  const floorMeshes = new Set(floors.flatMap(floor=>floor.surfaces))
  const obstacles = probes.filter(probe=>!floorMeshes.has(probe.mesh))
  const ray = new THREE.Raycaster()
  const down = new THREE.Vector3(0,-1,0)
  const normalMatrix = new THREE.Matrix3()
  const support = (floor:TourFloor,x:number,z:number) => {
    ray.set(new THREE.Vector3(x,floor.height+.35,z),down);ray.near=0;ray.far=.8
    const hits=ray.intersectObjects(floor.surfaces,false)
    const hit=hits.find(hit=>hit.face&&Math.abs(hit.face.normal.clone().applyNormalMatrix(normalMatrix.getNormalMatrix(hit.object.matrixWorld)).y)>.7)
    return hit?.point.y ?? null
  }
  const bodyBlocked = (floorY:number,point:THREE.Vector3) => obstacles.some(probe=>probe.solid &&
    probe.bounds.max.y>floorY+.15 && probe.bounds.min.y<floorY+TOUR_EYE_HEIGHT+.1 &&
    point.x>probe.bounds.min.x-TOUR_RADIUS && point.x<probe.bounds.max.x+TOUR_RADIUS &&
    point.z>probe.bounds.min.z-TOUR_RADIUS && point.z<probe.bounds.max.z+TOUR_RADIUS)
  const relevant = (point:THREE.Vector3,y:number) => obstacles.filter(probe=>
    probe.bounds.min.y<y+1.75 && probe.bounds.max.y>y+.1 &&
    point.x>probe.bounds.min.x-TOUR_RADIUS-.12 && point.x<probe.bounds.max.x+TOUR_RADIUS+.12 &&
    point.z>probe.bounds.min.z-TOUR_RADIUS-.12 && point.z<probe.bounds.max.z+TOUR_RADIUS+.12).map(probe=>probe.mesh)
  const canStand = (floor:TourFloor,point:THREE.Vector3) => {
    const y=support(floor,point.x,point.z);if(y===null||bodyBlocked(y,point))return false
    for(const [dx,dz] of [[TOUR_RADIUS,0],[-TOUR_RADIUS,0],[0,TOUR_RADIUS],[0,-TOUR_RADIUS]]){
      const edge=support(floor,point.x+dx,point.z+dz);if(edge===null||Math.abs(edge-y)>.3)return false
    }
    const nearby=relevant(point,y)
    for(const height of [.2,.8,1.5])for(let i=0;i<8;i++){
      ray.set(new THREE.Vector3(point.x,y+height,point.z),new THREE.Vector3(Math.cos(i*Math.PI/4),0,Math.sin(i*Math.PI/4)))
      ray.near=0;ray.far=TOUR_RADIUS
      if(ray.intersectObjects(nearby,false).length)return false
    }
    return true
  }
  const atEye = (floor:TourFloor,point:THREE.Vector3) => point.clone().setY((support(floor,point.x,point.z)??floor.height)+TOUR_EYE_HEIGHT)
  const move = (floor:TourFloor,current:THREE.Vector3,candidate:THREE.Vector3) => {
    const result=current.clone(),distance=Math.hypot(candidate.x-current.x,candidate.z-current.z)
    const count=Math.max(1,Math.ceil(distance/.08))
    const dx=(candidate.x-current.x)/count,dz=(candidate.z-current.z)/count
    for(let i=0;i<count;i++){
      const next=result.clone().add(new THREE.Vector3(dx,0,dz))
      if(canStand(floor,next))result.copy(atEye(floor,next))
      else{
        const slideX=result.clone().add(new THREE.Vector3(dx,0,0));if(canStand(floor,slideX))result.copy(atEye(floor,slideX))
        const slideZ=result.clone().add(new THREE.Vector3(0,0,dz));if(canStand(floor,slideZ))result.copy(atEye(floor,slideZ))
      }
    }
    return result
  }
  const findSpawn = (floor:TourFloor,preferred?:THREE.Vector3) => {
    const wanted=preferred || new THREE.Vector3((floor.bounds.min.x+floor.bounds.max.x)/2,0,floor.bounds.max.z-1)
    if(canStand(floor,wanted))return atEye(floor,wanted)
    const candidates:THREE.Vector3[]=[]
    for(let x=floor.bounds.min.x+.35;x<floor.bounds.max.x-.35;x+=.5)
      for(let z=floor.bounds.min.z+.35;z<floor.bounds.max.z-.35;z+=.5)candidates.push(new THREE.Vector3(x,0,z))
    candidates.sort((a,b)=>Math.hypot(a.x-wanted.x,a.z-wanted.z)-Math.hypot(b.x-wanted.x,b.z-wanted.z))
    for(const point of candidates)if(canStand(floor,point))return atEye(floor,point)
    return null
  }
  return {floors,support,canStand,move,findSpawn,dispose:()=>probeMaterial.dispose()}
}
