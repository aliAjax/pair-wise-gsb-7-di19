// 时段预约 · 核心规则层（纯函数，不依赖 React / 存储 / 页面）
// 负责：余位判定、重叠校验、候补先后补位、取消归档
// 预约记录（bookings）与场次（sessions）的结构见 storage.js 中的种子数据

export const CONFIRMED='confirmed';
export const WAITLIST='waitlist';
export const CANCELED='canceled';

const STATUS_TEXT={[CONFIRMED]:'已确认',[WAITLIST]:'候补中',[CANCELED]:'已取消'};
export const statusText=s=>STATUS_TEXT[s]||s;

// ---------- 时间工具 ----------
export function toTimestamp(date,time){ // 'YYYY-MM-DD' + 'HH:mm' -> ms
  const [y,m,d]=String(date).split('-').map(Number);
  const [h,min]=String(time).split(':').map(Number);
  return new Date(y,(m||1)-1,d||1,h||0,min||0,0,0).getTime();
}
export const fmtDate=ts=>new Date(ts).toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'short'});
export const fmtTime=ts=>new Date(ts).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
export const fmtRange=s=>`${fmtDate(s.startTime)} ${fmtTime(s.startTime)}–${fmtTime(s.endTime)}`;

export function isFutureSession(s,now=Date.now()){return s.startTime>now}
export function isEndedSession(s,now=Date.now()){return s.endTime<=now}
export function isOngoingSession(s,now=Date.now()){return s.startTime<=now&&now<s.endTime}
// 关闭预约 / 撤回发布时，只有“未开始”的场次需要取消；已结束的继续留档
export function isCancellableSession(s,now=Date.now()){return !s.canceled&&s.startTime>now}

function overlap(a,b){return a.startTime<b.endTime&&b.startTime<a.endTime}
export const sessionsOverlap=(a,b)=>overlap(
  {startTime:a.startTime,endTime:a.endTime},
  {startTime:b.startTime,endTime:b.endTime}
);

// ---------- 联系人身份 ----------
export function phoneKey(phone){return String(phone||'').replace(/[\s\-()]/g,'')}

// ---------- 记录查询 / 余位 ----------
export const activeBookings=bs=>bs.filter(b=>b.status!==CANCELED);
export const sessionBookings=(bs,sid,st)=>bs.filter(b=>b.sessionId===sid&&b.status===st);
export const confirmedBookings=(bs,sid)=>sessionBookings(bs,sid,CONFIRMED);
export const waitlistBookings=(bs,sid)=>sessionBookings(bs,sid,WAITLIST);

export function seatsTaken(bs,sid){
  return confirmedBookings(bs,sid).reduce((n,b)=>n+b.partySize,0);
}
export function remainingSlots(bs,s,now=Date.now()){
  if(!s||s.canceled||isEndedSession(s,now))return 0;
  return Math.max(0,s.capacity-seatsTaken(bs,s.id));
}
export const hasSlots=(bs,s,size,now)=>remainingSlots(bs,s,now)>=size;
// 候补队列：创建时间先后，id 兜底
export function waitlistQueue(bs,sid){
  return waitlistBookings(bs,sid).sort((a,b)=>a.createdAt-b.createdAt||a.id-b.id);
}
export function waitlistPosition(bs,b){
  if(b.status!==WAITLIST)return 0;
  return waitlistQueue(bs,b.sessionId).findIndex(x=>x.id===b.id)+1;
}

// ---------- 重叠占用：同一联系人（手机号）在重叠场次不能占两处 ----------
// 同一展项内未开始的场次互不重叠；跨展项也不能占两处
export function findOverlapBooking({bookings,sessions,phone,start,end,selfId=null}){
  const key=phoneKey(phone);
  if(!key)return null;
  return activeBookings(bookings).find(b=>{
    if(b.id===selfId)return false;
    const s=sessions.find(x=>x.id===b.sessionId);
    if(!s||s.canceled)return false;
    return phoneKey(b.phone)===key&&overlap({startTime:start,endTime:end},s);
  })||null;
}

// ---------- 提交预约的前置校验（不写数据） ----------
export function validateBooking({sessions,sessionId,name,phone,partySize}){
  const s=sessions.find(x=>x.id===sessionId);
  if(!s)return {ok:false,reason:'找不到该场次，请改选其他时段'};
  if(s.canceled)return {ok:false,reason:'该场次已取消，请改选其他时段'};
  if(isEndedSession(s))return {ok:false,reason:'该场次已结束，请改选其他时段'};
  if(!String(name||'').trim())return {ok:false,field:'name',reason:'请填写联系人姓名'};
  const digits=phoneKey(phone);
  if(!/^\+?\d{6,20}$/.test(digits))return {ok:false,field:'phone',reason:'请填写可联系到的手机号'};
  const n=Number(partySize);
  if(!Number.isInteger(n)||n<1)return {ok:false,field:'partySize',reason:'人数至少 1 人'};
  if(n>999)return {ok:false,field:'partySize',reason:'人数超出限制，请团体单独联系'};
  return {ok:true,session:s,phone:digits,size:n,name:String(name).trim(),start:s.startTime,end:s.endTime};
}

// ---------- 可换场次：开放、未来、余位够、且不与该联系人已有预约冲突 ----------
export function alternativeSessions({sessions,bookings,exhibitId,size,phone,start,end,excludeSessionId}){
  const key=phoneKey(phone);
  const now=Date.now();
  return sessions
    .filter(s=>s.exhibitId===exhibitId&&s.id!==excludeSessionId&&!s.canceled&&isFutureSession(s,now))
    .filter(s=>remainingSlots(bookings,s,now)>=size)
    .filter(s=>!key||!activeBookings(bookings).some(b=>{
      const os=sessions.find(x=>x.id===b.sessionId);
      return os&&!os.canceled&&phoneKey(b.phone)===key&&sessionsOverlap(s,os);
    }))
    .sort((a,b)=>a.startTime-b.startTime)
    .slice(0,3);
}

