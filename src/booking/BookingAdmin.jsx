import React,{useMemo,useState} from 'react';
import {
  CONFIRMED,WAITLIST,CANCELED,fmtDate,fmtTime,fmtRange,
  waitlistQueue,statusText,isEndedSession,isOngoingSession,
} from './logic.js';

// 后台：按展项维护日期/场次容量，查看已确认、候补、取消记录
export default function BookingAdmin({
  exhibits,selectedId,onSelect,
  sessions,bookings,now,sessionStats,
  onAddSession,onChangeCapacity,onCancelSession,onToggleBooking,onCancelBooking,
}){
  const current=exhibits.find(x=>x.id===selectedId)||exhibits[0];
  const [date,setDate]=useState(defaultDate(1));
  const [start,setStart]=useState('10:00');
  const [end,setEnd]=useState('10:45');
  const [capacity,setCapacity]=useState('12');
  const [formError,setFormError]=useState('');
  const [formOk,setFormOk]=useState('');
  const [recordFilter,setRecordFilter]=useState('全部');
  const [editingCap,setEditingCap]=useState({});

  function defaultDate(offset){
    const d=new Date();d.setDate(d.getDate()+offset);
    return d.toISOString().slice(0,10);
  }

  const exhibitSessions=useMemo(
    ()=>sessions.filter(s=>s.exhibitId===current?.id).sort((a,b)=>a.startTime-b.startTime),
    [sessions,current]
  );
  const exhibitBookings=useMemo(
    ()=>bookings.filter(b=>exhibitSessions.some(s=>s.id===b.sessionId)),
    [bookings,exhibitSessions]
  );

  const grouped=useMemo(()=>{
    const m=new Map();
    exhibitSessions.forEach(s=>{
      const key=new Date(s.startTime).toISOString().slice(0,10);
      if(!m.has(key))m.set(key,[]);
      m.get(key).push(s);
    });
    return [...m.entries()];
  },[exhibitSessions]);

  const totals=useMemo(()=>({
    confirmed:exhibitBookings.filter(b=>b.status===CONFIRMED).length,
    waitlist:exhibitBookings.filter(b=>b.status===WAITLIST).length,
    canceled:exhibitBookings.filter(b=>b.status===CANCELED).length,
  }),[exhibitBookings]);

  const submitSession=()=>{
    const r=onAddSession(current.id,{date,startTime:start,endTime:end,capacity});
    if(!r.ok){setFormError(r.reason);setFormOk('');return;}
    setFormError('');setFormOk(`已排入 ${fmtRange(r.session)}，容量 ${r.session.capacity} 人`);
  };

  const saveCap=(s)=>{
    const v=editingCap[s.id];
    if(v===undefined||Number(v)===s.capacity){setEditingCap(x=>({...x,[s.id]:undefined}));return;}
    const r=onChangeCapacity(s.id,Number(v));
    if(!r.ok){setFormError(r.reason);setFormOk('');return;}
    setFormError('');
    setEditingCap(x=>({...x,[s.id]:undefined}));
  };

  const sessionOf=id=>sessions.find(s=>s.id===id);
  const filteredRecords=exhibitBookings
    .filter(b=>recordFilter==='全部'||b.status===recordFilter)
    .sort((a,b)=>b.createdAt-a.createdAt);

  return (
    <div className="content bk-admin">
      <section className="list-pane">
        <div className="list-head">
          <div><h2>互动展项预约</h2><span>{exhibits.filter(x=>x.booking).length} 个展项开放预约</span></div>
        </div>
        <div className="filters">
          <span className="bk-list-hint">关闭预约后，未来场次将全部取消</span>
        </div>
        <div className="exhibit-list">
          {exhibits.map(x=>{
            const future=sessions.filter(s=>s.exhibitId===x.id&&!s.canceled&&s.startTime>now).length;
            const wl=bookings.filter(b=>{
              const s=sessions.find(y=>y.id===b.sessionId);
              return s&&s.exhibitId===x.id&&b.status===WAITLIST;
            }).length;
            return (
              <div className={'exhibit-row bk-ex-row'+(selectedId===x.id?' chosen':'')} key={x.id}>
                <button className="bk-ex-main" onClick={()=>onSelect(x.id)}>
                  <span className="thumb" style={{background:x.color}}>{String(x.id).padStart(2,'0')}</span>
                  <span className="row-copy">
                    <strong>{x.title}</strong>
                    <small>{x.room} · 未来场次 {future}{wl?` · 候补 ${wl} 组`:''}</small>
                  </span>
                  <span className={'status '+(x.booking?'live':'draft')}>{x.booking?'预约中':'已关闭'}</span>
                </button>
                <label className="bk-switch" title={x.booking?'关闭预约':'开放预约'}>
                  <input type="checkbox" checked={!!x.booking} onChange={e=>onToggleBooking(x.id,e.target.checked)}/>
                  <span className="bk-slider"></span>
                </label>
              </div>
            );
          })}
        </div>
      </section>

      <section className="form-panel bk-schedule">
        {current&&<>
          <div className="panel-title">
            <div>
              <span className="eyebrow">SCHEDULE & CAPACITY</span>
              <h2>{current.title} · 场次安排</h2>
            </div>
            <span className={'status '+(current.booking?'live':'draft')}>{current.booking?'预约开放':'预约关闭'}</span>
          </div>

          <div className="bk-stat-row">
            <div className="bk-stat"><b>{totals.confirmed}</b><small>已确认单</small></div>
            <div className="bk-stat"><b>{totals.waitlist}</b><small>候补中</small></div>
            <div className="bk-stat"><b>{totals.canceled}</b><small>已取消（留档）</small></div>
          </div>

          {current.booking&&<div className="bk-add-session">
            <div className="preview-heading"><span>新增场次</span>
              {formError&&<span className="bk-form-err">{formError}</span>}
              {formOk&&<span className="bk-form-ok">{formOk}</span>}
            </div>
            <div className="bk-add-grid">
              <label>日期<input type="date" value={date} min={defaultDate(0)} onChange={e=>setDate(e.target.value)}/></label>
              <label>开始<input type="time" value={start} onChange={e=>setStart(e.target.value)}/></label>
              <label>结束<input type="time" value={end} onChange={e=>setEnd(e.target.value)}/></label>
              <label>容量（人）<input value={capacity} inputMode="numeric" onChange={e=>setCapacity(e.target.value.replace(/[^\d]/g,''))}/></label>
              <button className="primary" onClick={submitSession}>排入</button>
            </div>
            <small className="hint">调低容量不会取消已确认单；空出的名额会按候补先后自动补入。</small>
          </div>}

          <div className="bk-days-admin">
            {grouped.length===0&&<div className="bk-empty">还没有排场次。开放预约后按日期添加场次与容量。</div>}
            {grouped.map(([d,list])=>(
              <div className="bk-day-admin" key={d}>
                <div className="bk-day-head">{fmtDate(list[0].startTime)}</div>
                {list.map(s=>{
                  const st=sessionStats.get(s.id)||{taken:0,waitlistCount:0,remaining:0,confirmedCount:0};
                  const ended=isEndedSession(s,now),ongoing=isOngoingSession(s,now);
                  const over=s.capacity>0&&st.taken>s.capacity;
                  const capDraft=editingCap[s.id];
                  return (
                    <div className={'bk-sess-card '+(s.canceled?'canceled':ended?'ended':'')} key={s.id}>
                      <div className="bk-sess-time">
                        <strong>{fmtTime(s.startTime)}–{fmtTime(s.endTime)}</strong>
                        {s.canceled?<span className="tag tag-cancel">已取消</span>
                          :ended?<span className="tag tag-end">已结束</span>
                          :ongoing?<span className="tag tag-live">进行中</span>
                          :<span className="tag tag-future">未开始</span>}
                      </div>
                      <div className="bk-sess-cap">
                        <label>容量
                          {capDraft!==undefined
                            ?<input value={capDraft} onChange={e=>setEditingCap(x=>({...x,[s.id]:e.target.value.replace(/[^\d]/g,'')}))}/>
                            :<b>{s.capacity}</b>} 人
                        </label>
                        <small className={over?'over':''}>
                          已确认 {st.taken} 人 / {st.confirmedCount} 单{over?' · 容量下调前的确认单保留':''}
                        </small>
                        <small>候补 {st.waitlistCount} 组 · 余位 {Math.max(0,s.capacity-st.taken)}</small>
                        <div className="bk-cap-actions">
                          {capDraft!==undefined
                            ?<><button className="bk-mini primary" onClick={()=>saveCap(s)}>保存</button>
                              <button className="bk-mini" onClick={()=>setEditingCap(x=>({...x,[s.id]:undefined}))}>放弃</button></>
                            :!s.canceled&&!ended&&<button className="bk-mini" onClick={()=>setEditingCap(x=>({...x,[s.id]:String(s.capacity)}))}>调整容量</button>}
                        </div>
                      </div>
                      {!s.canceled&&!ended&&(
                        <button className="bk-cancel-sess" onClick={()=>{
                          if(confirm(`取消 ${fmtRange(s)} 场次？该场未来的确认与候补将全部取消并留档。`))onCancelSession(s.id);
                        }}>取消场次</button>
                      )}
                      {s.canceled&&s.cancelReason&&<small className="bk-cancel-reason">{s.cancelReason}</small>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="bk-records">
            <div className="preview-heading">
              <span>预约记录（含已结束场次留档）</span>
              <div className="filters bk-rec-filters">
                {['全部',CONFIRMED,WAITLIST,CANCELED].map(f=>(
                  <button key={f} className={recordFilter===f?'selected':''} onClick={()=>setRecordFilter(f)}>
                    {f==='全部'?f:statusText(f)}
                  </button>
                ))}
              </div>
            </div>
            <table className="bk-table">
              <thead><tr><th>状态</th><th>场次</th><th>联系人</th><th>人数</th><th>备注</th><th></th></tr></thead>
              <tbody>
                {filteredRecords.map(b=>{
                  const s=sessionOf(b.sessionId);
                  const wlPos=b.status===WAITLIST
                    ?waitlistQueue(bookings,b.sessionId).findIndex(x=>x.id===b.id)+1:0;
                  return (
                    <tr key={b.id} className={s?.canceled?'row-canceled':''}>
                      <td><span className={'dot dot-'+b.status}></span>{statusText(b.status)}
                        {b.status===WAITLIST&&wlPos>0&&<em> 第 {wlPos} 位</em>}
                        {b.promotedAt&&<em> · 候补递补</em>}
                      </td>
                      <td>{s?fmtRange(s):'场次已删除'}</td>
                      <td>{b.name}<small className="bk-phone">{b.phone}</small></td>
                      <td>{b.partySize}</td>
                      <td className="bk-note-cell">{b.note||'—'}{b.cancelReason?<small className="bk-cancel-reason">取消原因：{b.cancelReason}</small>:null}</td>
                      <td>{b.status!==CANCELED&&!s?.canceled&&!isEndedSession(s,now)&&(
                        <button className="bk-mini" onClick={()=>{
                          if(confirm('取消这张预约？释放的名额将按候补顺序递补。'))onCancelBooking(b.id,{by:'staff',reason:'工作人员取消'});
                        }}>取消</button>
                      )}</td>
                    </tr>
                  );
                })}
                {filteredRecords.length===0&&<tr><td colSpan={6} className="bk-empty-cell">暂无记录</td></tr>}
              </tbody>
            </table>
          </div>
        </>}
      </section>
    </div>
  );
}
