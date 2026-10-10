
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

app.use(express.static(publicDir));

app.get('/', (_req, res) => {
  if (fs.existsSync(indexFile)) {
    return res.sendFile(indexFile);
  }

  res.status(500).send(
    'Missing public/index.html. Please upload your game HTML file to the public folder.'
  );
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
      lastAttack: 0
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
      socket.emit(
        'room:error',
        room.mode === 'pvp'
          ? 'Đây là phòng PvP. Hãy vào từ nút PvP.'
          : 'Đây là phòng Phố Hazen. Hãy vào từ nút Phố Hazen Online.'
      );
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
      lastAttack: 0
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
      if (id === socket.id) continue;

      if (
        Math.abs(attacker.x - target.x) < 100 &&
        Math.abs(attacker.y - target.y) < 100
      ) {
        target.hp = Math.max(0, target.hp - 22);

        io.to(id).emit('pvp:hit', {
          hp: target.hp,
          from: socket.id
        });

        emitPlayers(code);

        if (target.hp <= 0) {
          setTimeout(() => {
            const current = rooms.get(code)?.players.get(id);

            if (current) {
              current.hp = 100;
              current.x = 120 + Math.random() * 80;
              current.y = 200;

              io.to(code).emit('pvp:respawn', {
                id,
                hp: 100
              });

              emitPlayers(code);
            }
          }, 1800);
        }

        break;
      }
    }
  });

  socket.on('room:leave', () => leaveRoom(socket));
  socket.on('disconnect', () => leaveRoom(socket));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Battle King Hazen online server listening on ${PORT}`);
});
