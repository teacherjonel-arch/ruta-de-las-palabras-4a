const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });
const PORT = process.env.PORT || 10000;
const DATA_DIR = path.join(__dirname, 'data');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const ADMIN_KEY = process.env.ADMIN_KEY || 'SPX2026';

app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

let questions = readJson(QUESTIONS_FILE, []);
let config = readJson(CONFIG_FILE, { title: 'Ruta de las Palabras', theme: 'clasico' });

app.get('/api/questions', (_req, res) => res.json({ questions }));
app.get('/api/config', (_req, res) => res.json(config));
app.put('/api/questions', (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(403).json({ error: 'No autorizado' });
  if (!Array.isArray(req.body.questions) || req.body.questions.length !== 15) return res.status(400).json({ error: 'Se requieren 15 preguntas' });
  questions = req.body.questions;
  writeJson(QUESTIONS_FILE, questions);
  io.emit('server-questions', { questions });
  res.json({ ok: true });
});
app.put('/api/config', (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(403).json({ error: 'No autorizado' });
  config = { ...config, ...req.body };
  writeJson(CONFIG_FILE, config);
  io.emit('server-config', config);
  res.json({ ok: true, config });
});
app.get(/.*/, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const rooms = new Map();
const QUESTION_CELLS = [3,5,7,9,11,13,15,17,19,21,23,24,26,27,29];
const EVENTS = {
  2:{icon:'⭐',type:'BONIFICACIÓN',title:'¡Premio sorpresa!',msg:'Ganas 10 puntos.',score:10},
  4:{icon:'🚀',type:'AVANCE',title:'¡Impulso!',msg:'Avanzas 2 casillas.',move:2},
  6:{icon:'🍀',type:'CASILLA LIBRE',title:'Camino seguro',msg:'No ocurre nada. Puedes continuar.'},
  8:{icon:'↩️',type:'RETROCESO',title:'¡Cuidado!',msg:'Retrocedes 2 casillas.',move:-2},
  10:{icon:'🎁',type:'BONIFICACIÓN',title:'¡Tesoro encontrado!',msg:'Ganas 20 puntos.',score:20},
  12:{icon:'🎲',type:'TURNO EXTRA',title:'¡Otra oportunidad!',msg:'Puedes volver a lanzar el dado.',extra:true},
  14:{icon:'🌀',type:'RETROCESO',title:'¡Te despistaste!',msg:'Retrocedes 1 casilla.',move:-1},
  16:{icon:'⭐',type:'BONIFICACIÓN',title:'¡Excelente!',msg:'Ganas 15 puntos.',score:15},
  18:{icon:'⏸️',type:'PENALIZACIÓN',title:'Pierdes un turno',msg:'En tu siguiente oportunidad no podrás lanzar.',skip:true},
  20:{icon:'🚀',type:'ATAJO',title:'¡Atajo secreto!',msg:'Avanzas 3 casillas.',move:3},
  22:{icon:'🍀',type:'CASILLA LIBRE',title:'Descanso seguro',msg:'No ocurre nada. Puedes continuar.'},
  25:{icon:'🎁',type:'BONIFICACIÓN',title:'¡Cofre sorpresa!',msg:'Ganas 20 puntos.',score:20},
  28:{icon:'🚀',type:'AVANCE',title:'¡Último impulso!',msg:'Avanzas 1 casilla.',move:1}
};
function publicState(room) {
  return {
    started: room.started,
    turnId: room.turnId,
    activeQuestion: !!room.activeQuestion,
    activeEvent: !!room.activeEvent,
    visited: room.visited,
    players: [...room.players.values()].map(p => ({ id:p.id, name:p.name, avatar:p.avatar, pos:p.pos, score:p.score, skip:p.skip, host:p.host }))
  };
}
function broadcastRoom(room) { io.to(room.code).emit('state-update', publicState(room)); }
function broadcastLobby(room) { io.to(room.code).emit('room-update', { players:[...room.players.values()], state:publicState(room) }); }
function nextTurn(room) {
  const ids=[...room.players.keys()];
  if (!ids.length) return;
  let idx=ids.indexOf(room.turnId);
  for(let i=1;i<=ids.length;i++) {
    const id=ids[(idx+i)%ids.length];
    const p=room.players.get(id);
    if(p && !p.skip){ room.turnId=id; return; }
    if(p) p.skip=false;
  }
  room.turnId=ids[(idx+1)%ids.length];
}
function finishTurn(room) {
  room.activeQuestion=null; room.activeEvent=null;
  const winner=[...room.players.values()].find(p=>p.pos>=30);
  if(winner){ room.started=false; io.to(room.code).emit('game-finished',{state:publicState(room),message:`${winner.name} llegó a la meta con ${winner.score} puntos.`}); return; }
  nextTurn(room); broadcastRoom(room); io.to(room.code).emit('turn-changed',{state:publicState(room)});
}
function resolveLanding(room, player) {
  player.pos=Math.min(30,player.pos);
  room.visited.push(player.pos); room.visited=[...new Set(room.visited)];
  if(player.pos===30){ finishTurn(room); return; }
  const qIndex=QUESTION_CELLS.indexOf(player.pos);
  if(qIndex>=0){
    room.activeQuestion={playerId:player.id,questionIndex:qIndex,answered:false};
    io.to(room.code).emit('question-start',{question:questions[qIndex],playerName:player.name,playerId:player.id});
    broadcastRoom(room); return;
  }
  const e=EVENTS[player.pos] || {icon:'🛤️',type:'CAMINO',title:`Casilla ${player.pos}`,msg:'No ocurre nada. Continúa tu recorrido.'};
  room.activeEvent={playerId:player.id,event:e};
  if(e.score) player.score+=e.score;
  if(e.skip) player.skip=true;
  io.to(room.code).emit('event-start',{event:e,playerName:player.name,message:`${player.name} cayó en la casilla ${player.pos}.`});
  broadcastRoom(room);
}

io.on('connection', socket => {
  socket.emit('server-questions',{questions});
  socket.emit('server-config',config);

  socket.on('create-room', ({name,avatar}) => {
    let code=''; do { code=Math.random().toString(36).slice(2,6).toUpperCase(); } while(rooms.has(code));
    const room={code,hostId:socket.id,started:false,turnId:null,visited:[1],players:new Map(),activeQuestion:null,activeEvent:null};
    room.players.set(socket.id,{id:socket.id,name:String(name||'Jugador').slice(0,35),avatar:avatar||'🤖',pos:1,score:0,skip:false,host:true});
    rooms.set(code,room); socket.join(code);
    socket.emit('room-created',{roomCode:code,players:[...room.players.values()],state:publicState(room)});
  });
  socket.on('join-room', ({roomCode,name,avatar}) => {
    const code=String(roomCode||'').toUpperCase(); const room=rooms.get(code);
    if(!room)return socket.emit('room-error','La sala no existe.');
    if(room.started)return socket.emit('room-error','La partida ya comenzó.');
    if(room.players.size>=4)return socket.emit('room-error','La sala ya tiene 4 jugadores.');
    if([...room.players.values()].some(p=>p.name.toLowerCase()===String(name).trim().toLowerCase()))return socket.emit('room-error','Ese nombre ya está ocupado en la sala.');
    room.players.set(socket.id,{id:socket.id,name:String(name||'Jugador').slice(0,35),avatar:avatar||'🤖',pos:1,score:0,skip:false,host:false});
    socket.join(code); socket.emit('room-joined',{roomCode:code,players:[...room.players.values()],state:publicState(room)}); broadcastLobby(room);
  });
  socket.on('start-game',({roomCode})=>{
    const room=rooms.get(String(roomCode||'').toUpperCase()); if(!room||room.hostId!==socket.id)return;
    if(room.players.size<2||room.players.size>4)return socket.emit('room-error','La partida necesita entre 2 y 4 jugadores.');
    room.started=true; room.turnId=room.hostId; room.visited=[1]; room.activeQuestion=null; room.activeEvent=null;
    io.to(room.code).emit('game-started',{roomCode:room.code,host:room.hostId===socket.id,state:publicState(room)});
    broadcastRoom(room);
  });
  socket.on('roll',({roomCode})=>{
    const room=rooms.get(String(roomCode||'').toUpperCase()); if(!room||!room.started||room.turnId!==socket.id||room.activeQuestion||room.activeEvent)return;
    const p=room.players.get(socket.id); if(!p)return;
    if(p.skip){p.skip=false; room.activeEvent={playerId:p.id,event:{icon:'⏸️',type:'TURNO PERDIDO',title:'Este turno no juegas',msg:'La penalización ya fue cumplida.'}}; io.to(room.code).emit('event-start',{event:room.activeEvent.event,playerName:p.name,message:`${p.name} pierde este turno.`}); broadcastRoom(room); return;}
    const value=1+Math.floor(Math.random()*6); p.pos=Math.min(30,p.pos+value);
    io.to(room.code).emit('dice-rolled',{playerId:p.id,playerName:p.name,value});
    setTimeout(()=>resolveLanding(room,p),250);
    broadcastRoom(room);
  });
  socket.on('answer-question',({roomCode,answer})=>{
    const room=rooms.get(String(roomCode||'').toUpperCase()); if(!room||!room.activeQuestion||room.activeQuestion.answered||room.activeQuestion.playerId!==socket.id)return;
    const idx=room.activeQuestion.questionIndex; const q=questions[idx]; const p=room.players.get(socket.id); const correct=Number(answer)===Number(q.a);
    room.activeQuestion.answered=true; if(correct)p.score+=20; else p.score=Math.max(0,p.score-1);
    io.to(room.code).emit('question-result',{question:q,playerName:p.name,playerId:p.id,correct,answer:Number(answer)}); broadcastRoom(room);
  });
  socket.on('continue-question',({roomCode})=>{
    const room=rooms.get(String(roomCode||'').toUpperCase()); if(!room||!room.activeQuestion||!room.activeQuestion.answered)return;
    if(room.activeQuestion.playerId!==socket.id)return; finishTurn(room);
  });
  socket.on('continue-event',({roomCode})=>{
    const room=rooms.get(String(roomCode||'').toUpperCase()); if(!room||!room.activeEvent)return;
    if(room.activeEvent.playerId!==socket.id)return;
    const p=room.players.get(socket.id), e=room.activeEvent.event;
    if(e.move){p.pos=Math.max(1,Math.min(30,p.pos+e.move));room.visited.push(p.pos);room.visited=[...new Set(room.visited)];}
    if(p.pos>=30){finishTurn(room);return;}
    if(e.extra){room.activeEvent=null;broadcastRoom(room);return;}
    finishTurn(room);
  });
  socket.on('admin-save-questions',({questions:newQuestions})=>{
    if(Array.isArray(newQuestions)&&newQuestions.length===15){questions=newQuestions;writeJson(QUESTIONS_FILE,questions);io.emit('server-questions',{questions});}
  });
  socket.on('admin-save-config',cfg=>{config={...config,...cfg};writeJson(CONFIG_FILE,config);io.emit('server-config',config);});
  socket.on('leave-room',({roomCode})=>{leaveRoom(socket,roomCode);});
  socket.on('disconnect',()=>{for(const [code,room] of rooms){if(room.players.has(socket.id))leaveRoom(socket,code);}});
});
function leaveRoom(socket,roomCode){
  const code=String(roomCode||'').toUpperCase(); const room=rooms.get(code); if(!room)return;
  room.players.delete(socket.id); socket.leave(code);
  if(room.hostId===socket.id){ const first=room.players.values().next().value; if(first){room.hostId=first.id;first.host=true;} }
  if(room.turnId===socket.id){ room.turnId=room.players.keys().next().value||null; }
  if(room.players.size===0){rooms.delete(code);return;}
  broadcastLobby(room); broadcastRoom(room);
}

server.listen(PORT,'0.0.0.0',()=>console.log(`Ruta de las Palabras 4A en puerto ${PORT}`));
