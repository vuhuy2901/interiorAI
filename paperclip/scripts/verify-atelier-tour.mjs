import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--use-angle=swiftshader']})
const page=await browser.newPage({viewport:{width:1600,height:1000}})
try {
  const errors=[];page.on('pageerror',error=>errors.push(String(error)))
  await page.goto('http://127.0.0.1:5173/ATL/design-studio')
  await page.waitForFunction(()=>window.__ATELIER_TOUR_STATE__?.floors.length===2,{},{timeout:90000})
  const revision=await page.evaluate(()=>fetch('/api/v1/projects/proj_bedroom_japandi_4x4m').then(r=>r.json()).then(p=>p.revision))
  await page.getByRole('button',{name:'Tham quan',exact:true}).click()
  const panel=page.getByTestId('tour-controls')
  await panel.waitFor()
  let state=await page.evaluate(()=>window.__ATELIER_TOUR_STATE__)
  assert.equal(state.mode,'walk');assert.equal(state.floorId,1);assert(Math.abs(state.position[1]-1.6)<.1)
  const initial=state.position
  console.log('Walk focus',await page.evaluate(()=>document.activeElement?.tagName))
  await page.keyboard.down('w')
  await page.waitForFunction(initial=>{
    const position=window.__ATELIER_TOUR_STATE__?.position
    return position&&Math.hypot(position[0]-initial[0],position[2]-initial[2])>.05
  },initial,{timeout:10000})
  await page.keyboard.up('w')
  state=await page.evaluate(()=>window.__ATELIER_TOUR_STATE__)
  assert(Math.hypot(state.position[0]-initial[0],state.position[2]-initial[2])>.05,'WASD did not move')
  const beforeLook=await page.evaluate(()=>window.__ATELIER_VIEWER_STATE__.cameraFraming)
  const canvas=page.getByTestId('viewport-3d-canvas')
  const rect=await canvas.boundingBox()
  await page.mouse.move(rect.x+rect.width*.7,rect.y+rect.height*.55)
  await page.mouse.down();await page.mouse.move(rect.x+rect.width*.7+40,rect.y+rect.height*.55+15,{steps:6});await page.mouse.up()
  const afterLook=await page.evaluate(()=>window.__ATELIER_VIEWER_STATE__.cameraFraming)
  assert.notDeepEqual(afterLook.target,beforeLook.target)
  assert.equal(afterLook.position[1],beforeLook.position[1])
  await page.screenshot({path:'../scratch/tour-first-person-ground.png'})
  await panel.getByRole('combobox',{name:'Tầng tham quan'}).selectOption('2')
  state=await page.evaluate(()=>window.__ATELIER_TOUR_STATE__)
  assert.equal(state.floorId,2);assert(state.position[1]>4)
  await panel.getByRole('button',{name:'Kéo nhân vật',exact:true}).click()
  state=await page.evaluate(()=>window.__ATELIER_TOUR_STATE__)
  assert.equal(state.mode,'placement');assert(state.avatarVisible)
  const beforeDrag=state.position
  let moved=false
  for(const [dx,dy] of [[35,0],[-35,0],[0,35],[0,-35],[60,20]]){
    state=await page.evaluate(()=>window.__ATELIER_TOUR_STATE__)
    const [x,y]=state.avatarScreen
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:8});await page.mouse.up()
    const after=await page.evaluate(()=>window.__ATELIER_TOUR_STATE__)
    if(Math.hypot(after.position[0]-beforeDrag[0],after.position[2]-beforeDrag[2])>.05){moved=true;break}
  }
  assert(moved,'dragging the visitor did not change position')
  await page.screenshot({path:'../scratch/tour-drag-upper.png'})
  const placed=await page.evaluate(()=>window.__ATELIER_TOUR_STATE__.position)
  await panel.getByRole('button',{name:'Vào góc nhìn thứ nhất',exact:true}).click()
  state=await page.evaluate(()=>window.__ATELIER_TOUR_STATE__)
  assert.equal(state.mode,'walk');assert(!state.avatarVisible)
  assert(Math.hypot(state.position[0]-placed[0],state.position[2]-placed[2])<.01)
  await page.screenshot({path:'../scratch/tour-first-person-upper.png'})
  await page.keyboard.press('Escape')
  await panel.waitFor({state:'hidden'})
  assert.equal((await page.evaluate(()=>window.__ATELIER_TOUR_STATE__)).mode,'inactive')
  await page.getByTestId('construction-history').getByRole('button',{name:'Replay toàn bộ',exact:true}).click()
  assert.equal(await page.evaluate(()=>window.__ATELIER_CONSTRUCTION_STATE__.activeIds.length),3)
  await page.getByRole('button',{name:'Tham quan',exact:true}).click()
  await panel.waitFor()
  assert.equal(await page.evaluate(()=>window.__ATELIER_CONSTRUCTION_STATE__.activeIds.length),0)
  await page.keyboard.press('Escape')
  await panel.waitFor({state:'hidden'})
  assert.equal(await page.evaluate(()=>fetch('/api/v1/projects/proj_bedroom_japandi_4x4m').then(r=>r.json()).then(p=>p.revision)),revision)
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({checks:'first person/WASD, floor switch, actual mouse avatar drag, retained position, Esc, unchanged design',errors},null,2))
} catch(error) {
  await page.screenshot({path:'../scratch/tour-check-failure.png'})
  console.log(await page.evaluate(()=>window.__ATELIER_TOUR_STATE__))
  throw error
} finally {await browser.close()}
