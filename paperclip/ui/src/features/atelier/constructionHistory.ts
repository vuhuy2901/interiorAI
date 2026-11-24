import * as THREE from 'three'

export const SOURCE_HASH = '19f20e2f8e8ab4e6fdbb41458db5bd970679f3f0013df4ba772bb7724c8a913f'
export const SMALL_APARTMENT_HASH = '5D80B41920F2383D44A93CD7EFA5F74167EE3BED6AC3D7E4704DB01940DDE4BE'
export interface ConstructionItem {
  id: string; name: string; parentName: string; dimensionsMm: [number, number, number]
  floor: number; groundY: number; meshes: THREE.Mesh[]; bounds: THREE.Box3
  sourceGroup?: THREE.Group
  floorBounds?: THREE.Box3
}
// Source groups inspected in isolation. Only wall/floor surfaces and exterior
// environment remain fixed; material selectors separate mixed wall/frame nodes.
const groups: Array<[string, string, string[]]> = [
  ['kitchen', 'Hệ tủ bếp', ['Cube006','Cube007','Cube008','Cube009','Cylinder003']],
  ['cabinet', 'Rèm tầng 1', ['node_0002']],
  ['shelf-ground', 'Kệ sách tầng 1', ['Cube017','node_0009']],
  ['sofa-ground', 'Bộ sofa tầng 1', ['node_0']],
  ['sofa-right', 'Bộ ghế phòng khách', ['node_0007','node_0008']],
  ['dining', 'Bộ bàn ghế ăn', ['Cube002','Cube003','Cube004','Cube005']],
  ['armchair-left', 'Ghế thư giãn bên trái', ['Cube018']],
  ['armchair-right', 'Ghế thư giãn bên phải', ['Cube019']],
  ['armchair-front', 'Ghế thư giãn phía trước', ['Cube025']],
  ['table-front', 'Bàn trà phía trước', ['Cube001']],
  ['table-right', 'Bàn trà phòng khách', ['Cube016']],
  ['table-small', 'Bàn phụ', ['Cube020']],
  ['stool-a', 'Ghế đôn 1', ['node_0004']],
  ['stool-b', 'Ghế đôn 2', ['node_0005']],
  ['stool-c', 'Ghế rời', ['node_0006']],
  ['shelf-upper', 'Hệ kệ sách tầng 2', ['Cube022','Cube023','Cube024','node_0011','node_0012','node_0013']],
  ['console-upper', 'Tủ console tầng 2', ['Cube015','node_0003']],
  ['sofa-upper', 'Bộ sofa tầng 2', ['node_0001']],
  ['table-upper', 'Bàn trà tầng 2', ['Cube021']],
  ['railing-upper', 'Lan can tầng 2', ['Cube010','Cube011','Cube012','Cube013','Cube014']],
  ['curtain-upper', 'Rèm tầng 2', ['node_0014']],
  ['window-ground', 'Khung cửa tầng 1', ['Plane004','Plane008','Plane009']],
  ['window-upper', 'Khung cửa tầng 2', ['Plane005','Plane006','Plane007']],
  ['window-right', 'Khung cửa bên phải · hai tầng', ['node_0010#Material.004']],
  ['art-left', 'Bộ tranh bên trái', ['Plane010']],
  ['art-right', 'Bộ tranh bên phải', ['Plane016']],
  ['rug-right', 'Thảm phòng khách bên phải', ['Plane011']],
  ['rug-front', 'Thảm phòng khách phía trước', ['Plane014']],
  ['rug-dining', 'Thảm khu bàn ăn', ['Plane015']],
  ['rug-upper', 'Thảm tầng 2', ['Plane013']],
  ['ceiling', 'Trần hoàn thiện', ['Plane012']],
]
export function constructionKey(projectId: string, hash: string) { return `${projectId}:${hash}` }
export function buildConstructionItems(root: THREE.Object3D, hash: string): ConstructionItem[] {
  root.updateMatrixWorld(true)
  if (hash.toUpperCase() === SMALL_APARTMENT_HASH) return buildSmallApartmentItems(root)
  if (hash !== SOURCE_HASH) return buildGenericConstructionItems(root)
  const items: ConstructionItem[] = []
  for (const [id, name, nodes] of groups) {
    const meshes: THREE.Mesh[] = []
    for (const selector of nodes) {
      const [nodeName, materialName] = selector.split('#')
      root.getObjectByName(nodeName)?.traverse(node => {
        if (!(node as THREE.Mesh).isMesh) return
        const mesh = node as THREE.Mesh
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        if (!materialName || materials.some(material => material.name === materialName)) meshes.push(mesh)
      })
    }
    if (!meshes.length) continue
    const bounds = new THREE.Box3()
    meshes.forEach(mesh => bounds.union(new THREE.Box3().setFromObject(mesh)))
    const upper = nodes.includes('Cube021') || nodes.includes('Cube015') || nodes.includes('Cube022') || nodes.includes('node_0001') || ['railing-upper','curtain-upper','window-upper','rug-upper','ceiling'].includes(id)
    const floorObject = root.getObjectByName(upper ? 'Cube' : 'Plane')
    const groundY = floorObject ? new THREE.Box3().setFromObject(floorObject).max.y : bounds.min.y
    const size = bounds.getSize(new THREE.Vector3())
    const item = { id: `construction:${id}`, name, parentName: nodes.join(', '),
      dimensionsMm: [size.x*1000,size.z*1000,size.y*1000] as [number,number,number],
      floor: upper ? 2 : 1, groundY, meshes, bounds,
      floorBounds: floorObject ? new THREE.Box3().setFromObject(floorObject) : undefined }
    meshes.forEach(mesh => { mesh.userData.entityId = item.id })
    items.push(item)
  }
  return items.sort((a,b) => a.floor-b.floor)
}

