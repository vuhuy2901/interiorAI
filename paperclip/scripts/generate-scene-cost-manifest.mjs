// Reproducible BOQ identities from the same inspected groups used by the viewer.
import fs from 'node:fs'
import crypto from 'node:crypto'
import { GLTFLoader } from '../ui/node_modules/three/examples/jsm/loaders/GLTFLoader.js'
import { buildConstructionItems } from '../ui/src/features/atelier/constructionHistory.ts'

const input=fs.readFileSync(process.argv[2])
const hash=crypto.createHash('sha256').update(input).digest('hex')
const length=input.readUInt32LE(12),json=JSON.parse(input.subarray(20,20+length).toString())
json.images=[];json.textures=[];json.materials=[]
for(const mesh of json.meshes)for(const primitive of mesh.primitives)delete primitive.material
const bin=input.subarray(28+length)
json.buffers=[{uri:'data:application/octet-stream;base64,'+bin.toString('base64'),byteLength:bin.length}]
globalThis.ProgressEvent=class {}
const gltf=await new Promise((resolve,reject)=>new GLTFLoader().parse(JSON.stringify(json),'',resolve,reject))
gltf.scene.updateMatrixWorld(true)
// Restore source material names for the mixed wall/window selector.
gltf.scene.traverse(node=>{if(node.isMesh&&node.name.includes('node_0010_Material004'))node.material.name='Material.004'})
const items=buildConstructionItems(gltf.scene,hash).map(item=>({id:item.id,name:item.name,floor:item.floor,quantity:1,unit:'bộ',category:'furniture',dimensions_mm:item.dimensionsMm.map(Math.round),source_nodes:item.parentName}))
for(const [id,name,nodes,category] of [
 ['surface-floor','Hoàn thiện sàn hai tầng',['Plane','Cube'],'floor_tile_wood'],
 ['surface-wall','Hoàn thiện tường hai tầng',['Plane001','Plane002','Plane003','node_0010'],'paint'],
 ['installation','Nhân công lắp đặt toàn cảnh',[],'labor'],
])items.push({id:'construction:'+id,name,floor:0,quantity:1,unit:'gói',category,dimensions_mm:[],source_nodes:nodes.join(', ')})
const output={version:1,asset_hash:hash,source_name:'The Interior 14 — Spacious',items}
// Print the exact artifact; caller applies it as a reviewed repository patch.
console.log(JSON.stringify(output,null,2))
