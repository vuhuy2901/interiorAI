import type { TourState } from './firstPersonTour'

export function TourControls({state,onFloor,onPlace,onWalk,onExit}:{
  state:TourState;onFloor:(id:number)=>void;onPlace:()=>void;onWalk:()=>void;onExit:()=>void
}) {
  if(state.mode==='inactive'&&!state.message)return null
  return <section className="tour-controls" data-testid="tour-controls" aria-label="Tham quan góc nhìn thứ nhất">
    <div className="tour-controls-heading"><strong>{state.mode==='placement'?'Đặt vị trí nhân vật':'Tham quan góc nhìn thứ nhất'}</strong><button type="button" className="btn btn-sm" onClick={onExit}>Thoát</button></div>
    <label className="field-group"><span>Tầng tham quan</span><select className="field-select" aria-label="Tầng tham quan" value={state.floorId} onChange={event=>onFloor(Number(event.target.value))}>{state.floors.map(floor=><option value={floor.id} key={floor.id}>{floor.name}</option>)}</select></label>
    <p>{state.mode==='placement'?'Giữ chuột trái trên nhân vật màu xanh và kéo tới chỗ trống trên sàn.':'W/A/S/D để đi. Giữ chuột trái và kéo trong khung 3D để nhìn quanh. Esc để thoát.'}</p>
    {state.message&&<div role="status">{state.message}</div>}
    {state.mode==='placement'?<button type="button" className="btn btn-sm btn-primary" onClick={onWalk}>Vào góc nhìn thứ nhất</button>:<button type="button" className="btn btn-sm" onClick={onPlace}>Kéo nhân vật</button>}
  </section>
}
