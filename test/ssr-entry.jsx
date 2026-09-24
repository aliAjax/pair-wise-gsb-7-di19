import React from 'react';
import {renderToString} from 'react-dom/server';
import BookingAdmin from '../src/booking/BookingAdmin.jsx';
import BookingWidget from '../src/booking/BookingWidget.jsx';
import {seedSessions,seedBookings} from '../src/booking/storage.js';

const exhibits=[
  {id:3,title:'柔软的边界',room:'C01 · 新媒介',type:'互动',desc:'...',status:'已发布',color:'#83b9b1',booking:true},
  {id:4,title:'回声房间',room:'C02',type:'互动',desc:'...',status:'草稿',color:'#9ba7dc',booking:false},
];
const sessions=seedSessions(exhibits);
const bookings=seedBookings(sessions);
const stats=new Map(sessions.map(s=>[s.id,{taken:0,confirmedCount:0,waitlistCount:0,remaining:s.capacity}]));
const noop=()=>({ok:true});

const html1=renderToString(React.createElement(BookingAdmin,{
  exhibits,selectedId:3,onSelect:noop,sessions,bookings,now:Date.now(),sessionStats:stats,
  onAddSession:noop,onChangeCapacity:noop,onCancelSession:noop,onToggleBooking:noop,onCancelBooking:noop,
}));
const html2=renderToString(React.createElement(BookingWidget,{
  exhibit:exhibits[0],sessions,bookings,now:Date.now(),onSubmit:noop,onCancelBooking:noop,
}));
if(!html1.includes('场次安排')||!html1.includes('预约记录'))throw new Error('admin missing sections');
if(!html1.includes('已确认单'))throw new Error('admin stats missing');
if(!html2.includes('选择入场场次')||!html2.includes('余位'))throw new Error('widget missing slots');
console.log('admin html length',html1.length);
console.log('widget html length',html2.length);
console.log('SSR smoke OK');
