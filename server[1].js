const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true }, maxHttpBufferSize: 1e5 });
const PORT = process.env.PORT || 3000;
const rooms = new Map();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));
function makeCode(){let c;do{c=String(Math.floor(100000+Math.random()*900000));}while(rooms.has(c));return c;}
function roomPlayers(room){const out={};for(const [id,p] of room.players)out[id]={id,name:p.name,x:p.x,y:p.y,face:p.face,sitting:p.sitting,hp:p.hp};return out;}
function emitPlayers(code){const r=rooms.get(code);if(r)io.to(code).emit('room:players',roomPlayers(r));}
function leaveRoom(socket){const code=socket.data.roomCode;if(!code)return;const r=rooms.get(code);socket.leave(code);socket.data.roomCode=null;if(!r)return;r.players.delete(socket.id);if(r.players.size===0){rooms.delete(code);return;}emitPlayers(code);}
io.on('connection',socket=>{
 socket.data.roomCode=null;
 socket.on('room:create',(data={})=>{leaveRoom(socket);const mode=data.mode==='chill'?'chill':'pvp';const code=makeCode();const room={code,mode,players:new Map(),createdAt:Date.now()};rooms.set(code,room);room.players.set(socket.id,{id:socket.id,name:'Hazen',x:80,y:200,face:1,sitting:false,hp:100,lastAttack:0});socket.join(code);socket.data.roomCode=code;socket.emit('room:created',{code,mode});emitPlayers(code);});
 socket.on('room:join',(data={})=>{const code=String(data.code||'').replace(/\D/g,'').slice(0,6);const room=rooms.get(code);if(!/^\d{6}$/.test(code)||!room){socket.emit('room:error','Không tìm thấy phòng này. Kiểm tra mã 6 số nhé.');return;}if(room.players.size>=8){socket.emit('room:error','Phòng đã đủ 8 người.');return;}if(data.mode&&data.mode!==room.mode){socket.emit('room:error',room.mode==='pvp'?'Đây là phòng PvP. Hãy vào từ nút PvP.':'Đây là phòng Phố Hazen. Hãy vào từ nút Phố Hazen Online.');return;}leaveRoom(socket);room.players.set(socket.id,{id:socket.id,name:'Hazen',x:120+Math.random()*60,y:200,face:1,sitting:false,hp:100,lastAttack:0});socket.join(code);socket.data.roomCode=code;socket.emit('room:joined',{code,mode:room.mode,players:roomPlayers(room)});emitPlayers(code);});
 socket.on('player:update',(data={})=>{const code=socket.data.roomCode;const room=rooms.get(code);const p=room&&room.players.get(socket.id);if(!p)return;p.x=Math.max(0,Math.min(10000,Number(data.x)||0));p.y=Math.max(0,Math.min(3000,Number(data.y)||0));p.face=Number(data.face)<0?-1:1;p.sitting=!!data.sitting;if(room.mode==='chill')p.hp=100;emitPlayers(code);});
 socket.on('chat:send',(data={})=>{const code=socket.data.roomCode;const room=rooms.get(code);if(!room)return;const text=String(data.text||'').trim().slice(0,180);if(!text)return;io.to(code).emit('chat:message',{name:'Người chơi '+socket.id.slice(0,4),text,at:Date.now()});});
 socket.on('pvp:attack',()=>{const code=socket.data.roomCode;const room=rooms.get(code);if(!room||room.mode!=='pvp')return;const a=room.players.get(socket.id);if(!a||Date.now()-a.lastAttack<400)return;a.lastAttack=Date.now();for(const [id,b] of room.players){if(id===socket.id)continue;if(Math.abs(a.x-b.x)<100&&Math.abs(a.y-b.y)<100){b.hp=Math.max(0,b.hp-22);io.to(id).emit('pvp:hit',{hp:b.hp,from:socket.id});emitPlayers(code);if(b.hp<=0){setTimeout(()=>{const current=rooms.get(code)?.players.get(id);if(current){current.hp=100;current.x=120+Math.random()*80;current.y=200;io.to(code).emit('pvp:respawn',{id,hp:100});emitPlayers(code);}},1800);}break;}}});
 socket.on('room:leave',()=>leaveRoom(socket));socket.on('disconnect',()=>leaveRoom(socket));
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Battle King Hazen online server listening on ${PORT}`));
