import { useEffect, useState } from 'react'
import { commandEvent, stateEvent, constructionKey, type ConstructionState } from './constructionHistory'

export function ConstructionHistoryPanel({projectId,hash,selectedId,onSelect}:{projectId:string;hash:string;selectedId:string|null;onSelect:(id:string)=>void}) {
  const key=constructionKey(projectId,hash)
  const [state,setState]=useState<ConstructionState>({history:[],pending:[]})
  useEffect(()=>{
    setState({history:[],pending:[]})
    const listener=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail.key===key)setState(detail)}
    window.addEventListener(stateEvent,listener)
    window.dispatchEvent(new CustomEvent(commandEvent,{detail:{key,action:'state'}}))
    return ()=>window.removeEventListener(stateEvent,listener)
  },[key])
  const command=(action:string,ids?:string[])=>window.dispatchEvent(new CustomEvent(commandEvent,{detail:{key,action,ids}}))
  const activeItems=new Set((state.workers || []).flatMap(worker=>worker.itemId?[worker.itemId]:[]))
  return <section className="inspector-section" data-testid="construction-history">
    <div className="inspector-section-header">Lịch sử ({state.history.length})</div>
    <div className="inspector-section-body">
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-sm btn-primary" disabled={!!state.active||!state.history.length} onClick={()=>command('replay',state.history.map(item=>item.id))}>Replay toàn bộ</button>
        <button className="btn btn-sm" disabled={!state.active} onClick={()=>command('pause')}>{state.paused?'Tiếp tục':'Tạm dừng'}</button>
        <button className="btn btn-sm" disabled={!state.active} onClick={()=>command('stop')}>Dừng</button>
      </div>
      <div className="construction-speed" role="group" aria-label="Tốc độ thi công">
        <span>Tốc độ</span>
        {([1,2,5] as const).map(speed=><button type="button" className={`btn btn-sm ${(state.speed || 1)===speed?'btn-primary':''}`} key={speed} aria-pressed={(state.speed || 1)===speed} onClick={()=>window.dispatchEvent(new CustomEvent(commandEvent,{detail:{key,action:'speed',speed}}))}>{speed}×</button>)}
      </div>
      {state.error&&<div role="alert">{state.error}</div>}
      {[...state.history,...state.pending].map((item,index)=><button type="button" key={item.id} className={`btn ${selectedId===item.id?'btn-soft':''}`} aria-pressed={selectedId===item.id} onClick={()=>onSelect(item.id)}>
        <span className="text-left">{index+1}. {item.name}<br/><small>Tầng {item.floor} · {activeItems.has(item.id)?'Đang thi công':index<state.history.length?'Đã lắp đặt':'Chờ thi công'}</small></span>
      </button>)}
      {!state.history.length&&!state.pending.length&&!state.error&&<span>Đang tải lịch sử…</span>}
    </div>
  </section>
}
