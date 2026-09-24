// 访客预约页：只展示仍开放且有位置的场次，提交失败保留填写内容
import {useState} from 'react';
import {isOpen,remaining} from '../booking/capacity';

export default function VisitorBooking({exhibit,store,notify}){
  const {sessions,bookings,submitBooking}=store;
  const [showFull,setShowFull]=useState(false);
  const [picked,setPicked]=useState(null);
  const [form,setForm]=useState({contact:'',size:2,note:''});
  const [error,setError]=useState(null); // {type,msg}
  const list=sessions.filter(s=>s.exhibitId===exhibit.id&&isOpen(s));
  const available=list.filter(s=>remaining(s,bookings)>0);
  const full=list.filter(s=>remaining(s,bookings)===0);
  const shown=showFull?list:available;
  const pickedSession=sessions.find(s=>s.id===picked);
  const canWaitlist=pickedSession&&remaining(pickedSession,bookings)===0;

  const submit=asWaitlist=>{
    if(!form.contact.trim())return setError({type:'form',msg:'请填写联系人姓名'});
    const size=Math.max(1,parseInt(form.size)||1);
    const r=submitBooking({sessionId:picked,contact:form.contact,size,note:form.note},asWaitlist);
    if(r.ok){
      setError(null);setPicked(null);setForm({contact:'',size:2,note:''});
      notify(r.status==='候补'?'已加入候补，空出位置时按顺序补入':`预约成功，已为 ${form.contact} 确认 ${size} 个位置`);
      return;
    }
    // 失败时表单内容原样保留，只提示原因
    if(r.reason==='full')setError({type:'full',msg:`该场次余位不足（仅剩 ${r.remaining} 位），请换一场、减少人数，或加入候补。`});
    else if(r.reason==='conflict')setError({type:'conflict',msg:`「${form.contact}」已约 ${r.conflict.session.date} ${r.conflict.session.start} 的场次，重叠时段不能占两处。`});
    else setError({type:'closed',msg:'该场次已停止预约，请换一场。'});
  };

  return <div className="booking">
    <span className="eyebrow">BOOK A SLOT</span>
    <h2>预约场次</h2>
    {list.length===0?<p className="empty-hint">近期场次已约满或暂未开放，改天再来看看。</p>:<>
      <div className="slot-list">
        {shown.map(s=>{const rem=remaining(s,bookings);
          return <button key={s.id} className={'slot'+(picked===s.id?' picked':'')+(rem===0?' full':'')} onClick={()=>{setPicked(s.id);setError(null)}}>
            <strong>{s.date}</strong><span>{s.start} – {s.end}</span>
            <em>{rem===0?'已满 · 可候补':`余 ${rem} 位`}</em>
          </button>})}
      </div>
      {full.length>0&&!showFull&&<button className="link" onClick={()=>setShowFull(true)}>查看已满场次（可加入候补）→</button>}
      {pickedSession&&<div className="book-form">
        <div className="two">
          <label>联系人<input value={form.contact} placeholder="姓名" onChange={e=>setForm({...form,contact:e.target.value})}/></label>
          <label>人数<input type="number" min="1" value={form.size} onChange={e=>setForm({...form,size:e.target.value})}/></label>
        </div>
        <label>备注<textarea rows="2" value={form.note} placeholder="团体导览、轮椅需求等（选填）" onChange={e=>setForm({...form,note:e.target.value})}/></label>
        {error&&<p className="form-error">{error.msg}</p>}
        <div className="book-actions">
          <button className="primary" onClick={()=>submit(false)}>提交预约</button>
          {(canWaitlist||error?.type==='full')&&<button className="secondary" onClick={()=>submit(true)}>加入候补</button>}
        </div>
      </div>}
    </>}
  </div>;
}