type SmallApartmentGroup = 'bed'|'refrigerator'|'air-conditioner'|'vanity'|'curtain'|'plant-decor'|'rug'|'utility'
const smallApartmentLabels: Record<SmallApartmentGroup,string> = {
  bed:'Giường, nệm và chăn ga', refrigerator:'Tủ lạnh', 'air-conditioner':'Máy lạnh treo tường',
  vanity:'Bàn trang điểm và gương', curtain:'Rèm cửa', 'plant-decor':'Cây xanh và đồ trang trí',
  rug:'Thảm trang trí', utility:'Thùng rác và phụ kiện nhỏ',
}

/** Split the SketchUp material-baked GLB into independently installable meshes. */
function buildSmallApartmentItems(root: THREE.Object3D): ConstructionItem[] {
  const buckets = new Map<SmallApartmentGroup,THREE.Mesh[]>()
  const sourceMeshes: THREE.Mesh[] = []
  root.traverse(node=>{if((node as THREE.Mesh).isMesh)sourceMeshes.push(node as THREE.Mesh)})
  for(const source of sourceMeshes){
    const geometry=source.geometry.index?source.geometry.toNonIndexed():source.geometry.clone()
    const position=geometry.getAttribute('position')
    if(!position||position.count<3)continue
    const selected=new Map<SmallApartmentGroup,number[]>()
    const fixed:number[]=[]
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),center=new THREE.Vector3()
    for(let i=0;i+2<position.count;i+=3){
      a.fromBufferAttribute(position,i).applyMatrix4(source.matrixWorld)
      b.fromBufferAttribute(position,i+1).applyMatrix4(source.matrixWorld)
      c.fromBufferAttribute(position,i+2).applyMatrix4(source.matrixWorld)
      center.copy(a).add(b).add(c).multiplyScalar(1/3)
      const edge=Math.max(a.distanceTo(b),b.distanceTo(c),c.distanceTo(a))
      let group:SmallApartmentGroup|null=null
      if(center.x<.28&&center.y>.15&&center.y<2.75)group='curtain'
      else if(center.y>2.22&&center.z<4.2&&edge<1.8)group='air-conditioner'
      else if(center.y<.12&&center.z>2.2&&center.z<7.2&&edge<2.2)group='rug'
      else if(center.z>7.05&&center.y<1.65&&edge<2.5)group='bed'
      else if(center.z>3.45&&center.z<6.75&&center.x>2.35&&center.y<2.45&&edge<2.2)group='refrigerator'
      else if(center.z<3.35&&center.x>2.25&&center.y<2.25&&edge<1.8)group='vanity'
      else if(center.z<3.35&&center.x<=2.25&&center.y<2.45&&edge<1.7)group='plant-decor'
      else if(edge<.75&&center.y<1.55)group='utility'
      ;(group?selected.get(group)??selected.set(group,[]).get(group)!:fixed).push(i,i+1,i+2)
    }
    const makeMesh=(indices:number[],name:string)=>{
      if(!indices.length)return null
      const part=new THREE.BufferGeometry()
      for(const attributeName of Object.keys(geometry.attributes)){
        const attribute=geometry.getAttribute(attributeName)
        const values:number[]=[]
        for(const index of indices)for(let component=0;component<attribute.itemSize;component++)values.push(attribute.getComponent(index,component))
        part.setAttribute(attributeName,new THREE.Float32BufferAttribute(values,attribute.itemSize,attribute.normalized))
      }
      part.computeBoundingBox();part.computeBoundingSphere()
      const mesh=new THREE.Mesh(part,source.material);mesh.name=name
      mesh.position.copy(source.position);mesh.quaternion.copy(source.quaternion);mesh.scale.copy(source.scale)
      mesh.castShadow=source.castShadow;mesh.receiveShadow=source.receiveShadow
      source.parent?.add(mesh);return mesh
    }
    const fixedMesh=makeMesh(fixed,`${source.name}-architecture`)
    if(fixedMesh)fixedMesh.userData={...source.userData,constructionFixed:true}
    for(const [group,indices] of selected){
      const mesh=makeMesh(indices,`${source.name}-${group}`);if(!mesh)continue
      const list=buckets.get(group)??[];list.push(mesh);buckets.set(group,list)
    }
    source.parent?.remove(source);source.geometry.dispose()
    if(geometry!==source.geometry)geometry.dispose()
  }
  root.updateMatrixWorld(true)
  const floorBounds=new THREE.Box3(new THREE.Vector3(.34,0,.38),new THREE.Vector3(3.86,.12,9.84))
  const order:SmallApartmentGroup[]=['curtain','air-conditioner','rug','bed','refrigerator','vanity','plant-decor','utility']
  return order.flatMap((group,index)=>{
    const meshes=buckets.get(group)??[];if(!meshes.length)return []
    const bounds=new THREE.Box3();meshes.forEach(mesh=>bounds.union(new THREE.Box3().setFromObject(mesh)))
    const size=bounds.getSize(new THREE.Vector3())
    const item:ConstructionItem={id:`construction:small-${group}`,name:smallApartmentLabels[group],parentName:'Small Apartment Morning GLB',
      dimensionsMm:[size.x*1000,size.z*1000,size.y*1000],floor:1,groundY:0,meshes,bounds,floorBounds}
    meshes.forEach(mesh=>{mesh.userData={...mesh.userData,entityId:item.id,constructionOrder:index}})
    return [item]
  })
}

