import * as THREE from 'three'
import { createDeliveryWorker } from './furnitureDeliveryAnimation'
import { createTourWorld, TOUR_EYE_HEIGHT } from './tourNavigation'
import { commandEvent } from './constructionHistory'
import type { createStudioCameraController } from './studioCamera'

export interface TourState {
  mode: 'inactive'|'walk'|'placement'
  floorId: number
  floors: Array<{id:number;name:string}>
  message: string
}
export function attachFirstPersonTour(options: {
  source:THREE.Object3D;scene:THREE.Scene;camera:THREE.PerspectiveCamera;canvas:HTMLCanvasElement
  controller:ReturnType<typeof createStudioCameraController>;key:string;render:()=>void
  onState:(state:TourState)=>void;onExit:()=>void
  initialPose?:{eye:THREE.Vector3;target:THREE.Vector3}
  fallbackWalkBounds?:THREE.Box2
  fallbackFloorY?:number
}) {
  const {source,scene,camera,canvas,controller,key,render}=options
  const world=createTourWorld(source)
  if(!world.floors.length&&options.fallbackWalkBounds){
    const min=options.fallbackWalkBounds.min,max=options.fallbackWalkBounds.max
    const floorY=options.fallbackFloorY??0
    world.floors.push({id:1,name:'Tầng 1',height:floorY,
      bounds:new THREE.Box3(new THREE.Vector3(min.x,floorY,min.y),new THREE.Vector3(max.x,floorY+.12,max.y)),surfaces:[]})
  }
  let state:TourState={mode:'inactive',floorId:world.floors[0]?.id||1,floors:world.floors.map(({id,name})=>({id,name})),message:''}
  const positions=new Map<number,THREE.Vector3>()
  let internalMode=false,disposed=false,dragging:number|null=null
  let saved:{position:THREE.Vector3;quaternion:THREE.Quaternion;target:THREE.Vector3;fov:number;near:number;far:number}|null=null
  const temporaryVisibility=new Map<THREE.Object3D,boolean>()
  const avatar=createDeliveryWorker({id:'tour-visitor'},{id:'tour-visitor',shirtColor:'#2563eb'}).root
  avatar.name='atelier-tour-visitor';avatar.visible=false
  // The visitor does not carry cargo.
  avatar.children[avatar.children.length-1].visible=false
  scene.add(avatar)
  const floor=()=>world.floors.find(floor=>floor.id===state.floorId)!
  const publish=(updateUI=true)=>{
    ;(window as any).__ATELIER_TOUR_STATE__={...state,position:positions.get(state.floorId)?.toArray(),eyeHeight:TOUR_EYE_HEIGHT,
      avatarVisible:avatar.visible,avatarScreen:(()=>{const point=avatar.position.clone().add(new THREE.Vector3(0,1,0)).project(camera);const rect=canvas.getBoundingClientRect();return [rect.left+(point.x+1)*rect.width/2,rect.top+(1-point.y)*rect.height/2]})()}
    if(updateUI&&!disposed)options.onState({...state})
  }
  const restoreVisibility=()=>{temporaryVisibility.forEach((visible,node)=>{node.visible=visible});temporaryVisibility.clear()}
  const releaseDrag=()=>{
    const wasDragging=dragging!==null
    if(dragging!==null&&canvas.hasPointerCapture(dragging))canvas.releasePointerCapture(dragging)
    dragging=null;if(wasDragging)controller.controls.enabled=state.mode==='placement'
  }
  const saveOverview=()=>{
    if(!saved)saved={position:camera.position.clone(),quaternion:camera.quaternion.clone(),target:controller.controls.target.clone(),fov:camera.fov,near:camera.near,far:camera.far}
  }
  const deactivate=(requestExit:boolean)=>{
    releaseDrag();restoreVisibility();avatar.visible=false
    internalMode=true;controller.setMode('orbit',true);internalMode=false
    state={...state,mode:'inactive',message:''}
    if(saved){camera.position.copy(saved.position);camera.quaternion.copy(saved.quaternion);camera.fov=saved.fov;camera.near=saved.near;camera.far=saved.far;controller.controls.target.copy(saved.target);camera.updateProjectionMatrix();controller.controls.update();saved=null}
    publish();render();if(requestExit)options.onExit()
  }
  const eyePosition=()=>positions.get(state.floorId)?.clone()
    || (options.initialPose?.eye.clone())
    || world.findSpawn(floor())
  const enter=()=>{
    if(!world.floors.length){state.message='Chưa xác định được mặt sàn để tham quan.';publish();return null}
    saveOverview()
    window.dispatchEvent(new CustomEvent(commandEvent,{detail:{key,action:'stop'}}))
    releaseDrag();restoreVisibility();avatar.visible=false
    const eye=eyePosition()
    if(!eye){state.message='Không tìm được chỗ trống trên tầng này.';publish();return null}
    positions.set(state.floorId,eye.clone());state={...state,mode:'walk',message:''}
    camera.fov=70;camera.near=.06;camera.updateProjectionMatrix()
    publish();return eye
  }
  const place=()=>{
    if(!floor())return
    releaseDrag();restoreVisibility()
    state={...state,mode:'placement',message:''}
    internalMode=true;controller.setMode('top',true);internalMode=false
    // Expose the selected floor without changing source data or saved visibility.
    source.traverse(node=>{
      if(!(node as THREE.Mesh).isMesh)return
      const bounds=new THREE.Box3().setFromObject(node)
      if(bounds.min.y>floor().height+.35){temporaryVisibility.set(node,node.visible);node.visible=false}
    })
    const eye=eyePosition();if(eye){positions.set(state.floorId,eye);avatar.position.copy(eye).y-=TOUR_EYE_HEIGHT}
    avatar.visible=true;camera.fov=42;camera.updateProjectionMatrix()
    const bounds=floor().bounds.clone();bounds.max.y=floor().height+1.8
    controller.fit(bounds,new THREE.Vector3(0,1,.0001));publish();render()
  }
  controller.setWalkNavigation({
    spawn:enter,
    resolve:(current,candidate)=>{
      if(!floor())return current
      const resolved=world.move(floor(),current,candidate)
      if(options.fallbackWalkBounds&&resolved.distanceToSquared(current)<1e-8&&candidate.distanceToSquared(current)>1e-8){
        const point=new THREE.Vector2(candidate.x,candidate.z).clamp(options.fallbackWalkBounds.min,options.fallbackWalkBounds.max)
        return new THREE.Vector3(point.x,current.y,point.y)
      }
      return resolved
    },
    onPosition:position=>{positions.set(state.floorId,position.clone());avatar.position.copy(position).y-=TOUR_EYE_HEIGHT;publish(false)},
    onModeChange:mode=>{
      if(internalMode)return
      if(mode==='walk'){
        if(floor()){
          const center=floor().bounds.getCenter(new THREE.Vector3())
          const target=options.initialPose?.target.clone() || new THREE.Vector3(center.x,camera.position.y,center.z)
          if(target.distanceToSquared(camera.position)<.25)target.z-=1
          camera.lookAt(target)
        }
        controller.controls.enabled=false;canvas.focus({preventScroll:true});publish();render()
      }else if(state.mode!=='inactive')deactivate(false)
    },
    onEscape:()=>deactivate(true),
  })
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),plane=new THREE.Plane(),intersection=new THREE.Vector3(),offset=new THREE.Vector3()
  const floorPoint=(event:PointerEvent)=>{
    const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1)
    raycaster.setFromCamera(pointer,camera);plane.set(new THREE.Vector3(0,1,0),-floor().height)
    return raycaster.ray.intersectPlane(plane,intersection)
  }
  const down=(event:PointerEvent)=>{
    if(state.mode!=='placement'||event.button!==0||!floor())return
    floorPoint(event);avatar.updateMatrixWorld(true)
    if(!raycaster.intersectObject(avatar,true).length)return
    event.preventDefault();event.stopImmediatePropagation();canvas.focus({preventScroll:true})
    dragging=event.pointerId;offset.copy(intersection).sub(avatar.position)
    controller.controls.enabled=false;canvas.setPointerCapture(event.pointerId)
  }
  const move=(event:PointerEvent)=>{
    if(dragging!==event.pointerId)return
    event.preventDefault();event.stopImmediatePropagation()
    const hit=floorPoint(event);if(!hit)return
    const point=hit.clone().sub(offset)
    const withinFallback=options.fallbackWalkBounds?.containsPoint(new THREE.Vector2(point.x,point.z))
    if(world.canStand(floor(),point)||withinFallback){
      point.y=(world.support(floor(),point.x,point.z)??floor().height)+TOUR_EYE_HEIGHT
      positions.set(state.floorId,point);avatar.position.copy(point).y-=TOUR_EYE_HEIGHT
      state.message=''
    }else state.message='Vị trí bị chặn hoặc nằm ngoài sàn. Kéo tới chỗ trống.'
    publish();render()
  }
  const up=(event:PointerEvent)=>{
    if(dragging!==event.pointerId)return
    event.stopImmediatePropagation();releaseDrag();publish()
  }
  const escape=(event:KeyboardEvent)=>{
    if(event.code==='Escape'&&state.mode!=='inactive'){event.preventDefault();event.stopImmediatePropagation();deactivate(true)}
  }
  const construction=(event:Event)=>{
    const detail=(event as CustomEvent).detail
    if(detail.key===key&&detail.action==='replay'&&state.mode!=='inactive')deactivate(true)
  }
  canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',move,true)
  canvas.addEventListener('pointerup',up,true);canvas.addEventListener('pointercancel',up,true)
  window.addEventListener('keydown',escape,true);window.addEventListener('blur',releaseDrag)
  window.addEventListener(commandEvent,construction,true)
  if(controller.getMode()==='walk')controller.setMode('walk',true)
  publish()
  return {
    setFloor(id:number){
      if(!world.floors.some(floor=>floor.id===id))return
      const previous=positions.get(state.floorId)
      const candidate=world.findSpawn(world.floors.find(floor=>floor.id===id)!,previous)
      if(!candidate){state.message='Không tìm được chỗ trống trên tầng này.';publish();return}
      positions.set(id,candidate);state.floorId=id
      if(state.mode==='placement')place()
      else {controller.setWalkPosition(candidate);canvas.focus({preventScroll:true});publish()}
    },
    place,
    walk(){internalMode=false;controller.setMode('walk',true);canvas.focus({preventScroll:true})},
    exit:()=>deactivate(true),
    dispose(){
      disposed=true;releaseDrag();restoreVisibility();controller.setWalkNavigation(null)
      canvas.removeEventListener('pointerdown',down,true);canvas.removeEventListener('pointermove',move,true)
      canvas.removeEventListener('pointerup',up,true);canvas.removeEventListener('pointercancel',up,true)
      window.removeEventListener('keydown',escape,true);window.removeEventListener('blur',releaseDrag)
      window.removeEventListener(commandEvent,construction,true)
      scene.remove(avatar)
      const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>()
      avatar.traverse(node=>{if((node as THREE.Mesh).isMesh){const mesh=node as THREE.Mesh;geometries.add(mesh.geometry);(Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(material=>materials.add(material))}})
      geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());world.dispose()
    },
  }
}
