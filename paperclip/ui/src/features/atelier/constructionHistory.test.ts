import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { attachConstructionPlayback, commandEvent, oppositeEntry, SOURCE_HASH, SMALL_APARTMENT_HASH, buildConstructionItems } from './constructionHistory'
import { applyWalkCycle, createDeliveryWorker } from './furnitureDeliveryAnimation'

afterEach(()=>vi.unstubAllGlobals())
describe('construction history playback',()=>{
  it('splits the material-baked small apartment into independent install steps',()=>{
    const root=new THREE.Group()
    const geometry=new THREE.BufferGeometry()
    const triangles=[
      // Bed zone, refrigerator zone, and vanity zone in calibrated Three coordinates.
      [1,0.4,8, 2,0.4,8, 1,1,8.5],
      [3,0.2,5, 3.5,0.2,5, 3,1.8,5.5],
      [3,0.3,1.5, 3.5,0.3,1.5, 3,1.2,2],
    ].flat()
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(triangles,3))
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());root.add(mesh)
    const items=buildConstructionItems(root,SMALL_APARTMENT_HASH)
    expect(items.map(item=>item.id)).toEqual(expect.arrayContaining([
      'construction:small-bed','construction:small-refrigerator','construction:small-vanity',
    ]))
    expect(new Set(items.flatMap(item=>item.meshes)).size).toBe(items.flatMap(item=>item.meshes).length)
  })
  it('enters opposite the target and preserves upper-floor height while walking and standing',()=>{
    const bounds=new THREE.Box3(new THREE.Vector3(-5,0,-5),new THREE.Vector3(5,6,5))
    expect(oppositeEntry(bounds,new THREE.Vector3(-4,3,0),3).x).toBeGreaterThan(5)
    expect(oppositeEntry(bounds,new THREE.Vector3(4,3,0),3).x).toBeLessThan(-5)
    expect(oppositeEntry(bounds,new THREE.Vector3(0,3,-4),3).z).toBeGreaterThan(5)
    const worker=createDeliveryWorker({id:'upper'})
    applyWalkCycle(worker,1,true,2.63);expect(worker.root.position.y).toBeGreaterThanOrEqual(2.63)
    applyWalkCycle(worker,1,false,2.63);expect(worker.root.position.y).toBe(2.63)
  })
  it('groups material parts and falls back to semantic groups for other scene files',()=>{
    const root=new THREE.Group()
    for(const name of ['Cube002','Cube003','Cube004','Cube005','Plane','Cube','Plane001']){
      const group=new THREE.Group();group.name=name
      group.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial()))
      root.add(group)
    }
    const items=buildConstructionItems(root,SOURCE_HASH)
    expect(items).toHaveLength(1);expect(items[0].meshes).toHaveLength(4)
    const genericRoot=new THREE.Group(),semantic=new THREE.Group(),bed=new THREE.Group()
    semantic.name='RootNode';bed.name='Bed'
    bed.add(new THREE.Mesh(new THREE.BoxGeometry(2,.6,2),new THREE.MeshStandardMaterial()))
    semantic.add(bed);genericRoot.add(semantic)
    const fallback=buildConstructionItems(genericRoot,'different-file')
    expect(fallback).toHaveLength(1);expect(fallback[0].name).toBe('Giường và nệm')
  })
  it('includes curtains and railings, while retaining concrete in mixed wall/frame nodes',()=>{
    const root=new THREE.Group()
    for(const name of ['Cube','Plane','Cube010','Cube011','Cube012','node_0014','node_0002','node_0010']){
      const group=new THREE.Group();group.name=name
      const material=new THREE.MeshStandardMaterial();material.name='Material.004'
      group.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material));root.add(group)
      if(name==='node_0010'){
        const concrete=new THREE.MeshStandardMaterial();concrete.name='Material.002'
        group.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),concrete))
      }
    }
    const items=buildConstructionItems(root,SOURCE_HASH)
    expect(items.find(item=>item.id==='construction:railing-upper')?.meshes).toHaveLength(3)
    expect(items.find(item=>item.id==='construction:curtain-upper')?.floor).toBe(2)
    expect(items.find(item=>item.id==='construction:cabinet')?.name).toBe('Rèm tầng 1')
    expect(items.find(item=>item.id==='construction:window-right')?.meshes).toHaveLength(1)
    expect(items.flatMap(item=>item.meshes).some(mesh=>(mesh.material as THREE.Material).name==='Material.002')).toBe(false)
  })

  it('reveals pending furniture at 5x and persists each completion exactly once',async()=>{
    const target=new EventTarget();vi.stubGlobal('window',target)
    let raf:FrameRequestCallback|undefined,clock=0
    vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{raf=callback;return 1})
    vi.stubGlobal('cancelAnimationFrame',()=>{raf=undefined})
    vi.spyOn(performance,'now').mockImplementation(()=>clock)
    const scene=new THREE.Scene(),mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial())
    scene.add(mesh);mesh.updateMatrixWorld(true)
    const record={id:'new',name:'New furniture',floor:1}
    const fetchMock=vi.fn(async(_url:string,options:any)=>({ok:true,json:async()=>JSON.parse(options.body).op==='initialize'?{history:[],pending:[record]}:{history:[record],pending:[]}}))
    vi.stubGlobal('fetch',fetchMock)
    const dispose=attachConstructionPlayback({key:'pending-speed',projectId:'p',hash:SOURCE_HASH,items:[{...record,parentName:'',groundY:0,dimensionsMm:[1000,1000,1000],meshes:[mesh],bounds:new THREE.Box3().setFromObject(mesh)}],scene,sourceBounds:new THREE.Box3(new THREE.Vector3(-2,0,-2),new THREE.Vector3(2,3,2)),render:()=>{},fit:()=>{}})
    await new Promise(resolve=>setTimeout(resolve,0))
    target.dispatchEvent(new CustomEvent(commandEvent,{detail:{key:'pending-speed',action:'speed',speed:5}}))
    expect(mesh.visible).toBe(false)
    for(let i=0;i<40;i++){clock+=100;const callback=raf;raf=undefined;callback?.(clock)}
    await new Promise(resolve=>setTimeout(resolve,0))
    expect(mesh.visible).toBe(true)
    expect(fetchMock.mock.calls.filter(call=>JSON.parse(call[1].body).op==='complete')).toHaveLength(1)
    expect((window as any).__ATELIER_CONSTRUCTION_STATE__.activeIds).toEqual([])
    dispose();vi.restoreAllMocks()
  })
  it('shares seven jobs between three distinct workers, refills free slots and supports global controls',async()=>{
    const target=new EventTarget();vi.stubGlobal('window',target)
    let raf:FrameRequestCallback|undefined, clock=0
    vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{expect(raf).toBeUndefined();raf=cb;return 1})
    vi.stubGlobal('cancelAnimationFrame',()=>{raf=undefined})
    vi.spyOn(performance,'now').mockImplementation(()=>clock)
    const scene=new THREE.Scene()
    const items=['a','b','c','d','e','f','g'].map((id,index)=>{
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial())
      mesh.position.set(index*2,3,0);scene.add(mesh);mesh.updateMatrixWorld(true)
      return {id,name:id,parentName:'',floor:2,groundY:2.5,dimensionsMm:[1000,1000,1000] as [number,number,number],meshes:[mesh],bounds:new THREE.Box3().setFromObject(mesh),floorBounds:new THREE.Box3(new THREE.Vector3(-5,0,-5),new THREE.Vector3(5,6,5))}
    })
    const sourceDispose=vi.spyOn(items[0].meshes[0].geometry,'dispose')
    const fetchMock=vi.fn(async()=>({ok:true,json:async()=>({history:items.map(item=>({id:item.id,name:item.name,floor:2})),pending:[]})}))
    vi.stubGlobal('fetch',fetchMock)
    const render=vi.fn()
    const dispose=attachConstructionPlayback({key:'parallel-test',projectId:'project',hash:SOURCE_HASH,items,scene,sourceBounds:new THREE.Box3(new THREE.Vector3(-5,0,-5),new THREE.Vector3(5,6,5)),render,fit:()=>{}})
    await new Promise(resolve=>setTimeout(resolve,0))
    const send=(action:string,ids?:string[],speed?:number)=>target.dispatchEvent(new CustomEvent(commandEvent,{detail:{key:'parallel-test',action,ids,id:'a',speed}}))
    const diagnostic=()=> (window as any).__ATELIER_CONSTRUCTION_STATE__
    const step=(count:number)=>{
      for(let i=0;i<count;i++){
        clock+=50;const cb=raf;raf=undefined;cb?.(clock)
        expect(diagnostic().activeIds.length).toBeLessThanOrEqual(3)
        expect(new Set(diagnostic().activeIds).size).toBe(diagnostic().activeIds.length)
      }
    }
    send('select');expect(scene.getObjectByName('atelier-delivery-worker')).toBeUndefined()
    send('replay',items.map(item=>item.id).concat('a'))
    expect(diagnostic().activeIds).toEqual(['a','b','c'])
    const actors=scene.children.filter(node=>node.name==='atelier-delivery-worker')
    expect(actors.map(actor=>actor.userData.workerId)).toEqual(['worker-1','worker-2','worker-3'])
    const colors=actors.map(actor=>((actor.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHexString())
    expect(colors).toEqual(['0f766e','2563eb','ea580c'])
    expect(items.every(item=>!item.meshes[0].visible)).toBe(true)
    const beforeRender=render.mock.calls.length;step(1);expect(render.mock.calls.length-beforeRender).toBe(1)
    step(134)
    expect(diagnostic().activeIds).toEqual(['d','b','c'])
    send('pause');const paused=diagnostic().workers.map((worker:any)=>worker.progress)
    step(30);expect(diagnostic().workers.map((worker:any)=>worker.progress)).toEqual(paused)
    send('speed',undefined,5);step(30)
    expect(diagnostic().workers.map((worker:any)=>worker.progress)).toEqual(paused)
    send('pause');step(300)
    expect(items.every(item=>item.meshes[0].visible)).toBe(true)
    expect(scene.getObjectByName('atelier-delivery-worker')).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1) // replay never appends completion records
    send('replay',['a']);expect(diagnostic().activeIds).toEqual(['a'])
    send('speed',undefined,1);step(4);const p1=diagnostic().progress
    send('speed',undefined,2);expect(diagnostic().progress).toBe(p1);step(4);const p2=diagnostic().progress
    send('speed',undefined,5);step(4);const p5=diagnostic().progress
    expect(p2-p1).toBeCloseTo(p1*2);expect(p5-p2).toBeCloseTo(p1*5)
    expect(diagnostic().workerY).toBeGreaterThanOrEqual(2.5)
    send('stop');expect(items.every(item=>item.meshes[0].visible)).toBe(true)
    expect(scene.getObjectByName('atelier-delivery-worker')).toBeUndefined()
    expect(diagnostic().speed).toBe(5)
    send('replay',['a','b','c']);dispose()
    expect(items.every(item=>item.meshes[0].visible)).toBe(true)
    expect(scene.getObjectByName('atelier-delivery-worker')).toBeUndefined()
    expect(sourceDispose).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})
