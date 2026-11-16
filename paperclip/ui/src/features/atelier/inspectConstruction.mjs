import fs from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
const input = fs.readFileSync(process.argv[2]);
const json = JSON.parse(input.subarray(20,20+input.readUInt32LE(12)).toString());
json.images=[]; json.textures=[]; json.materials=[];
for (const mesh of json.meshes) for (const p of mesh.primitives) delete p.material;
const binOffset=20+input.readUInt32LE(12);
const bin=input.subarray(binOffset+8);
json.buffers=[{uri:'data:application/octet-stream;base64,'+bin.toString('base64'),byteLength:bin.length}];
globalThis.ProgressEvent=class {};
new GLTFLoader().parse(JSON.stringify(json),'', gltf=>{
 gltf.scene.updateMatrixWorld(true);
 for(const parent of gltf.scene.getObjectByName('RootNode').children){
 const box=new THREE.Box3().setFromObject(parent); const size=box.getSize(new THREE.Vector3());
 console.log(parent.name, 'min',box.min.toArray().map(n=>n.toFixed(2)).join(','),'max',box.max.toArray().map(n=>n.toFixed(2)).join(','),'size',size.toArray().map(n=>n.toFixed(2)).join(','));
 }
},console.error);
