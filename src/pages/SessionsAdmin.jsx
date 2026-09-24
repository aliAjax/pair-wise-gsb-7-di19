// 后台场次与容量：按日期开设场次、调整容量、关闭预约
import {useState} from 'react';
import {isFuture,confirmedTotal,waitlistCount,remaining} from '../booking/capacity';

export default function SessionsAdmin({exhibit,store,onToggle,notify}){
  const {sessions,bookings,addSession,setCapacity,cancelSession}=store;
  const [form,setForm]=useState({date:'',start:'10:00',end:'11:00',capacity:12});
  const [capEdit,setCapEdit]=useState({});
  if(!exhibit)return null;
  if(exhibit.type!=='互动')return <section className="form-panel admin-panel">
    <div className="panel-title"><div><span className="eyebrow">SESSIONS & CAPACITY</span><h2>场次与容量</h2></div></div>
    <p className="empty-hint">「{exhibit.title}」是{exhibit.type}展项，只有互动展项需要按场次预约。</p>
  </section>;

  const closed=exhibit.bookingOpen===false;
  const list=sessions.filter(s=>s.exhibitId===exhibit.id).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
  const add=()=>{
    if(!form.date)return notify('请先选择场次日期');
    if(form.end<=form.start)return notify('结束时间需晚于开始时间');
    addSession(exhibit.id,form);
    notify('场次已添加，访客端同步开放');
  };
  const saveCap=s=>{
    const v=Math.max(0,parseInt(capEdit[s.id]??s.capacity)||0);
    const promoted=setCapacity(s.id,v);
    setCapEdit({...capEdit,[s.id]:undefined});
    notify(promoted?`容量已调整为 ${v}，空位按候补顺序补入 ${promoted} 笔`:`容量已调整为 ${v}，已有确认单不受影响`);
  };

  return <section className="form-panel admin-panel">
    <div className="panel-title"><div><span className="eyebrow">SESSIONS & CAPACITY</span><h2>场次与容量 · {exhibit.title}</h2></div>
      <button className="secondary" onClick={onToggle}>{closed?'恢复预约':'关闭预约'}</button></div>
    {closed&&<p className="warn-line">预约已关闭：未来场次已取消并放回位置，恢复后需重新开设场次。</p>}
    {!closed&&<div className="session-add">
      <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>
      <input type="time" value={form.start} onChange={e=>setForm({...form,start:e.target.value})}/>
      <input type="time" value={form.end} onChange={e=>setForm({...form,end:e.target.value})}/>
      <input type="number" min="1" value={form.capacity} title="容量" onChange={e=>setForm({...form,capacity:e.target.value})}/>
      <button className="primary" onClick={add}>＋ 添加场次</button>
    </div>}
    <div className="session-list">
      {list.length===0&&<p className="empty-hint">还没有场次，先添加一个。</p>}
      {list.map(s=>{
        const conf=confirmedTotal(s.id,bookings),wait=waitlistCount(s.id,bookings),past=!isFuture(s);
        const state=s.status==='已取消'?'已取消':past?'已结束':'开放中';
        return <div className={'session-row '+(s.status==='已取消'?'is-cancelled':past?'is-done':'is-open')} key={s.id}>
          <div className="session-when"><strong>{s.date}</strong><span>{s.start} – {s.end}</span></div>
          <span className={'status '+(s.status==='已取消'?'cancelled':past?'done':'live')}>{state}</span>
          <div className="session-nums">
            <span>确认 {conf}/{s.capacity}</span><span>候补 {wait}</span><span>余位 {remaining(s,bookings)}</span>
            {conf>s.capacity&&<span className="over">确认超出容量，确认单保留不打散</span>}
          </div>
          {s.status==='开放'&&!past&&<>
            <div className="cap-edit">
              <input type="number" min="0" value={capEdit[s.id]??s.capacity} onChange={e=>setCapEdit({...capEdit,[s.id]:e.target.value})}/>
              <button className="secondary" onClick={()=>saveCap(s)}>保存容量</button>
            </div>
            <button className="danger" onClick={()=>{cancelSession(s.id);notify('场次已取消，位置已放回')}}>取消场次</button>
          </>}
        </div>;
      })}
    </div>
  </section>;
}
