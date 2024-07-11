import http from "http";
import SocketIO from "socket.io";
import express from "express";

const app = express();

app.set("view engine", "pug");
app.set("views", __dirname + "/views");
app.use("/public", express.static(__dirname + "/public"));
app.get("/", (_, res) => res.render("home"));
app.get("/*", (_, res) => res.redirect("/"));

// const handleListen = () => console.log(`Listening on http://localhost:3000`);
const handleListen = () => console.log(`Listening on http://localhost:4000`);

const httpServer = http.createServer(app);
const wsServer = SocketIO(httpServer);

// Important my custom properties:
// socket["nickname"]
// socket["roomName"]

wsServer.on("connection", async (socket) => {
  updatePublicRoomList();

  const defaultNickname = await getDefaultNickname();
  socket["nickname"] = defaultNickname;
  socket.emit("default-nickname-set", defaultNickname);

  socket.onAny((event) => {
    // console.log(wsServer.sockets.adapter);
    console.log(`Socket event: ${event}`);
  });

  socket.on("create-room", async (roomName, callback) => {
    const publicRooms = getPublicRooms();
    let status = "unknown-error";

    if (!publicRooms.includes(roomName)) {
      status = "ok";
      callback({ status });
      await joinRoom(socket, roomName);
      updatePublicRoomList();
    } else {
      status = "room-already-exist";
      callback({ status });
    }
  });

  socket.on("join-room", async (roomName, callback) => {
    const publicRooms = getPublicRooms();
    let status = "unknown-error";

    if (publicRooms.includes(roomName)) {
      status = "ok";
      callback({ status });
      await joinRoom(socket, roomName);
    } else {
      status = "room-not-exist";
      callback({ status });
    }
  });

  socket.on("change-nickname-notify", (oldNickname, newNickname) => {
    socket.rooms.forEach((roomName) => {
      // socket["roomName"]: 현재 자신이 들어가 있는 공용룸(public room)
      if (roomName === socket["roomName"]) {
        wsServer
          .to(roomName)
          .emit("change-nickname-notify", oldNickname, newNickname);
        // console.log("change-nickname-notify roomName:", roomName);

        // 어느 roomName을 타겟으로 보낸 notificiation인지 확인하지 않으면
        // 자신이 들어간 공용룸(public room) +
        // 개인룸(private room)으로 보내진 notification까지 더해져서
        // 2개의 동일한 notification이 자기 자신 소켓으로 보내진다.
        // (상대방한테는 한 번만 감)
        // 이런식으로
        // :
        // "Anonymous3" has changed the nickname to "익명이3".
        // "Anonymous3" has changed the nickname to "익명이3".
        // 콘솔에서는
        // change-nickname-notify roomName: LtEK87HnVDzaYt_KAAAD
        // change-nickname-notify roomName: 1234

        return false;
      }
    });
  });

  socket.on("quit-room", () => {
    const nickname = socket["nickname"];
    const roomName = socket["roomName"];
    const roomParticipantCount = getRoomParticipantCount(roomName) - 1;

    socket.leave(roomName);
    socket
      .to(roomName)
      .emit("some-participant-leave-notify", nickname, roomName, roomParticipantCount);
    updatePublicRoomList();
  });

  socket.on("disconnecting", () => {
    socket.rooms.forEach((roomName) => {
      const roomParticipantCount = getRoomParticipantCount(roomName) - 1;
      socket
        .to(roomName)
        .emit("some-participant-leave-notify", socket["nickname"], roomParticipantCount);
    });
  })

  socket.on("disconnect", () => {
    updatePublicRoomList();
  })

  socket.on("new-message-notify", (message, roomName, callback) => {
    // Double checks if the new message is sent at the proper roomName that
    // the sender is already in or not.
    // cf> socket.rooms 타입은 Set

    let abnormalOperationDetected = true;
    socket.rooms.forEach((_roomName) => {
      // Set에서는 key값과 value(`_roomName`)값은 같다
      // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/forEach

      if (_roomName === roomName) {
        abnormalOperationDetected = false;
        return false; // Stops and get out of forEach
      }
    });

    if (abnormalOperationDetected) {
      callback({ status: "abnormal-operation" });
    } else {
      callback({ status: "ok" });
      
      const nickname = socket["nickname"];
      socket
        .to(roomName)
        .emit("new-message-notify", nickname, message);
    }
  });

  socket.on("change-nickname", async (newNickname, callback) => {
    const userNicknames = await getServerUserNicknames();
    let status = "unknown-error";

    if (!userNicknames.includes(newNickname)) {
      status = "ok";
      callback({ status });
      socket["nickname"] = newNickname;
    } else {
      status = "nickname-already-exist";
      callback({ status });
    }
  });
});


// httpServer.listen(process.env.PORT, handleListen);
httpServer.listen(4000, handleListen);

function getPublicRooms() {
  const { sids, rooms } = wsServer.sockets.adapter;
  const publicRooms = [];
  rooms.forEach((_, key) => {
    if (sids.get(key) === undefined) {
      publicRooms.push(key);
    }
  });
  return publicRooms;
}

function getRoomParticipantCount(roomName) {
  return wsServer.sockets.adapter.rooms.get(roomName)?.size === undefined
    ? 0
    : wsServer.sockets.adapter.rooms.get(roomName).size;
}

async function joinRoom(socket, roomName) {
  const nickname = socket["nickname"];
  socket["roomName"] = roomName;

  // Get preexisting participants` nickname list
  const preexistingParticipantNicknames = await getRoomUserNicknames(roomName);

  // Join the room
  socket.join(roomName);
  // console.log(wsServer.sockets.adapter.rooms);

  // Notify everyone in the room
  const roomParticipantCount = getRoomParticipantCount(roomName)
  socket.emit("join-room", roomName, preexistingParticipantNicknames, roomParticipantCount);
  wsServer
    .to(roomName)
    .emit("new-participant-join-notify", nickname, roomName, roomParticipantCount);
}

function updatePublicRoomList() {
  // Update the room list in the server
  const publicRooms = getPublicRooms();
  wsServer.sockets.emit("update-public-room-list", publicRooms);
}

async function getRoomUserNicknames(roomName) {
  const sockets = await wsServer.in(roomName).fetchSockets();
  const nicknames = sockets
    .map((socket) => socket["nickname"])
    .filter((nickname) => nickname !== undefined);
  return nicknames;
}

async function getServerUserNicknames() {
  const sockets = await wsServer.fetchSockets();
  const nicknames = sockets
    .map((socket) => socket["nickname"])
    .filter((nickname) => nickname !== undefined);
  return nicknames;
}

async function getDefaultNickname() {
  let defaultNickname = "Anonymous";
  const nicknames = await getServerUserNicknames();
  let i = 1;
  while (nicknames.includes(defaultNickname + i)) {
    i++;
  }
  defaultNickname = defaultNickname + i;
  return defaultNickname;
}