const fixedSceneGroups = new Set([
  'Baseboard', 'Plane.002', 'Door.001', 'EnteranceDoor', 'Windows',
  'Curtatins', 'Zebra Curtains', 'kitchenblind', 'ElectricPlugs', 'Cables',
])
const genericVietnameseNames: Record<string,string> = {
  BathroomFurnitures: 'Nội thất phòng tắm', BathroomWashing: 'Máy giặt và tủ phòng tắm',
  Bed: 'Giường và nệm', BedDecors: 'Trang trí phòng ngủ', BedroomRug: 'Thảm phòng ngủ',
  BedroomWardrobes: 'Tủ quần áo', BookCase: 'Tủ sách', 'Coffee+Maker': 'Máy pha cà phê',
  CouchSet: 'Bộ ghế phòng khách', 'DiningTable.001': 'Bộ bàn ghế ăn', 'Dishwasher.001': 'Máy rửa bát',
  Flower: 'Cây và hoa trang trí', 'Hobs.001': 'Bếp nấu', Hood: 'Máy hút mùi',
  KDecor: 'Đồ trang trí bếp', MacBook: 'Máy tính xách tay', 'Office+Desk': 'Bàn ghế làm việc',
  OficeDecors: 'Trang trí góc làm việc', 'Oven.001': 'Lò nướng', Paintings: 'Tranh trang trí',
  PenHolder: 'Phụ kiện bàn làm việc', 'Plane.004': 'Hệ tủ bếp', 'Plane.007': 'Mặt bàn bếp',
  Plants: 'Cây xanh', 'Refrigator.001': 'Tủ lạnh', Shoes: 'Giày dép', Sink: 'Chậu và vòi bếp',
  StandSpeaker: 'Loa đứng', Toilet: 'Bồn vệ sinh', iMac: 'Máy tính để bàn', shoeRack: 'Tủ giày',
}
function buildGenericConstructionItems(root: THREE.Object3D): ConstructionItem[] {
  const sceneBounds = new THREE.Box3().setFromObject(root)
  const groundY = sceneBounds.min.y
  const floorBounds = sceneBounds.clone()
  floorBounds.min.y = groundY
  floorBounds.max.y = groundY + .12
  const semanticRoot = root.getObjectByName('RootNode') || root
  const candidates = semanticRoot.children.length ? semanticRoot.children : root.children
  const items: ConstructionItem[] = []
  candidates.forEach((group,index) => {
    if (fixedSceneGroups.has(group.name)) return
    const meshes: THREE.Mesh[] = []
    group.traverse(node => { if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh) })
    if (!meshes.length) return
    const bounds = new THREE.Box3()
    meshes.forEach(mesh => bounds.union(new THREE.Box3().setFromObject(mesh)))
    const size = bounds.getSize(new THREE.Vector3())
    if (!Number.isFinite(size.length()) || size.length() < .03) return
    const safeId = (group.name || `object-${index}`).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || `object-${index}`
    const item: ConstructionItem = {
      id:`construction:auto-${safeId}-${index}`,
      name:genericVietnameseNames[group.name] || group.name || `Đồ vật ${index+1}`,
      parentName:group.name || '', dimensionsMm:[size.x*1000,size.z*1000,size.y*1000],
      floor:1, groundY, meshes, bounds, floorBounds,
    }
    meshes.forEach(mesh => { mesh.userData.entityId = item.id })
    items.push(item)
  })
  return items.sort((a,b)=>a.name.localeCompare(b.name,'vi'))
}
export function oppositeEntry(bounds: THREE.Box3, target: THREE.Vector3, floorY: number) {
  const center=bounds.getCenter(new THREE.Vector3())
  const dx=(target.x-center.x)/Math.max(.01,bounds.max.x-bounds.min.x)
  const dz=(target.z-center.z)/Math.max(.01,bounds.max.z-bounds.min.z)
  const entry=target.clone().setY(floorY)
  if (Math.abs(dx)>Math.abs(dz)) entry.x=dx<0 ? bounds.max.x+.6 : bounds.min.x-.6
  else entry.z=dz<=0 ? bounds.max.z+.6 : bounds.min.z-.6
  return entry
}
export interface HistoryRecord { id: string; name: string; floor: number; completed_at?: string }
export type PlaybackSpeed = 1 | 2 | 5
export interface ConstructionWorkerState {
  id: string; name: string; color: string; itemId?: string; itemName?: string; ordinal?: number
  phase: 'idle' | 'moving' | 'placing' | 'returning'; progress: number
}
export interface ConstructionState {
  history: HistoryRecord[]; pending: HistoryRecord[]; active?: string; paused?: boolean; error?: string
  speed?: PlaybackSpeed; workers?: ConstructionWorkerState[]; replay?: { done: number; total: number }
}
export type ConstructionAction = {
  key: string; action: 'replay'|'pause'|'stop'|'select'|'speed'|'state'
  ids?: string[]; id?: string; speed?: PlaybackSpeed
}
export const commandEvent='atelier:construction-command'
export const stateEvent='atelier:construction-state'
export { attachConstructionPlayback } from './constructionPlayback'