// ---------- 候补补位：空出的位置按候补先后补入，不打散已确认团体 ----------
// 严格 FIFO：按队列顺序逐个尝试；前面塞不下的不跳过（保持“先后”语义），
// 只在剩余余位足够整张单时才确认。补位时再防一次跨场次重叠。
export function promoteWaitlist({bookings,sessionId,sessions}){
  const list=waitlistQueue(bookings,sessionId);
  let next=bookings;
  const promoted=[];
  for(const b of list){
    const s=sessions.find(x=>x.id===sessionId);
    if(!s||isEndedSession(s))break;
    const free=s.capacity-seatsTaken(next,sessionId);
    if(b.partySize>free)break;
    const conflict=activeBookings(next).find(x=>{
      if(x.id===b.id||phoneKey(x.phone)!==phoneKey(b.phone))return false;
      const os=sessions.find(y=>y.id===x.sessionId);
      return os&&!os.canceled&&sessionsOverlap(s,os);
    });
    if(conflict)continue; // 自己与别处冲突，跳过这一张，后面的继续补
    next=next.map(x=>x.id===b.id?{...x,status:CONFIRMED,promotedAt:Date.now()}:x);
    promoted.push(b.id);
  }
  return {bookings:next,promoted};
}

// ---------- 取消预约：位置放回，触发候补补位 ----------
export function cancelBooking({bookings,id,by='visitor',reason='',sessions}){
  const b=bookings.find(x=>x.id===id);
  if(!b||b.status===CANCELED)return {bookings,booking:null,promoted:[]};
  let next=bookings.map(x=>x.id===id?{...x,status:CANCELED,canceledAt:Date.now(),cancelReason:reason,cancelBy:by}:x);
  let promoted=[];
  if(b.status===CONFIRMED){
    const r=promoteWaitlist({bookings:next,sessionId:b.sessionId,sessions});
    next=r.bookings;promoted=r.promoted;
  }
  return {bookings:next,booking:{...b,status:CANCELED},promoted};
}

// ---------- 调低/调高容量：已有确认单不打散；空出的位置按候补先后补入 ----------
export function setSessionCapacity({bookings,sessionId,capacity}){
  const n=Number(capacity);
  if(!Number.isInteger(n)||n<0)return {ok:false,reason:'容量需为不小于 0 的整数'};
  const session={capacity:n};
  void session;
  return {ok:true,capacity:n};
}
export function applyCapacity({bookings,sessions,sessionId,capacity}){
  const checked=setSessionCapacity({bookings,sessionId,capacity});
  if(!checked.ok)return {ok:false,reason:checked.reason,bookings,sessions};
  const nextSessions=sessions.map(s=>s.id===sessionId?{...s,capacity:checked.capacity}:s);
  // 容量调低：不取消、不打散任何已确认单（确认总数可以暂时高于容量）
  // 容量调高 / 因取消空出：仅当 capacity > 已确认占用时，候补按序补入
  const r=promoteWaitlist({bookings,sessionId,sessions:nextSessions});
  return {ok:true,bookings:r.bookings,sessions:nextSessions,promoted:r.promoted};
}

// ---------- 关闭预约 / 撤回发布：未来场次全部取消并释放位置，已结束记录留档 ----------
export function cancelFutureSessionsForExhibit({sessions,bookings,exhibitId,reason,now=Date.now()}){
  const ids=new Set(sessions.filter(s=>s.exhibitId===exhibitId&&isCancellableSession(s,now)).map(s=>s.id));
  if(!ids.size)return {sessions,bookings,canceledSessionIds:[],canceledBookingIds:[],promoted:[]};
  const nextSessions=sessions.map(s=>ids.has(s.id)?{...s,canceled:true,canceledAt:now,cancelReason:reason}:s);
  let nextBookings=bookings.map(b=>ids.has(b.sessionId)&&b.status!==CANCELED
    ?{...b,status:CANCELED,canceledAt:now,cancelReason:reason||'场次已取消',cancelBy:'system'}
    :b);
  return {
    sessions:nextSessions,bookings:nextBookings,
    canceledSessionIds:[...ids],
    canceledBookingIds:nextBookings.filter(b=>ids.has(b.sessionId)&&b.status===CANCELED&&b.canceledAt===now).map(b=>b.id),
    promoted:[] // 场次本身取消，不做同场候补
  };
}

// ---------- 新建场次 ----------
export function createSessionData({sessions,exhibitId,date,startTime,endTime,capacity}){
  if(!date)return {ok:false,reason:'请选择日期'};
  if(!startTime||!endTime)return {ok:false,reason:'请填写开始与结束时间'};
  if(endTime<=startTime)return {ok:false,reason:'结束时间需晚于开始时间'};
  const n=Number(capacity);
  if(!Number.isInteger(n)||n<1)return {ok:false,reason:'容量需为正整数'};
  const start=toTimestamp(date,startTime),end=toTimestamp(date,endTime);
  if(start<=Date.now())return {ok:false,reason:'只能排尚未开始的场次'};
  const clash=sessions.find(s=>!s.canceled&&s.exhibitId===exhibitId&&sessionsOverlap({startTime:start,endTime:end},s));
  if(clash)return {ok:false,reason:`与已有场次 ${fmtTime(clash.startTime)}–${fmtTime(clash.endTime)} 时间重叠`};
  return {ok:true,session:{exhibitId,date,startTime:start,endTime:end,capacity:n,canceled:false,createdAt:Date.now()}};
}
