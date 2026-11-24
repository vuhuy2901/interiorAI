import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createTourWorld, TOUR_EYE_HEIGHT } from './tourNavigation'

function fixture() {
  const root=new THREE.Group(),material=new THREE.MeshStandardMaterial()
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(8,8),material);floor.rotation.x=-Math.PI/2;floor.name='Plane';root.add(floor)
  // Upper slab has a central hole: four strips instead of a solid box.
  const upper=new THREE.Group();upper.name='Cube';root.add(upper)
  for(const [x,z,w,d] of [[-3,0,2,8],[3,0,2,8],[0,-3,4,2],[0,3,4,2]]){
    const strip=new THREE.Mesh(new THREE.BoxGeometry(w,.2,d),material);strip.position.set(x,3,z);upper.add(strip)
  }
  const wall=new THREE.Mesh(new THREE.BoxGeometry(.15,2.8,8),material);wall.position.set(1,1.4,0);root.add(wall)
  const sofa=new THREE.Mesh(new THREE.BoxGeometry(1,.6,1),material);sofa.position.set(-2,.3,-1);sofa.userData.entityId='construction:sofa-ground';root.add(sofa)
  return {root,material}
}
describe('first person navigation',()=>{
  it('finds clear positions on each floor at 1.6m and rejects atrium/edges',()=>{
    const {root,material}=fixture();const world=createTourWorld(root)
    expect(world.floors.map(floor=>floor.id)).toEqual([1,2])
    const lower=world.findSpawn(world.floors[0])!,upper=world.findSpawn(world.floors[1])!
    expect(lower.y).toBeCloseTo(TOUR_EYE_HEIGHT);expect(upper.y).toBeCloseTo(3.1+TOUR_EYE_HEIGHT)
    expect(world.support(world.floors[1],0,0)).toBeNull()
    expect(world.canStand(world.floors[1],new THREE.Vector3(0,0,0))).toBe(false)
    expect(world.canStand(world.floors[0],new THREE.Vector3(3.9,0,0))).toBe(false)
    expect(material.side).toBe(THREE.FrontSide);expect(root.children.every(node=>node.visible)).toBe(true)
    world.dispose()
  })
  it('blocks furniture and thin walls even for long movements; supports sliding',()=>{
    const {root}=fixture();const world=createTourWorld(root),floor=world.floors[0]
    expect(world.canStand(floor,new THREE.Vector3(-2,0,-1))).toBe(false)
    const start=new THREE.Vector3(0,TOUR_EYE_HEIGHT,0)
    const end=world.move(floor,start,new THREE.Vector3(3,TOUR_EYE_HEIGHT,0))
    expect(end.x).toBeLessThan(.76)
    const slide=world.move(floor,end,new THREE.Vector3(3,TOUR_EYE_HEIGHT,1))
    expect(slide.x).toBeLessThan(.76);expect(slide.z).toBeGreaterThan(.5)
    expect(slide.y).toBeCloseTo(TOUR_EYE_HEIGHT)
    world.dispose()
  })
  it('infers a walkable floor when an imported GLB has no Plane/Cube anchors',()=>{
    const root=new THREE.Group(),material=new THREE.MeshStandardMaterial()
    const architecture=new THREE.Group();architecture.name='ApartmentShell'
    const floor=new THREE.Mesh(new THREE.BoxGeometry(12,.08,7),material);floor.position.y=.04
    architecture.add(floor);root.add(architecture)
    const world=createTourWorld(root)
    expect(world.floors.map(item=>item.name)).toEqual(['Tầng 1'])
    expect(world.findSpawn(world.floors[0])).not.toBeNull()
    world.dispose()
  })
})
