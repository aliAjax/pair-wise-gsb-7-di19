import React,{useMemo,useState} from 'react';
import {
  CONFIRMED,WAITLIST,fmtDate,fmtTime,remainingSlots,
} from './logic.js';

// 访客端：只展示“仍开放预约 + 已发布 + 未来 + 有余位”的场次
export default function BookingWidget({exhibit,sessions,bookings,now,onSubmit,onCancelBooking}){
  const visibleSessions=useMemo(()=>sessions
    .filter(s=>s.exhibitId===exhibit.id&&!s.canceled&&s.startTime>now)
    .filter(s=>remainingSlots(bookings,s,now)>0)
    .sort((a,b)=>a.startTime-b.startTime),[sessions,exhibit.id,bookings,now]);

  const days=useMemo(()=>{
    const m=new Map();
    visibleSessions.forEach(s=>{
      const key=new Date(s.startTime).toISOString().slice(0,10);
      if(!m.has(key))m.set(key,[]);
      m.get(key).push(s);
    });
    return [...m.entries()];
  },[visibleSessions]);

  const [picked,setPicked]=useState(null);
  const [form,setForm]=useState({name:'',phone:'',partySize:'',note:''});
  const [result,setResult]=useState(null); // 最近一次提交结果（候补/确认）
  const [error,setError]=useState('');

  if(!exhibit.booking)return null;

  const set=(k,v)=>setForm(f=>({...f,[k]:v}));

  const choose=(s)=>{setPicked(s.id);setError('');};

  const doSubmit=(sessionId,values)=>{
    const r=onSubmit({sessionId,...values});
    if(!r.ok){
      // 余位/冲突之外的校验失败：填写内容全部保留，仅提示
      setError(r.reason);
      return;
    }
    setError('');
    setResult(r);
    if(r.status===CONFIRMED){setForm({name:'',phone:'',partySize:'',note:''});setPicked(null);}
    // 候补：保留填写内容与所选场次，提示换场
  };

  // 带已填内容改报其他场次
  const switchTo=(s)=>{
    setPicked(s.id);setResult(null);setError('');
    doSubmit(s.id,form);
  };

  const cancelMine=(id)=>{
    const r=onCancelBooking(id,{by:'visitor',reason:'访客自行取消'});
    if(r.booking){
      setResult(null);setPicked(null);
      setError(r.promoted.length?`已取消，已有 ${r.promoted.length} 组候补团体递补确认`:'已取消预约');
    }
  };

  return (
    <section className="bk-widget">
      <div className="bk-widget-head">
        <div>
          <span className="eyebrow">TIMED ENTRY · 团体预约</span>
          <h2>选择入场场次</h2>
        </div>
        <span className="bk-badge live">预约开放中</span>
      </div>
      <p className="bk-sub">每场容量有限，约满即止；同一联系人不可同时占用两个重叠场次。</p>

      {days.length===0 && (
        <div className="bk-empty">近期暂无可约场次，请在现场咨询工作人员。</div>
      )}

      <div className="bk-days">
        {days.map(([date,list])=>(
          <div className="bk-day" key={date}>
            <div className="bk-day-name">{fmtDate(list[0].startTime)}</div>
            <div className="bk-slots">
              {list.map(s=>{
                const left=remainingSlots(bookings,s,now);
                const active=picked===s.id;
                return (
                  <button key={s.id} className={'bk-slot'+(active?' on':'')} onClick={()=>choose(s)}>
                    <strong>{fmtTime(s.startTime)}–{fmtTime(s.endTime)}</strong>
                    <small>余位 {left}</small>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {picked && !result && (()=>{
        const s=sessions.find(x=>x.id===picked);
        if(!s)return null;
        const left=remainingSlots(bookings,s,now);
        return (
          <form className="bk-form" onSubmit={e=>{e.preventDefault();doSubmit(picked,form);}}>
            <div className="bk-form-title">
              <strong>{fmtDate(s.startTime)} {fmtTime(s.startTime)}–{fmtTime(s.endTime)}</strong>
              <small>当前余位 {left} 人</small>
            </div>
            <div className="bk-form-grid">
              <label>联系人姓名
                <input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="领队 / 带队老师"/>
              </label>
              <label>联系手机
                <input value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="用于场次变动联系" inputMode="tel"/>
              </label>
              <label>到场人数
                <input value={form.partySize} onChange={e=>set('partySize',e.target.value.replace(/[^\d]/g,''))} placeholder="含联系人" inputMode="numeric"/>
              </label>
              <label className="bk-wide">备注
                <input value={form.note} onChange={e=>set('note',e.target.value)} placeholder="特殊需求可在此说明（选填）"/>
              </label>
            </div>
            {error&&<div className="bk-error">⚠ {error}</div>}
            <div className="bk-form-actions">
              <button type="button" className="bk-ghost" onClick={()=>{setPicked(null);setError('');}}>重新选场</button>
              <button type="submit" className="bk-primary">提交预约</button>
            </div>
          </form>
        );
      })()}

      {result&&result.status===CONFIRMED&&(
        <div className="bk-result ok">
          <div className="bk-result-tag">✓ 预约成功 · 已确认</div>
          <h3>{fmtDate(sessions.find(s=>s.id===result.booking.sessionId)?.startTime)} {fmtTime(sessions.find(s=>s.id===result.booking.sessionId)?.startTime)} 场</h3>
          <p>{result.booking.name} · {result.booking.partySize} 人{result.booking.note?` · 备注：${result.booking.note}`:''}</p>
          <p className="bk-result-note">请提前 10 分钟到展项入口签到。无法到场可在此取消，名额会按候补顺序转给其他团体。</p>
          <div className="bk-form-actions">
            <button className="bk-ghost" onClick={()=>cancelMine(result.booking.id)}>取消预约</button>
            <button className="bk-primary" onClick={()=>setResult(null)}>完成</button>
          </div>
        </div>
      )}

      {result&&result.status===WAITLIST&&(()=>{
        const s=sessions.find(x=>x.id===result.booking.sessionId);
        const wb=bookings.filter(b=>b.sessionId===s.id&&b.status===WAITLIST)
          .sort((a,b)=>a.createdAt-b.createdAt||a.id-b.id);
        const myPos=Math.max(1,wb.findIndex(b=>b.id===result.booking.id)+1);
        return (
          <div className="bk-result wait">
            <div className="bk-result-tag">⏳ 余位不足 · 已为你加入候补（第 {myPos} 位）</div>
            <p className="bk-result-note">
              你填写的信息已保留。有名额空出时会按候补顺序自动确认；也可以现在改报下面仍有余位的场次，信息无需重填。
            </p>
            {result.alternatives.length>0
              ? <div className="bk-alts">
                  <small>可换场次：</small>
                  {result.alternatives.map(a=>(
                    <button key={a.id} className="bk-alt" onClick={()=>switchTo(a)}>
                      {fmtDate(a.startTime)} {fmtTime(a.startTime)}–{fmtTime(a.endTime)} · 余位 {remainingSlots(bookings,a,now)}
                    </button>
                  ))}
                </div>
              : <p className="bk-result-note">该展项暂无可换场次，可稍后再试。</p>}
            <div className="bk-form-actions">
              <button className="bk-ghost" onClick={()=>cancelMine(result.booking.id)}>取消候补</button>
              <button className="bk-primary" onClick={()=>setResult(null)}>保留候补</button>
            </div>
          </div>
        );
      })()}
    </section>
  );
}
