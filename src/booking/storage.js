// 存储层：展项内容（页面）、场次容量、预约记录分开维护
import {toTimestamp,CONFIRMED,WAITLIST} from './logic.js';

const K_EXHIBITS='guide-exhibits';
const K_SESSIONS='guide-sessions-v1';
const K_BOOKINGS='guide-bookings-v1';

function dayOffset(n){
  const d=new Date();d.setDate(d.getDate()+n);
  return d.toISOString().slice(0,10);
}

export function seedSessions(exhibits){
  // 为“互动”类展项排未来 3 天的示范场次
  const t0=Date.now();
  const out=[];
  let id=1;
  const times=[['10:00','10:45'],['11:00','11:45'],['14:00','14:45'],['15:00','15:45'],['16:00','16:45']];
  exhibits.filter(x=>x.type==='互动'&&x.status==='已发布').forEach((x,xi)=>{
    [1,2,3].forEach((off,di)=>{
      const date=dayOffset(off);
      times.forEach(([a,b],ti)=>{
        // 给每个互动展项略有差异的容量
        out.push({id:id++,exhibitId:x.id,date,
          startTime:toTimestamp(date,a),endTime:toTimestamp(date,b),
          capacity:[12,16,20][(xi+ti)%3],canceled:false,createdAt:t0});
      });
    });
  });
  return out;
}

export function seedBookings(sessions){
  // 少量示范记录：一张确认、一张候补，便于后台直接看到两种状态
  if(sessions.length<2)return [];
  const t=Date.now();
  return [
    {id:1,sessionId:sessions[0].id,name:'林领队',phone:'13800001111',partySize:8,note:'学生团 8 人，提前 10 分钟到场',
      status:CONFIRMED,createdAt:t-3600e3},
    {id:2,sessionId:sessions[0].id,name:'周老师',phone:'13900002222',partySize:6,note:'希望排在入口附近',
      status:WAITLIST,createdAt:t-1800e3},
    {id:3,sessionId:sessions[1].id,name:'陈接待',phone:'13700003333',partySize:4,note:'',
      status:CONFIRMED,createdAt:t-900e3},
  ];
}

function load(key,fallback){
  try{const raw=localStorage.getItem(key);if(raw)return JSON.parse(raw);}catch{}
  return fallback;
}
function save(key,val){try{localStorage.setItem(key,JSON.stringify(val))}catch{}}

export function loadExhibits(fallback){return load(K_EXHIBITS,fallback)}
export function saveExhibits(v){save(K_EXHIBITS,v)}
export function loadSessions(fallback){return load(K_SESSIONS,fallback)}
export function saveSessions(v){save(K_SESSIONS,v)}
export function loadBookings(fallback){return load(K_BOOKINGS,fallback)}
export function saveBookings(v){save(K_BOOKINGS,v)}
