import { chromium } from '@playwright/test'
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--use-angle=swiftshader']})
try{
 const page=await browser.newPage({viewport:{width:1400,height:1600}})
 page.on('console',message=>{if(message.text().startsWith('{'))console.log(message.text())})
 await page.goto('http://127.0.0.1:5173/ATL/design-studio')
 await page.evaluate(async()=>{
 const THREE=await import('/node_modules/three/build/three.module.js')
 const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js')
 const gltf=await new GLTFLoader().loadAsync('/api/v1/scene-assets/the_interior_14_spacious/file')
 gltf.scene.updateMatrixWorld(true)
 const {buildConstructionItems,SOURCE_HASH}=await import('/src/features/atelier/constructionHistory.ts')
 const items=buildConstructionItems(gltf.scene,SOURCE_HASH)
 const fixed=[];gltf.scene.traverse(node=>{if(node.isMesh&&!node.userData.entityId?.startsWith('construction:'))fixed.push(node.name)})
 console.log(JSON.stringify({count:items.length,groups:items.map(item=>({name:item.name,parts:item.meshes.length,floor:item.floor})),fixed}))
 document.body.innerHTML='';document.body.style.cssText='display:grid;grid-template-columns:repeat(4,1fr);background:#ccc;gap:4px'
 const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true,antialias:true});renderer.setSize(340,260);renderer.outputColorSpace=THREE.SRGBColorSpace
 const names=['Cube','Cube010','Cube011','Cube012','Cube013','Cube014','Plane001','Plane002','Plane003','Plane004','Plane005','Plane006','Plane007','Plane008','Plane009','Plane010','Plane011','Plane012','Plane013','Plane014','Plane015','Plane016','node_0002','node_0010','node_0014','Sphere']
 for(const name of names){const source=gltf.scene.getObjectByName(name);if(!source)continue
 const object=source.clone(true);object.matrixAutoUpdate=false;object.matrix.copy(source.matrixWorld)
 const scene=new THREE.Scene();scene.background=new THREE.Color('#dddddd');scene.add(object,new THREE.HemisphereLight(0xffffff,0x888888,3))
 const box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3())
 const camera=new THREE.PerspectiveCamera(45,340/260,.01,200);camera.position.copy(center).add(new THREE.Vector3(1,.6,1).normalize().multiplyScalar(size.length()*1.35));camera.lookAt(center)
 renderer.render(scene,camera)
 const wrap=document.createElement('div');wrap.style.background='white';wrap.textContent=name;const img=document.createElement('img');img.src=renderer.domElement.toDataURL();img.style.width='100%';wrap.append(img);document.body.append(wrap)
 }
 })
 await page.screenshot({path:'../scratch/scene-detail-contact-sheet.png',fullPage:true})
}finally{await browser.close()}
