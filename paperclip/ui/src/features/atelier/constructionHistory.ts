import * as THREE from 'three'

export const SOURCE_HASH = '19f20e2f8e8ab4e6fdbb41458db5bd970679f3f0013df4ba772bb7724c8a913f'
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
  if (hash !== SOURCE_HASH) return []
  root.updateMatrixWorld(true)
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
  id: string; name: string; color: string; itemId?: string; itemName?: string
  phase: 'idle' | 'moving' | 'placing' | 'returning'; progress: number
}
export interface ConstructionState {
  history: HistoryRecord[]; pending: HistoryRecord[]; active?: string; paused?: boolean; error?: string
  speed?: PlaybackSpeed; workers?: ConstructionWorkerState[]
}
export type ConstructionAction = {
  key: string; action: 'replay'|'pause'|'stop'|'select'|'speed'|'state'
  ids?: string[]; id?: string; speed?: PlaybackSpeed
}
export const commandEvent='atelier:construction-command'
export const stateEvent='atelier:construction-state'
export { attachConstructionPlayback } from './constructionPlayback'
