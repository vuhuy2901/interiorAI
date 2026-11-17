// Read-only geometry/material evidence. Prints UTF-8 JSON; does not change scene.
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from '../ui/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../ui/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { buildConstructionItems } from '../ui/src/features/atelier/constructionHistory.ts';

const bytes = fs.readFileSync(process.argv[2]);
const hash = crypto.createHash('sha256').update(bytes).digest('hex');
const jsonLength = bytes.readUInt32LE(12);
const source = JSON.parse(bytes.subarray(20,20+jsonLength).toString('utf8'));
const document = structuredClone(source);
document.images=[]; document.textures=[];
document.materials=(source.materials ?? []).map(material => ({name:material.name,pbrMetallicRoughness:{baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor,roughnessFactor:material.pbrMetallicRoughness?.roughnessFactor,metallicFactor:material.pbrMetallicRoughness?.metallicFactor},doubleSided:material.doubleSided}));
const bin=bytes.subarray(28+jsonLength);
document.buffers=[{uri:'data:application/octet-stream;base64,'+bin.toString('base64'),byteLength:bin.length}];
globalThis.ProgressEvent=class {};
const gltf=await new Promise((resolve,reject)=>new GLTFLoader().parse(JSON.stringify(document),'',resolve,reject));
gltf.scene.updateMatrixWorld(true);
function measure(meshes) {
  const bounds=new THREE.Box3();
  let triangles=0,upM2=0,downM2=0,verticalM2=0,totalM2=0;
  const materials=new Set();
  for(const mesh of meshes){
    bounds.union(new THREE.Box3().setFromObject(mesh));
    for(const material of (Array.isArray(mesh.material)?mesh.material:[mesh.material])) materials.add(material.name);
    const g=mesh.geometry,p=g.attributes.position,index=g.index;
    const count=index?.count ?? p.count;
    for(let i=0;i<count;i+=3){
      const vertices=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld));
      const cross=vertices[1].sub(vertices[0]).cross(vertices[2].sub(vertices[0]));
      const area=cross.length()/2; if(!area)continue;
      const ny=cross.y/(2*area);totalM2+=area;triangles++;
      if(ny>.9)upM2+=area; else if(ny<-.9)downM2+=area; else if(Math.abs(ny)<.1)verticalM2+=area;
    }
  }
  return {mesh_instances:meshes.length,triangles,bounds_min_m:bounds.min.toArray(),bounds_max_m:bounds.max.toArray(),dimensions_m:bounds.getSize(new THREE.Vector3()).toArray(),surface_area_m2:totalM2,up_facing_area_m2:upM2,down_facing_area_m2:downM2,vertical_area_m2:verticalM2,materials:[...materials]};
}
function meshesOf(name){const meshes=[];gltf.scene.getObjectByName(name)?.traverse(node=>{if(node.isMesh)meshes.push(node)});return meshes;}
const all=[];gltf.scene.traverse(node=>{if(node.isMesh)all.push(node)});
const groups=buildConstructionItems(gltf.scene,hash).map(item=>({id:item.id,name:item.name,floor:item.floor,source_nodes:item.parentName,...measure(item.meshes),members:item.meshes.map(mesh=>({name:mesh.name,...measure([mesh])}))}));
const base=['Plane','Cube','Plane001','Plane002','Plane003','node_0010'].map(name=>({name,...measure(meshesOf(name))}));
const known=new Set(buildConstructionItems(gltf.scene,hash).flatMap(item=>item.meshes));
const ungrouped=all.filter(mesh=>!known.has(mesh)).map(mesh=>({name:mesh.name,...measure([mesh])}));
console.log(JSON.stringify({schema:'atelier.scene-audit.v1',asset_hash:hash,units:'metres',source_counts:{scenes:source.scenes?.length??0,nodes:source.nodes?.length??0,meshes:source.meshes?.length??0,materials:source.materials?.length??0,textures:source.textures?.length??0,cameras:source.cameras?.length??0,lights:source.extensions?.KHR_lights_punctual?.lights?.length??0},geometry:measure(all),groups,base,ungrouped,materials:source.materials,extensions:source.extensionsUsed,measurement_limitations:['Triangle surface areas are not surveyed purchase quantities. Overlapping or opposite surfaces may require deduplication.','Source fidelity and group bounds do not certify collision-free circulation, building-code compliance or supplier identities.']},null,2));
