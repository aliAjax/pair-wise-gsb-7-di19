// 容量判定：纯函数，不依赖界面与存储，单独维护
export const ACTIVE=['已确认','候补'];

export const toMinutes=t=>{const[h,m]=t.split(':').map(Number);return h*60+m};
export const sessionEnd=s=>new Date(`${s.date}T${s.end}:00`);
export const isFuture=(s,now=new Date())=>sessionEnd(s)>now;
export const isOpen=(s,now=new Date())=>s.status==='开放'&&isFuture(s,now);

export const confirmedTotal=(sessionId,bookings)=>bookings.filter(b=>b.sessionId===sessionId&&b.status==='已确认').reduce((n,b)=>n+b.size,0);
export const waitlistCount=(sessionId,bookings)=>bookings.filter(b=>b.sessionId===sessionId&&b.status==='候补').reduce((n,b)=>n+b.size,0);
export const remaining=(session,bookings)=>Math.max(0,session.capacity-confirmedTotal(session.id,bookings));

export const rangesOverlap=(a,b)=>a.date===b.date&&toMinutes(a.start)<toMinutes(b.end)&&toMinutes(b.start)<toMinutes(a.end);

// 同一联系人在时间重叠的场次只能占一处（已确认与候补都算占位）
export function findConflict(bookings,sessions,contact,sessionId){
  const target=sessions.find(s=>s.id===sessionId);
  if(!target)return null;
  for(const b of bookings){
    if(b.contact!==contact||!ACTIVE.includes(b.status)||b.sessionId===sessionId)continue;
    const s=sessions.find(x=>x.id===b.sessionId);
    if(s&&s.status!=='已取消'&&rangesOverlap(s,target))return{booking:b,session:s};
  }
  return null;
}

// 空出的位置按候补提交先后补入：补得进的转确认，补不进的保留顺位等下次
export function promoteWaitlist(session,bookings){
  let rem=remaining(session,bookings),promoted=0;
  const next=bookings.map(b=>{
    if(b.sessionId===session.id&&b.status==='候补'&&b.size<=rem){rem-=b.size;promoted+=1;return{...b,status:'已确认'}}
    return b;
  });
  return{bookings:next,promoted};
}

// 关闭预约/撤回发布：未来场次取消，其确认与候补单一并取消、位置放回；已结束场次留档不动
export function cancelFutureSessions(exhibitId,sessions,bookings,now=new Date()){
  const ids=new Set(sessions.filter(s=>s.exhibitId===exhibitId&&s.status==='开放'&&isFuture(s,now)).map(s=>s.id));
  let released=0;
  const nextBookings=bookings.map(b=>{
    if(ids.has(b.sessionId)&&ACTIVE.includes(b.status)){released+=1;return{...b,status:'已取消'}}
    return b;
  });
  return{sessions:sessions.map(s=>ids.has(s.id)?{...s,status:'已取消'}:s),bookings:nextBookings,cancelledSessions:ids.size,released};
}
