// 核心规则行为测试（node 直接执行，无需测试框架）
import assert from 'node:assert';
import {
  toTimestamp,remainingSlots,hasSlots,waitlistQueue,findOverlapBooking,
  validateBooking,alternativeSessions,promoteWaitlist,cancelBooking,
  applyCapacity,cancelFutureSessionsForExhibit,createSessionData,
  CONFIRMED,WAITLIST,CANCELED,sessionsOverlap,
} from '../src/booking/logic.js';

const day=(off,h=10,m=0)=>{const d=new Date();d.setDate(d.getDate()+off);d.setHours(h,m,0,0);return d.getTime();};
const mkSession=(id,exhibitId,off,s=10,e=11,cap=10)=>({
  id,exhibitId,startTime:day(off,s),endTime:day(off,e),capacity:cap,canceled:false,
});
const mkB=(id,sessionId,name,phone,size,status,ageSec=0)=>({
  id,sessionId,name,phone,partySize:size,note:'',status,createdAt:Date.now()-ageSec*1000,
});

let pass=0;
const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('  ✓',m);};

// 1. 余位判定
{
  const s=mkSession(1,3,1);
  const bs=[mkB(1,1,'A','13800000001',6,CONFIRMED,100),mkB(2,1,'B','13800000002',3,WAITLIST)];
  ok(remainingSlots(bs,s)===4,'余位 = 容量10 − 已确认6 = 4（候补不占座）');
  ok(!hasSlots(bs,s,5),'5 人团余位 4，不能确认');
  ok(hasSlots(bs,s,4),'4 人团刚好可确认');
}

// 2. 重叠场次同一联系人不能占两处（跨展项也算）
{
  const s1=mkSession(1,3,1,10,11);
  const s2=mkSession(2,1,1,10,11);          // 同时段、另一展项
  const s3=mkSession(3,3,1,11,12);          // 首尾相接不重叠
  const s4=mkSession(4,3,2,10,11);          // 次日不重叠
  const bs=[mkB(10,1,'A','138 0000 0001',2,CONFIRMED)];
  ok(!!findOverlapBooking({bookings:bs,sessions:[s1,s2],phone:'13800000001',start:s2.startTime,end:s2.endTime}),
    '同一手机号跨展项重叠 → 拒绝');
  ok(!findOverlapBooking({bookings:bs,sessions:[s1,s3],phone:'13800000001',start:s3.startTime,end:s3.endTime}),
    '首尾相接（11:00 接 11:00）不算重叠');
  ok(!findOverlapBooking({bookings:bs,sessions:[s1,s4],phone:'13800000001',start:s4.startTime,end:s4.endTime}),
    '不同日期同时段不冲突');
  ok(sessionsOverlap(s1,mkSession(9,3,1,10,30,11,30)),'时间部分重叠识别正确');
}

// 3. 候补 FIFO：取消/扩容后按先后补入，不打散已有确认
{
  const s=mkSession(1,3,1,10,11,10);
  const bs=[
    mkB(1,1,'A','13800000001',7,CONFIRMED,500),  // 占 7
    mkB(2,1,'B','13800000002',2,WAITLIST,400),   // 候补第1，需要2
    mkB(3,1,'C','13800000003',2,WAITLIST,300),   // 候补第2
    mkB(4,1,'D','13800000004',1,WAITLIST,200),   // 候补第3，需要1
  ];
  // 容量 10、占 7：剩 3。第1位要2 → 确认；剩1，第2位要2 塞不下 → 停止（不跳过）
  let r=promoteWaitlist({bookings:bs,sessionId:1,sessions:[s]});
  const st=id=>r.bookings.find(b=>b.id===id).status;
  ok(st(2)===CONFIRMED,'候补第1位（2人）递补确认');
  ok(st(3)===WAITLIST,'候补第2位（2人）塞不进剩余1个，保持候补');
  ok(st(4)===WAITLIST,'严格先后：不跳过第2位去补第3位');
  ok(!!r.bookings.find(b=>b.id===2).promotedAt,'递补记录带 promotedAt 时间');

  // 再取消一个确认，空出足够位置
  r=cancelBooking({bookings:r.bookings,id:1,sessions:[s]});
  const st2=id=>r.bookings.find(b=>b.id===id).status;
  ok(st2(3)===CONFIRMED,'空出后候补第2位递补');
  ok(r.promoted.includes(3),'取消确认触发递补，promoted 含该单');
}

