import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';
import './booking/booking.css';
import {useBookings} from './booking/useBookings.js';
import BookingAdmin from './booking/BookingAdmin.jsx';
import BookingWidget from './booking/BookingWidget.jsx';
import {loadExhibits,saveExhibits} from './booking/storage.js';
import {CONFIRMED} from './booking/logic.js';

const seed=[{id:1,title:'潮汐之后',room:'A01 · 主展厅',type:'装置',desc:'一件记录海岸线变化的沉浸式影像装置。',audio:'https://example.com/audio.mp3',status:'已发布',color:'#e6b45d',booking:false},{id:2,title:'未寄出的信',room:'B02 · 纸上时间',type:'档案',desc:'来自三代人的手写信件与声音档案。',audio:'',status:'草稿',color:'#ef8f84',booking:false},{id:3,title:'柔软的边界',room:'C01 · 新媒介',type:'互动',desc:'观众的移动会改变墙面上的光影。团体到场前请先预约场次。',audio:'',status:'已发布',color:'#83b9b1',booking:true}];
const load=()=>{try{return loadExhibits(seed)}catch{return seed}};

function App(){
  const [exhibits,setExhibits]=useState(load);
  const [selected,setSelected]=useState(1);
  const [view,setView]=useState('edit'); // edit | visitor | detail
  const [tab,setTab]=useState('content'); // content | bookings
  const [filter,setFilter]=useState('全部');
  const [form,setForm]=useState({title:'',room:'',type:'互动',desc:'',audio:''});
  const [notice,setNotice]=useState('');
  const flash=(msg)=>{setNotice(msg);clearTimeout(flash._t);flash._t=setTimeout(()=>setNotice(''),3200);};

  // 预约：场次容量 + 预约记录独立于展项页面内容维护
  const booking=useBookings(exhibits);

  useEffect(()=>saveExhibits(exhibits),[exhibits]);
  const visible=useMemo(()=>filter==='全部'?exhibits:exhibits.filter(x=>x.status===filter),[exhibits,filter]);
  const current=exhibits.find(x=>x.id===selected)||exhibits[0];

  const update=(k,v)=>setExhibits(exhibits.map(x=>x.id===current.id?{...x,[k]:v}:x));

  const add=()=>{
    if(!form.title.trim())return;
    const item={...form,id:Date.now(),status:'草稿',
      color:['#e6b45d','#ef8f84','#83b9b1','#9ba7dc'][exhibits.length%4],
      booking:form.type==='互动'};
    setExhibits([...exhibits,item]);setSelected(item.id);
    setForm({title:'',room:'',type:'互动',desc:'',audio:''});
    flash(item.booking?'互动展项已保存为草稿，并默认开放预约':'展项已保存为草稿');
  };

  // 发布 / 撤回发布：撤回时若开放预约，未来场次一并取消（已结束记录留档）
  const publish=()=>{
    if(current.status==='已发布'){
      update('status','草稿');
      if(current.booking){
        const n=booking.closeFutureSessions(current.id,'展项撤回发布，未来场次取消');
        flash(`已撤回发布；未来 ${n.sessions} 个场次、${n.bookings} 张预约已取消并留档`);
      }else flash('已撤回发布');
    }else{
      update('status','已发布');flash('已发布，访客预览已更新');
    }
  };

  // 预约开关：关闭即取消未来场次并把位置相关预约全部留档取消
  const toggleBooking=(id,open)=>{
    setExhibits(exhibits.map(x=>x.id===id?{...x,booking:open}:x));
    if(open){flash('已开放预约，可在右侧安排日期、场次与容量');return;}
    const n=booking.closeFutureSessions(id,'关闭预约，未来场次取消');
    flash(`已关闭预约；未来 ${n.sessions} 个场次取消，${n.bookings} 张预约留档，已结束记录不受影响`);
  };

  const submitBooking=(payload)=>{
    const r=booking.submitBooking(payload);
    if(!r.ok){return r;}
    if(r.status===CONFIRMED)flash('预约成功，已发送确认信息（示意）');
    return r;
  };
  const cancelBookingById=(id,opts)=>{
    const r=booking.cancelBookingById(id,opts);
    if(r.booking)flash(r.promoted.length?`已取消；${r.promoted.length} 组候补按顺序自动确认`:'预约已取消');
    return r;
  };
  const changeCapacity=(sid,cap)=>{
    const r=booking.changeCapacity(sid,cap);
    if(r.ok)flash(r.promoted.length?`容量已调整，${r.promoted.length} 组候补按顺序自动确认`:'容量已调整，已确认单保持不变');
    else flash(r.reason||'容量无效');
    return r;
  };

  const exportData=()=>{
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify({
      exhibits,sessions:booking.sessions,bookings:booking.bookings,
    },null,2)],{type:'application/json'}));
    a.download='exhibition-guide.json';a.click();flash('已导出展项与预约数据');
  };

  // ---------- 访客：展项列表 ----------
  if(view==='visitor')return <div className="visitor">
    <header>
      <div className="brand"><span className="mark">M</span><span>潮汐美术馆</span></div>
      <button className="ghost" onClick={()=>setView('edit')}>返回工作台</button>
    </header>
    <main className="visitor-main">
      <span className="eyebrow">VISITOR GUIDE / 2026</span>
      <h1>沿着作品，<em>走进</em>另一种时间。</h1>
      <p className="lead">当你靠近一件作品，它的故事就开始流动。互动展项可提前预约团体场次，到场即入。</p>
      <div className="visitor-grid">
        {exhibits.filter(x=>x.status==='已发布').map(x=>
          <article className="visitor-card" key={x.id} onClick={()=>{setSelected(x.id);setView('detail')}}>
            <div className="art" style={{background:x.color}}><span>{String(x.id).padStart(2,'0')}</span><i>↗</i></div>
            <div className="card-meta">
              <small>{x.room}{x.booking&&<em className="bk-chip">可预约场次</em>}</small>
              <h3>{x.title}</h3><p>{x.desc}</p>
            </div>
          </article>)}
      </div>
    </main>
    {notice&&<div className="toast">{notice}</div>}
  </div>;

  // ---------- 访客：展项详情（含预约） ----------
  if(view==='detail'&&current)return <div className="visitor">
    <header>
      <div className="brand"><span className="mark">M</span><span>潮汐美术馆 · 导览</span></div>
      <button className="ghost" onClick={()=>setView('visitor')}>← 全部展项</button>
    </header>
    <main className="detail">
      <div className="detail-art" style={{background:current.color}}><span>{String(current.id).padStart(2,'0')}</span></div>
      <div className="detail-copy">
        <span className="eyebrow">{current.room} / {current.type}</span>
        <h1>{current.title}</h1>
        <p>{current.desc}</p>
        {current.audio&&<button className="audio" onClick={()=>flash('正在播放导览音频…')}>▶ 播放语音导览</button>}
        {current.booking&&<BookingWidget
          exhibit={current}
          sessions={booking.sessions}
          bookings={booking.bookings}
          now={booking.now}
          onSubmit={submitBooking}
          onCancelBooking={cancelBookingById}
        />}
        <div className="qr">
          <div className="qr-box">▦</div>
          <div><strong>分享这个展项</strong><small>扫描二维码，在手机上继续阅读</small></div>
        </div>
      </div>
    </main>
    {notice&&<div className="toast">{notice}</div>}
  </div>;

  // ---------- 工作台 ----------
  return <div className="app">
    <aside>
      <div className="brand"><span className="mark">M</span><span>展览工作台</span></div>
      <div className="side-label">当前项目</div>
      <div className="project">
        <span className="project-dot"></span>
        <div><strong>潮汐之后</strong><small>2026 春季展</small></div>
        <span>⌄</span>
      </div>
      <nav>
        <button className={tab==='content'?'active':''} onClick={()=>setTab('content')}>
          ▧ <span>展项内容</span><b>{exhibits.length}</b>
        </button>
        <button className={tab==='bookings'?'active':''} onClick={()=>setTab('bookings')}>
          ◷ <span>时段预约</span>
          <b className={tab==='bookings'?'':'nav-dot'}>
            {booking.bookings.filter(b=>b.status==='waitlist').length}
          </b>
        </button>
        <button>⌁ <span>展厅动线</span></button>
        <button>◉ <span>二维码</span></button>
      </nav>
      <div className="side-foot"><button>⚙ 设置</button><small>已自动保存 · 刚刚</small></div>
    </aside>

    <main className="workspace">
      <header className="topbar">
        <div>
          <span className="eyebrow">{tab==='content'?'EXHIBITION BUILDER':'GROUP BOOKING'}</span>
          <h1>{tab==='content'?'展项内容':'时段预约'}</h1>
        </div>
        <div className="top-actions">
          <button className="secondary" onClick={exportData}>↓ 导出 JSON</button>
          <button className="secondary" onClick={()=>setView('visitor')}>◉ 访客预览</button>
          {tab==='content'&&<button className="primary" onClick={publish}>
            {current?.status==='已发布'?'撤回发布':'发布更新'} <span>↗</span>
          </button>}
        </div>
      </header>

      {tab==='bookings'
        ? <BookingAdmin
            exhibits={exhibits}
            selectedId={current?.id}
            onSelect={setSelected}
            sessions={booking.sessions}
            bookings={booking.bookings}
            now={booking.now}
            sessionStats={booking.sessionStats}
            onAddSession={booking.addSession}
            onChangeCapacity={changeCapacity}
            onCancelSession={(sid)=>{const r=booking.cancelSession(sid);if(r.ok)flash('场次已取消，相关预约已留档');else flash(r.reason);}}
            onToggleBooking={toggleBooking}
            onCancelBooking={cancelBookingById}
          />
        : <div className="content">
            <section className="list-pane">
              <div className="list-head">
                <div><h2>全部展项</h2><span>{exhibits.length} 个展项</span></div>
                <button className="add-btn" onClick={()=>document.querySelector('.form-panel').scrollIntoView({behavior:'smooth'})}>＋ 添加展项</button>
              </div>
              <div className="filters">{['全部','已发布','草稿'].map(x=>
                <button className={filter===x?'selected':''} onClick={()=>setFilter(x)} key={x}>{x}</button>)}
              </div>
              <div className="exhibit-list">
                {visible.map(x=>
                  <button className={'exhibit-row '+(selected===x.id?'chosen':'')} key={x.id} onClick={()=>setSelected(x.id)}>
                    <span className="thumb" style={{background:x.color}}>{String(x.id).padStart(2,'0')}</span>
                    <span className="row-copy">
                      <strong>{x.title}</strong>
                      <small>{x.room} · {x.type}{x.booking?' · 可预约':''}</small>
                    </span>
                    <span className={'status '+(x.status==='已发布'?'live':'draft')}>{x.status}</span>
                    <span className="chev">›</span>
                  </button>)}
              </div>
            </section>

            <section className="form-panel">
              <div className="panel-title">
                <div><span className="eyebrow">EDIT EXHIBIT</span><h2>编辑展项</h2></div>
                <span className={'status '+(current?.status==='已发布'?'live':'draft')}>{current?.status}</span>
              </div>
              {current&&<div className="editor">
                <label>展项标题<input value={current.title} onChange={e=>update('title',e.target.value)}/></label>
                <div className="two">
                  <label>所在展厅<input value={current.room} onChange={e=>update('room',e.target.value)}/></label>
                  <label>内容类型
                    <select value={current.type} onChange={e=>update('type',e.target.value)}>
                      <option>装置</option><option>档案</option><option>互动</option><option>绘画</option>
                    </select>
                  </label>
                </div>
                <label>展项介绍<textarea rows="5" value={current.desc} onChange={e=>update('desc',e.target.value)}/></label>
                <label>语音导览 URL<input value={current.audio} placeholder="https://…" onChange={e=>update('audio',e.target.value)}/>
                  <small className="hint">访客扫描二维码后可播放</small>
                </label>
                {current.type==='互动'&&<div className={'bk-toggle-row '+(current.booking?'on':'')}>
                  <div><strong>团体时段预约</strong><small>{current.booking?'开放中：访客可按场次预约，关闭将取消未来场次':'已关闭：仅展示介绍页'}</small></div>
                  <label className="bk-switch">
                    <input type="checkbox" checked={!!current.booking} onChange={e=>toggleBooking(current.id,e.target.checked)}/>
                    <span className="bk-slider"></span>
                  </label>
                </div>}
                <div className="preview-block">
                  <div className="preview-heading"><span>二维码预览</span><button onClick={()=>flash('二维码链接已复制')}>复制链接</button></div>
                  <div className="qr-preview">
                    <div className="qr-box big">▦</div>
                    <div><strong>展项-{String(current.id).padStart(3,'0')}</strong><small>/guide/{current.id}</small></div>
                  </div>
                </div>
              </div>}
              <div className="new-form">
                <div className="panel-title"><div><span className="eyebrow">NEW ENTRY</span><h2>快速添加展项</h2></div></div>
                <div className="two">
                  <input placeholder="展项标题" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
                  <input placeholder="展厅编号" value={form.room} onChange={e=>setForm({...form,room:e.target.value})}/>
                </div>
                <textarea placeholder="一句话介绍…" rows="2" value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})}/>
                <button className="primary full" onClick={add}>保存新展项</button>
              </div>
            </section>
          </div>}
    </main>
    {notice&&<div className="toast">{notice}</div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
