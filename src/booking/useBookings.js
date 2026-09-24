import {useCallback,useEffect,useMemo,useState} from 'react';
import {loadSessions,saveSessions,loadBookings,saveBookings,seedSessions,seedBookings} from './storage.js';
import {
  CONFIRMED,WAITLIST,CANCELED,fmtRange,
  remainingSlots,waitlistQueue,findOverlapBooking,
  alternativeSessions,createSessionData,applyCapacity,
  cancelBooking as logicCancel,cancelFutureSessionsForExhibit,
  validateBooking,
} from './logic.js';

let bookingSeq=Date.now();
const newId=()=>++bookingSeq;

export function useBookings(exhibits){
  const [sessions,setSessions]=useState(()=>{
    const seeded=seedSessions(exhibits);
    return loadSessions(seeded);
  });
  const [bookings,setBookings]=useState(()=>{
    const seeded=seedSessions(exhibits);
    return loadBookings(seedBookings(loadSessions(seeded)));
  });
  const [now,setNow]=useState(Date.now());

  useEffect(()=>saveSessions(sessions),[sessions]);
  useEffect(()=>saveBookings(bookings),[bookings]);
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),30000);return ()=>clearInterval(t)},[]);

  // ---- 工作人员：排场次 ----
  const addSession=useCallback((exhibitId,fields)=>{
    const r=createSessionData({sessions,exhibitId,...fields});
    if(r.ok)setSessions(prev=>[...prev,{...r.session,id:newId()}]);
    return r;
  },[sessions]);

  // ---- 工作人员：调容量（确认单不打散；容量变大/有空位时候补按先后补入） ----
  const changeCapacity=useCallback((sessionId,capacity)=>{
    const r=applyCapacity({bookings,sessions,sessionId,capacity});
    if(r.ok){setSessions(r.sessions);setBookings(r.bookings);}
    return r;
  },[bookings,sessions]);

  // ---- 工作人员：取消单场（未来场次；释放后候补随场次一并取消，不留同场） ----
  const cancelSession=useCallback((sessionId,reason)=>{
    const s=sessions.find(x=>x.id===sessionId);
    if(!s||s.canceled||s.startTime<=Date.now())return {ok:false,reason:'场次不存在或已开始，无法取消'};
    const t=Date.now();
    setSessions(sessions.map(x=>x.id===sessionId
      ?{...x,canceled:true,canceledAt:t,cancelReason:reason||'工作人员取消场次'}:x));
    setBookings(bookings.map(b=>b.sessionId===sessionId&&b.status!==CANCELED
      ?{...b,status:CANCELED,canceledAt:t,cancelReason:reason||'场次已取消',cancelBy:'staff'}:b));
    return {ok:true};
  },[sessions,bookings]);

  // ---- 关闭预约 / 撤回发布：未来场次取消、位置放回；已结束记录留档 ----
  const closeFutureSessions=useCallback((exhibitId,reason)=>{
    const r=cancelFutureSessionsForExhibit({sessions,bookings,exhibitId,reason});
    setSessions(r.sessions);setBookings(r.bookings);
    return {sessions:r.canceledSessionIds.length,bookings:r.canceledBookingIds.length};
  },[sessions,bookings]);

  // ---- 访客提交：余位足 → 确认；不足 → 候补；保留已填内容并提示换场 ----
  const submitBooking=useCallback(({sessionId,name,phone,partySize,note})=>{
    const v=validateBooking({sessions,sessionId,name,phone,partySize});
    if(!v.ok)return {ok:false,reason:v.reason,field:v.field};
    const s=v.session;
    const conflict=findOverlapBooking({bookings,sessions,phone:v.phone,start:s.startTime,end:s.endTime});
    if(conflict){
      const cs=sessions.find(x=>x.id===conflict.sessionId);
      return {ok:false,reason:`该联系人已有时间冲突的预约（${cs?fmtRange(cs):'另一时段'}），一位联系人不能同时占两场`,field:'phone',conflict};
    }
    const free=remainingSlots(bookings,s,Date.now());
    const willConfirm=free>=v.size;
    const booking={
      id:newId(),sessionId:s.id,name:v.name,phone:v.phone,partySize:v.size,
      note:String(note||'').trim(),
      status:willConfirm?CONFIRMED:WAITLIST,
      createdAt:Date.now(),
    };
    const nextBookings=[...bookings,booking];
    // 新确认不触发候补；候补只在“空出位置”（取消/扩容）时递补
    setBookings(nextBookings);
    const remainingAfter=Math.max(0,remainingSlots(nextBookings,s,Date.now()));
    return {
      ok:true,status:booking.status,booking,
      remaining:remainingAfter,
      alternatives:willConfirm?[]:alternativeSessions({
        sessions,bookings:nextBookings,exhibitId:s.exhibitId,size:v.size,phone:v.phone,
        start:s.startTime,end:s.endTime,excludeSessionId:s.id,
      }),
      promoted:[],
    };
  },[bookings,sessions]);

  // ---- 工作人员 / 访客取消：位置放回，按候补先后补入 ----
  const cancelBookingById=useCallback((id,{by='staff',reason=''}={})=>{
    const r=logicCancel({bookings,id,by,reason,sessions});
    if(r.booking){setBookings(r.bookings);}
    return r;
  },[bookings,sessions]);

  const sessionStats=useMemo(()=>{
    const m=new Map();
    for(const s of sessions){
      const cb=bookings.filter(b=>b.sessionId===s.id&&b.status===CONFIRMED);
      const wb=waitlistQueue(bookings,s.id);
      m.set(s.id,{
        taken:cb.reduce((n,b)=>n+b.partySize,0),
        confirmedCount:cb.length,
        waitlistCount:wb.length,
        remaining:remainingSlots(bookings,s,now),
      });
    }
    return m;
  },[sessions,bookings,now]);

  return {
    sessions,bookings,now,
    addSession,changeCapacity,cancelSession,closeFutureSessions,
    submitBooking,cancelBookingById,
    sessionStats,
  };
}
