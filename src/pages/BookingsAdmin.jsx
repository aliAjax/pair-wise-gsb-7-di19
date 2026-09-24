// 后台预约记录：按已确认 / 候补 / 已取消查看，已结束场次留档可查
import {useState} from 'react';
import {isFuture} from '../booking/capacity';

const TABS=['已确认','候补','已取消'];
const fmtTime=t=>new Date(t).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});

export default function BookingsAdmin({exhibit,store,notify}){
  const {sessions,bookings,cancelBooking}=store;
  const [tab,setTab]=useState('已确认');
  const [showPast,setShowPast]=useState(false);
  if(!exhibit)return null;
  if(exhibit.type!=='互动')return <section className="form-panel admin-panel">
    <div className="panel-title"><div><span className="eyebrow">RESERVATIONS</span><h2>预约记录</h2></div></div>
    <p className="empty-hint">「{exhibit.title}」是{exhibit.type}展项，只有互动展项有预约记录。</p>
  </section>;

  const byId=Object.fromEntries(sessions.map(s=>[s.id,s]));
  const mine=bookings.filter(b=>b.exhibitId===exhibit.id);
  const rows=mine.filter(b=>b.status===tab&&(showPast||!byId[b.sessionId]||isFuture(byId[b.sessionId]))).sort((a,b)=>a.createdAt-b.createdAt);
  const cancel=b=>{
    const promoted=cancelBooking(b.id);
    notify(promoted?`已取消该预约，空位按候补顺序补入 ${promoted} 笔`:'预约已取消，位置已放回');
  };

  return <section className="form-panel admin-panel">
    <div className="panel-title"><div><span className="eyebrow">RESERVATIONS</span><h2>预约记录 · {exhibit.title}</h2></div></div>
    <div className="book-tabs">
      {TABS.map(t=><button key={t} className={tab===t?'selected':''} onClick={()=>setTab(t)}>{t}<b>{mine.filter(b=>b.status===t).length}</b></button>)}
    </div>
    <label className="toggle-line"><input type="checkbox" checked={showPast} onChange={e=>setShowPast(e.target.checked)}/> 包含已结束场次的留档记录</label>
    {rows.length===0?<p className="empty-hint">暂无{tab}记录。</p>:
    <table className="book-table"><thead><tr><th>场次</th><th>联系人</th><th>人数</th><th>备注</th><th>提交时间</th><th></th></tr></thead>
      <tbody>{rows.map(b=>{const s=byId[b.sessionId];
        return <tr key={b.id}>
          <td className="mono">{s?`${s.date} ${s.start}–${s.end}`:'—'}{s&&s.status==='已取消'&&<span className="over">（场次已取消）</span>}</td>
          <td>{b.contact}</td><td>{b.size}</td><td>{b.note||'—'}</td>
          <td className="mono">{fmtTime(b.createdAt)}</td>
          <td>{(b.status==='已确认'||b.status==='候补')&&<button className="danger" onClick={()=>cancel(b)}>取消</button>}</td>
        </tr>})}
      </tbody></table>}
  </section>;
}