// 4. 调低容量：确认单不被打散；调高后候补补入
{
  const s=mkSession(1,3,1,10,11,10);
  const bs=[
    mkB(1,1,'A','13800000001',6,CONFIRMED,300),
    mkB(2,1,'B','13800000002',4,CONFIRMED,200), // 共占10
    mkB(3,1,'C','13800000003',3,WAITLIST,100),
  ];
  const down=applyCapacity({bookings:bs,sessions:[s],sessionId:1,capacity:6});
  ok(down.ok,'容量从10调到6 被接受');
  ok(down.bookings.filter(b=>b.status===CONFIRMED).length===2,'调低后两张确认单都保留，不打散');
  ok(remainingSlots(down.bookings,down.sessions[0])===0,'容量6 < 已占10，余位显示0但不踢人');
  ok(down.promoted.length===0,'容量下调不产生候补递补');

  const up=applyCapacity({bookings:down.bookings,sessions:down.sessions,sessionId:1,capacity:13});
  const wb=up.bookings.find(b=>b.id===3);
  ok(wb.status===CONFIRMED,'容量调到13空出3位，候补3人组按序递补');
}

// 5. 关闭预约/撤回发布：未来场次取消，已结束留档
{
  const past=mkSession(1,3,-1); // 昨天，已结束
  const future=mkSession(2,3,1);
  const other=mkSession(3,1,1);
  const sessions=[past,future,other];
  const bookings=[
    mkB(1,1,'A','13800000001',2,CONFIRMED),
    mkB(2,2,'B','13800000002',2,CONFIRMED),
    mkB(3,2,'C','13800000003',1,WAITLIST),
    mkB(4,3,'D','13800000004',2,CONFIRMED),
  ];
  const r=cancelFutureSessionsForExhibit({sessions,bookings,exhibitId:3,reason:'关闭预约'});
  ok(r.sessions.find(s=>s.id===1).canceled===false,'已结束场次保持原样（留档）');
  ok(r.sessions.find(s=>s.id===2).canceled===true,'未来场次标记取消');
  ok(r.sessions.find(s=>s.id===3).canceled===false,'其他展项场次不受影响');
  ok(r.bookings.find(b=>b.id===1).status===CONFIRMED,'已结束场次的确认单留档');
  ok(r.bookings.find(b=>b.id===2).status===CANCELED,'未来场次确认单取消');
  ok(r.bookings.find(b=>b.id===3).status===CANCELED,'未来场次候补也取消');
  ok(r.bookings.find(b=>b.id===4).status===CONFIRMED,'其他展项预约不受影响');
  ok(r.bookings.find(b=>b.id===2).cancelBy==='system','系统取消带原因与操作方');
}

// 6. 校验与可换场次推荐
{
  const sessions=[mkSession(1,3,1,10,11,2),mkSession(2,3,1,14,15,8),mkSession(3,3,2,10,11,8)];
  const bookings=[];
  ok(!validateBooking({sessions,sessionId:1,name:'',phone:'13800000001',partySize:2}).ok,'姓名为空被拒');
  ok(!validateBooking({sessions,sessionId:1,name:'A',phone:'12',partySize:2}).ok,'手机号过短被拒');
  ok(!validateBooking({sessions,sessionId:1,name:'A',phone:'13800000001',partySize:0}).ok,'0人被拒');
  const v=validateBooking({sessions,sessionId:1,name:' A ',phone:'138-0000-0001',partySize:'2'});
  ok(v.ok&&v.phone==='13800000001'&&v.size===2&&v.name==='A','有效输入通过，手机号归一化、人数转整数');

  // 余位不足时推荐：只推有余位、未来、且不与已有预约重叠的同展项场次
  const mine=[mkB(9,2,'A','13800000001',1,CONFIRMED)]; // 已约今天14:00
  const alts=alternativeSessions({
    sessions,bookings:mine,exhibitId:3,size:5,phone:'13800000001',
    start:sessions[0].startTime,end:sessions[0].endTime,excludeSessionId:1,
  });
  ok(alts.length===1&&alts[0].id===3,'可换场次：排除余位不足与时间冲突，只推次日场');
}

// 7. 新建场次：时间、容量、重叠校验
{
  const sessions=[mkSession(1,3,1,10,11)];
  const d=new Date();d.setDate(d.getDate()+1);
  const date=d.toISOString().slice(0,10);
  ok(!createSessionData({sessions,exhibitId:3,date,startTime:'11:00',endTime:'10:00',capacity:5}).ok,'结束早于开始被拒');
  ok(!createSessionData({sessions,exhibitId:3,date,startTime:'10:30',endTime:'11:30',capacity:5}).ok,'与已有场次重叠被拒');
  ok(!createSessionData({sessions,exhibitId:3,date,startTime:'10:30',endTime:'11:30',capacity:0}).ok,'容量0被拒');
  const r=createSessionData({sessions,exhibitId:3,date,startTime:'13:00',endTime:'13:45',capacity:12});
  ok(r.ok&&r.session.capacity===12,'合法场次创建成功');
}

// 8. 取消已取消/不存在单的幂等性
{
  const sessions=[mkSession(1,3,1)];
  const bs=[mkB(1,1,'A','13800000001',2,CANCELED)];
  const r=cancelBooking({bookings:bs,id:1,sessions});
  ok(r.booking===null,'重复取消返回空结果，不重复触发');
}

console.log(`\n全部通过：${pass} 项断言`);
