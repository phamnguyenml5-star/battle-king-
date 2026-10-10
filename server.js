const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true },
  maxHttpBufferSize: 1e5
});

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const publicDir = path.join(__dirname, 'public');
const indexFile = path.join(publicDir, 'index.html');

const SKILLS = {
  Q: { damage: 35, rangeX: 180, rangeY: 110, cooldown: 3000 },
  R: { damage: 45, rangeX: 150, rangeY: 140, cooldown: 5000 },
  E: { damage: 25, rangeX: 260, rangeY: 120, cooldown: 4000 },
  F: { damage: 55, rangeX: 200, rangeY: 160, cooldown: 8000 }
};

app.use(express.static(publicDir));

app.get('/', (_req, res) => {
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  res.status(500).send('Missing public/index.html.');
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

function makeCode() {
  let code;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(code));
  return code;
}

function roomPlayers(room) {
  const out = {};
  for (const [id, p] of room.players) {
    out[id] = {
      id,
      name: p.name,
      x: p.x,
      y: p.y,
      face: p.face,
      sitting: p.sitting,
      hp: p.hp
    };
  }
  return out;
}

function emitPlayers(code) {
  const room = rooms.get(code);
  if (room) io.to(code).emit('room:players', roomPlayers(room));
}

function leaveRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;

  const room = rooms.get(code);
  socket.leave(code);
  socket.data.roomCode = null;

  if (!room) return;

  room.players.delete(socket.id);

  if (room.players.size === 0) {
    rooms.delete(code);
    return;
  }

  emitPlayers(code);
}

function respawnPlayer(code, id) {
  const room = rooms.get(code);
  const player = room && room.players.get(id);
  if (!player || player.hp > 0) return;

  player.hp = 100;
  player.x = 120 + Math.random() * 80;
  player.y = 200;

  io.to(code).emit('pvp:respawn', { id, hp: player.hp });
  emitPlayers(code);
}

function damagePlayer(code, attackerId, targetId, damage, skill) {
  const room = rooms.get(code);
  if (!room || room.mode !== 'pvp') return false;

  const attacker = room.players.get(attackerId);
  const target = room.players.get(targetId);

  if (!attacker || !target || attackerId === targetId) return false;
  if (target.hp <= 0) return false;

  target.hp = Math.max(0, target.hp - damage);

  io.to(targetId).emit('pvp:hit', {
    hp: target.hp,
    from: attackerId,
    skill: skill || null
  });

  io.to(code).emit('pvp:damage', {
    attackerId,
    targetId,
    damage,
    hp: target.hp,
    skill: skill || null
  });

  emitPlayers(code);

  if (target.hp <= 0) {
    setTimeout(() => respawnPlayer(code, targetId), 1800);
  }

  return true;
}

io.on('connection', socket => {
  socket.data.roomCode = null;

  socket.on('room:create', (data = {}) => {
    leaveRoom(socket);

    const mode = data.mode === 'chill' ? 'chill' : 'pvp';
    const code = makeCode();

    const room = {
      code,
      mode,
      players: new Map(),
      createdAt: Date.now()
    };

    rooms.set(code, room);
    room.players.set(socket.id, {
      id: socket.id,
      name: 'Hazen',
      x: 80,
      y: 200,
      face: 1,
      sitting: false,
      hp: 100,
      lastAttack: 0,
      skillTimes: {}
    });

    socket.join(code);
    socket.data.roomCode = code;
    socket.emit('room:created', { code, mode });
    emitPlayers(code);
  });

  socket.on('room:join', (data = {}) => {
    const code = String(data.code || '').replace(/\D/g, '').slice(0, 6);
    const room = rooms.get(code);

    if (!/^\d{6}$/.test(code) || !room) {
      socket.emit('room:error', 'Không tìm thấy phòng này. Kiểm tra mã 6 số nhé.');
      return;
    }

    if (room.players.size >= 8) {
      socket.emit('room:error', 'Phòng đã đủ 8 người.');
      return;
    }

    if (data.mode && data.mode !== room.mode) {
      socket.emit('room:error', room.mode === 'pvp'
        ? 'Đây là phòng PvP. Hãy vào từ nút PvP.'
        : 'Đây là phòng Phố Hazen. Hãy vào từ nút Phố Hazen Online.');
      return;
    }

    leaveRoom(socket);

    room.players.set(socket.id, {
      id: socket.id,
      name: 'Hazen',
      x: 120 + Math.random() * 60,
      y: 200,
      face: 1,
      sitting: false,
      hp: 100,
      lastAttack: 0,
      skillTimes: {}
    });

    socket.join(code);
    socket.data.roomCode = code;
    socket.emit('room:joined', {
      code,
      mode: room.mode,
      players: roomPlayers(room)
    });
    emitPlayers(code);
  });

  socket.on('player:update', (data = {}) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    const player = room && room.players.get(socket.id);
    if (!player) return;

    player.x = Math.max(0, Math.min(10000, Number(data.x) || 0));
    player.y = Math.max(0, Math.min(3000, Number(data.y) || 0));
    player.face = Number(data.face) < 0 ? -1 : 1;
    player.sitting = !!data.sitting;

    if (room.mode === 'chill') player.hp = 100;
    emitPlayers(code);
  });

  socket.on('chat:send', (data = {}) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return;

    const text = String(data.text || '').trim().slice(0, 180);
    if (!text) return;

    io.to(code).emit('chat:message', {
      name: 'Người chơi ' + socket.id.slice(0, 4),
      text,
      at: Date.now()
    });
  });

  socket.on('pvp:attack', () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.mode !== 'pvp') return;

    const attacker = room.players.get(socket.id);
    if (!attacker || Date.now() - attacker.lastAttack < 400) return;
    attacker.lastAttack = Date.now();

    for (const [id, target] of room.players) {
      if (id === socket.id || target.hp <= 0) continue;

      if (
        Math.abs(attacker.x - target.x) < 100 &&
        Math.abs(attacker.y - target.y) < 100
      ) {
        damagePlayer(code, socket.id, id, 22, null);
        break;
      }
    }
  });

  socket.on('pvp:skill', (data = {}) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.mode !== 'pvp') return;

    const attacker = room.players.get(socket.id);
    if (!attacker || attacker.hp <= 0) return;

    const skillKey = String(data.skill || data.key || '').toUpperCase();
    const skill = SKILLS[skillKey];
    if (!skill) return;

    const now = Date.now();
    const lastUsed = attacker.skillTimes[skillKey] || 0;
    const remaining = skill.cooldown - (now - lastUsed);

    if (remaining > 0) {
      socket.emit('pvp:skill:cooldown', {
        skill: skillKey,
        remaining
      });
      return;
    }

    attacker.skillTimes[skillKey] = now;

    const hitTargets = [];

    for (const [id, target] of room.players) {
      if (id === socket.id || target.hp <= 0) continue;

      const dx = target.x - attacker.x;
      const dy = Math.abs(target.y - attacker.y);
      const inRange = Math.abs(dx) <= skill.rangeX && dy <= skill.rangeY;
      const inFront = Math.sign(dx) === attacker.face || Math.abs(dx) < 25;

      if (inRange && inFront) {
        damagePlayer(code, socket.id, id, skill.damage, skillKey);
        hitTargets.push(id);
      }
    }

    socket.emit('pvp:skill:result', {
      skill: skillKey,
      hitTargets,
      cooldown: skill.cooldown
    });
  });

  socket.on('room:leave', () => leaveRoom(socket));
  socket.on('disconnect', () => leaveRoom(socket));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Battle King Hazen online server listening on ${PORT}`);
});
