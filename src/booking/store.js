// 预约记录：场次与订单的存取和变更动作，容量规则全部走 capacity.js
import {useEffect,useState} from 'react';
import * as cap from './capacity';

const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const day=n=>{const d=new Date();d.setDate(d.getDate()+n);return fmt(d)};
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const T=Date.now();

const seedSessions=[
  {id:'s0',exhibitId:3,date:day(-1),start:'10:00',end:'11:00',capacity:10,status:'开放'},
  {id:'s1',exhibitId:3,date:day(1),start:'10:00',end:'11:00',capacity:12,status:'开放'},
  {id:'s2',exhibitId:3,date:day(1),start:'14:00',end:'15:30',capacity:8,status:'开放'},
  {id:'s3',exhibitId:3,date:day(2),start:'10:00',end:'11:00',capacity:12,status:'开放'},
];
const seedBookings=[
  {id:'b0',sessionId:'s0',exhibitId:3,contact:'林一舟',size:4,note:'团体导览',status:'已确认',createdAt:T-3*864e5},
  {id:'b1',sessionId:'s1',exhibitId:3,contact:'周雨',size:4,note:'',status:'已确认',createdAt:T-2*864e5},
  {id:'b2',sessionId:'s2',exhibitId:3,contact:'陈默',size:6,note:'公司团建',status:'已确认',createdAt:T-864e5},
  {id:'b3',sessionId:'s2',exhibitId:3,contact:'林一舟',size:2,note:'',status:'已确认',createdAt:T-36e5},
  {id:'b4',sessionId:'s2',exhibitId:3,contact:'苏杭',size:3,note:'希望靠前安排',status:'候补',createdAt:T-18e5},
];
const load=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))||fallback}catch{return fallback}};

export function useBookingStore(){
  const [sessions,setSessions]=useState(()=>load('guide-sessions',seedSessions));
  const [bookings,setBookings]=useState(()=>load('guide-bookings',seedBookings));
  useEffect(()=>localStorage.setItem('guide-sessions',JSON.stringify(sessions)),[sessions]);
  useEffect(()=>localStorage.setItem('guide-bookings',JSON.stringify(bookings)),[bookings]);

  const addSession=(exhibitId,{date,start,end,capacity})=>{
    const s={id:uid('s'),exhibitId,date,start,end,capacity:Math.max(1,parseInt(capacity)||1),status:'开放'};
    setSessions(xs=>[...xs,s]);
    return s;
  };

  // 调低容量不打散已有确认单；调高后空位按候补顺序补入，返回补入笔数
  const setCapacity=(sessionId,capacity)=>{
    capacity=Math.max(0,parseInt(capacity)||0);
    setSessions(xs=>xs.map(s=>s.id===sessionId?{...s,capacity}:s));
    const session=sessions.find(s=>s.id===sessionId);
    if(!session)return 0;
    const r=cap.promoteWaitlist({...session,capacity},bookings);
    setBookings(r.bookings);
    return r.promoted;
  };

  const cancelSession=sessionId=>{
    setSessions(xs=>xs.map(s=>s.id===sessionId?{...s,status:'已取消'}:s));
    setBookings(bs=>bs.map(b=>b.sessionId===sessionId&&cap.ACTIVE.includes(b.status)?{...b,status:'已取消'}:b));
  };

  // 关闭预约/撤回发布时调用，返回 {cancelledSessions,released}
  const closeExhibit=exhibitId=>{
    const r=cap.cancelFutureSessions(exhibitId,sessions,bookings);
    setSessions(r.sessions);
    setBookings(r.bookings);
    return r;
  };

  // 访客提交：余位不足时不落单（由页面保留填写内容并提示换场），asWaitlist 时转候补
  const submitBooking=({sessionId,contact,size,note},asWaitlist=false)=>{
    const session=sessions.find(s=>s.id===sessionId);
    if(!session||!cap.isOpen(session))return{ok:false,reason:'closed'};
    const conflict=cap.findConflict(bookings,sessions,contact.trim(),sessionId);
    if(conflict)return{ok:false,reason:'conflict',conflict};
    const rem=cap.remaining(session,bookings);
    let status='已确认';
    if(size>rem){
      if(!asWaitlist)return{ok:false,reason:'full',remaining:rem};
      status='候补';
    }
    const b={id:uid('b'),sessionId,exhibitId:session.exhibitId,contact:contact.trim(),size,note:note.trim(),status,createdAt:Date.now()};
    setBookings(bs=>[...bs,b]);
    return{ok:true,status};
  };

  // 工作人员取消订单；确认单取消后空位按候补顺序补入，返回补入笔数
  const cancelBooking=bookingId=>{
    const b=bookings.find(x=>x.id===bookingId);
    if(!b)return 0;
    const next=bookings.map(x=>x.id===bookingId?{...x,status:'已取消'}:x);
    const session=sessions.find(s=>s.id===b.sessionId);
    if(b.status==='已确认'&&session&&session.status==='开放'){
      const r=cap.promoteWaitlist(session,next);
      setBookings(r.bookings);
      return r.promoted;
    }
    setBookings(next);
    return 0;
  };

  return{sessions,bookings,addSession,setCapacity,cancelSession,closeExhibit,submitBooking,cancelBooking};
}
