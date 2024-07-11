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
// socket["joinedPublicRoomNames"]

const roomTypes = [
  "GROUP-CHAT",
  "VIDEO-CHAT",
  "UNKNOWN"
];

const participantTypes = [
  "HOST",
  "MANAGER",
  "GUEST",
  "UNKNOWN"
];

const publicRoomsLookUpTable = new Map();
// Map([ roomName => {
//   roomType: ...,
//   roomHostNickname: host nickname from participants,
//   roomManagerNicknames: [manager nicknames from participants],
//   roomCreationDateTime: ...,
//   participants: Map([
//     nickname => {
//       socket: ...,
//       participantType: ...,
//       roomJoinDateTime: ...
//     },
//     ...
//   ])
// }, ...])

publicRoomsLookUpTable.addRoom = function ({ roomName, roomType }) {
  let roomDetail = this.get(roomName);
  if (roomDetail) {
    console.warn(`The room "${roomName}" already exists on the table.`);
    return false;
  }

  const currentDateTime = new Date();
  roomDetail = {
    roomType,
    roomHostNickname: null,
    roomManagerNicknames: [],
    roomCreationDateTime: currentDateTime,
    participants: new Map()
  };
  this.set(roomName, roomDetail);
  return true;
}

publicRoomsLookUpTable.removeRoom = function ({ roomName }) {
  const roomDetail = this.get(roomName);
  if (!roomDetail) {
    console.warn(`The room "${roomName}" does not exist on the table.`);
    return false;
  }

  this.delete(roomName);
  return true;
}

publicRoomsLookUpTable.addParticipant = function ({ socket, roomName, participantType }) {
  console.log("[publicRoomsLookUpTable.addParticipant]");

  let roomDetail = this.get(roomName);
  if (!roomDetail) {
    console.warn(`The room "${roomName}" does not exist on the table.`);
    return false;
  }

  const nickname = socket["nickname"];
  let participantDetail = roomDetail.participants.get(nickname);
  if (participantDetail) {
    console.warn(`The participant "${nickname}" already exists in the room "${roomName}".`);
    return false;
  }

  switch (participantType) {
    case "HOST":
      if (!roomDetail.roomHostNickname) {
        roomDetail.roomHostNickname = nickname;
      } else {
        console.warning(`Host already exists in the room "${roomName}": "${roomDetail.roomHostNickname}".`);
      }
      break;
    case "MANAGER":
      roomDetail.roomManagerNicknames.push(nickname);
      break;
    case "GUEST":
      break;
    default:
      console.warn('Invalid participant type at: "publicRoomsLookUpTable.addParticipant".');
      return false;
  }

  participantDetail = createNewParticipantDetail({ socket, participantType })
  roomDetail.participants.set(nickname, participantDetail);

  return true;
}

publicRoomsLookUpTable.removeParticipant = function ({ roomName, nickname }) {
  let roomDetail = this.get(roomName);
  if (!roomDetail) {
    console.warn(`The room "${roomName}" does not exist on the table.`);
    return false;
  }

  const participantDetail = roomDetail.participants.get(nickname);
  if (!participantDetail) {
    console.warn(`The participant "${nickname}" does not exist in the room "${roomName}".`);
    return false;
  }

  const participantType = participantDetail.participantType;
  switch (participantType) {
    case "HOST":
      if (roomDetail.participants.size !== 1) {
        console.warning(`Host("${roomDetail.roomHostNickname}") cannot be directly removed from the room("${roomName}") unless the room has only one participant.`);
        return false;
      } else {
        roomDetail.roomHostNickname = null;
        roomDetail.participants.delete(nickname);
        return true;
      }
    case "MANAGER": {
      const idx = roomDetail.roomManagerNicknames.findIndex((roomManagerNickname) => roomManagerNickname === nickname);
      roomDetail.roomManagerNicknames.splice(idx, 1);
      break;
    }
    case "GUEST":
      break;
    default:
      console.warn('Invalid participant type at: "publicRoomsLookUpTable.addParticipant".');
      return false;
  }

  roomDetail.participants.delete(nickname);
  return true;
}

publicRoomsLookUpTable.changeHost = function ({ roomName, newHostNickname }) {
  let roomDetail = this.get(roomName);
  if (!roomDetail) {
    console.warn(`The room "${roomName}" does not exist on the table.`);
    return false;
  }

  const oldHostNickname = roomDetail.roomHostNickname;
  const oldHostParticipantDetail = roomDetail.participants.get(oldHostNickname);
  const newHostParticipantDetail = roomDetail.participants.get(newHostNickname);
  if (!oldHostParticipantDetail) {
    console.warn(`The participant "${oldHostNickname}" does not exist in the room "${roomName}".`);
    return false;
  }
  if (!newHostParticipantDetail) {
    console.warn(`The participant "${newHostNickname}" does not exist in the room "${roomName}".`);
    return false;
  }
  if (oldHostParticipantDetail.participantType !== "HOST") {
    console.warn(`The participant "${oldHostNickname}" is not a host in the room "${roomName}".`);
    return false;
  }
  if (newHostParticipantDetail.participantType === "HOST") {
    console.warn(`The participant "${newHostNickname}" is already a host in the room "${roomName}".`);
    return false;
  }

  if (newHostParticipantDetail.participantType === "MANAGER") {
    const idx = roomDetail.roomManagerNicknames.findIndex((roomManagerNickname) => roomManagerNickname === newHostParticipantDetail);
    roomDetail.roomManagerNicknames.splice(idx, 1);
  }
  oldHostParticipantDetail.participantType = "MANAGER";
  roomDetail.roomManagerNicknames.push(oldHostNickname);
  newHostParticipantDetail.participantType = "HOST";
  roomDetail.roomHostNickname = newHostNickname;
  return true;
}

publicRoomsLookUpTable.cloneParticipantsForClient = function ({ roomName }) {
  return [...this.get(roomName).participants.entries()]
    .map(([nickname, participantDetail]) => {
      const { socket, ...participantDetailClone } = { ...participantDetail };
      return [nickname, participantDetailClone];
    });
}

publicRoomsLookUpTable.clonePublicRoomsForClient = function () {
  return [...this.entries()]
    .map(([roomName, roomDetail]) => {
      const roomDetailClone = { ...roomDetail };
      const participantsClone = this.cloneParticipantsForClient({ roomName });
      roomDetailClone.participants = participantsClone;
      return [roomName, roomDetailClone];
    });
}

publicRoomsLookUpTable.getRoomInfoForClient = function ({ roomName }) {
  const roomDetailClone = { ...this.get(roomName) };
  roomDetailClone.participants = this.cloneParticipantsForClient({ roomName });

  return {
    roomName,
    ...roomDetailClone
  };
}

publicRoomsLookUpTable.getRoomParticipantInfoForClient = function ({ roomName, nickname }) {
  const { socket, ...participantDetailClone } = { ...this.get(roomName).participants.get(nickname) };

  return {
    nickname,
    ...participantDetailClone
  };
}

publicRoomsLookUpTable.changeNickname = function ({ socket, newNickname }) {
  const oldNickname = socket["nickname"];
  for (const roomName of socket["joinedPublicRoomNames"]) {
    const roomDetail = this.get(roomName);
    if (roomDetail.roomHostNickname === oldNickname) {
      roomDetail.roomHostNickname = newNickname;
    }
    const participantDetail = roomDetail.participants.get(oldNickname);
    roomDetail.participants.delete(oldNickname);
    roomDetail.participants.set(newNickname, participantDetail);
  }
}

function createNewParticipantDetail({ socket, participantType }) {
  return {
    socket,
    participantType,
    roomJoinDateTime: new Date()
  };
}

// TODO: emit "room-type-change" event
// publicRoomsLookUpTable.changeRoomType = function (roomName, roomType) {
//   const room = this.get(roomName);
//   if (!room) {
//     console.warn(`The room "${roomName}" does not exist on the table.`);
//     return false;
//   }
//   room.roomType = roomType;
//   return true;
// }

wsServer.on("connection", async (socket) => {
  updatePublicRoomList();

  const defaultNickname = await getDefaultNickname();
  socket["nickname"] = defaultNickname;
  socket["joinedPublicRoomNames"] = [];
  socket.emit("default-nickname-set", { nickname: defaultNickname });

  socket.onAny((event) => {
    // console.log(wsServer.sockets.adapter);
    console.log(`Socket event: ${event}`);
  });

  socket.on("create-room", ({ roomName, roomType }, callback) => {
    let status = "unknown-error";
    let hasRoomTypeError = false;

    switch (roomType) {
      case "GROUP-CHAT":
      case "VIDEO-CHAT":
        break;
      default:
        hasRoomTypeError = true;
        console.warn('Invalid room type at: "create-room".');
        break;
    }

    if (hasRoomTypeError) {
      status = "invalid-room-type";
      callback({ status });
      return;
    }

    const roomDetail = publicRoomsLookUpTable.get(roomName);
    if (!roomDetail) {
      status = "ok";
      callback({ status });

      const participantType = "HOST";
      joinRoom({ socket, roomName, roomType, participantType });

      updatePublicRoomList();
    } else {
      status = "room-already-exist";
      callback({ status });
    }
  });

  socket.on("join-room", ({ roomName }, callback) => {
    let status = "unknown-error";

    const roomDetail = publicRoomsLookUpTable.get(roomName);
    if (roomDetail) {
      const roomType = roomDetail.roomType;
      switch (roomType) {
        case "GROUP-CHAT": {
          status = "ok";
          callback({ status });

          const participantType = "GUEST";
          joinRoom({ socket, roomName, roomType, participantType });
          break;
        }
        case "VIDEO-CHAT": {
          const participantCount = roomDetail.participants.size;
          if (participantCount === 1) {
            status = "ok";
            callback({ status });

            const participantType = "GUEST";
            joinRoom({ socket, roomName, roomType, participantType });
          } else if (participantCount === 2) {
            status = "video-chat-full";
            callback({ status });
          } else {
            status = "invalid-video-chat-participant-count";
            callback({ status });
          }
          break;
        }
        default: {
          status = "invalid-room-type";
          callback({ status });
          return;
        }
      }
    } else {
      status = "room-not-exist";
      callback({ status });
      return;
    }
  });

  socket.on("change-nickname-notify", ({ oldNickname, newNickname }) => {
    const roomNames = socket["joinedPublicRoomNames"];
    roomNames.forEach((roomName) => {
      wsServer
        .to(roomName)
        .emit("change-nickname-notify", { roomName, oldNickname, newNickname });
    });
    updatePublicRoomList();
  });

  socket.on("quit-room", ({ roomName }) => {
    leaveRoom({ socket, roomName });
  });

  socket.on("rtc-signaling-check-initiation", ({ roomName }, callback) => {
    // Double check if the event emitter is really in the room or not.
    // Double check if the room type is correctly "VIDEO-CHAT" or not.
    let abnormalOperationDetected = !isInRoom(socket, roomName)
      || publicRoomsLookUpTable.get(roomName).roomType !== "VIDEO-CHAT";

    if (abnormalOperationDetected) {
      callback({ status: "abnormal-operation" });
    } else {
      const participantCount = getRoomParticipantCount(roomName);
      if (participantCount === 1) {
        callback({ status: "idle" });
      } else if (participantCount === 2) {
        callback({ status: "start" });

        [...publicRoomsLookUpTable.get(roomName).participants.values()]
          .forEach((participantDetail) => {
            if (participantDetail.participantType === "HOST") {
              participantDetail.socket.emit("rtc-caller-connection-start", { roomName });
            } else {
              participantDetail.socket.emit("rtc-receiver-connection-start");
            }
          });
      } else {
        callback({ status: "too-many-participants" });
      }
    }
  });

  socket.on("rtc-signaling-transmit-offer", ({ offer, roomName }) => {
    socket.to(roomName).emit("rtc-signaling-transmit-offer", { offer, roomName });
    // broadcast (`to`)
  });

  socket.on("rtc-signaling-transmit-answer", ({ answer, roomName }) => {
    socket.to(roomName).emit("rtc-signaling-transmit-answer", { answer });
    // broadcast (`to`)
  });

  socket.on("rtc-signaling-transmit-ice", ({ iceCandidate, roomName }) => {
    socket.to(roomName).emit("rtc-signaling-transmit-ice", { iceCandidate });
  });

  socket.on("disconnecting", () => {
    leaveAllRooms({ socket });
  });

  socket.on("disconnect", () => {
    // updatePublicRoomList();
  });

  socket.on("new-message-notify", ({ roomName, message }, callback) => {
    // Double checks if the new message is sent at the proper roomName that
    // the sender is already in or not.
    const abnormalOperationDetected = !isInRoom(socket, roomName);
    if (abnormalOperationDetected) {
      callback({ status: "abnormal-operation" });
    } else {
      callback({ status: "ok" });

      const nickname = socket["nickname"];
      socket.to(roomName).emit("new-message-notify", { roomName, nickname, message });
    }
  });

  socket.on("change-nickname", async ({ newNickname }, callback) => {
    const userNicknames = await getServerUserNicknames();
    let status = "unknown-error";

    if (!userNicknames.includes(newNickname)) {
      status = "ok";
      changeNickname({ socket, newNickname })
      callback({ status });
    } else {
      status = "nickname-already-exist";
      callback({ status });
    }
  });
});

// httpServer.listen(process.env.PORT, handleListen);
httpServer.listen(4000, handleListen);

function changeNickname({ socket, newNickname }) {
  // Execution order matters.
  publicRoomsLookUpTable.changeNickname({ socket, newNickname });
  socket["nickname"] = newNickname;
}

function isInRoom(socket, roomName) {
  // socket.rooms.forEach((_roomName) => {
  // cf> socket.rooms 타입은 Set
  //   // Set에서는 key값과 value(`_roomName`)값은 같다
  //   // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/forEach
  //
  //   if (_roomName === roomName) {
  //     abnormalOperationDetected = false;
  //     return false; // Stops and get out of forEach
  //   }
  // });
  return !!socket.rooms.has(roomName);
}

function isPublicRoom(roomName) {
  return !!publicRoomsLookUpTable.get(roomName);
}

function getPublicRooms() {
  // const { sids, rooms } = wsServer.sockets.adapter;
  // const publicRooms = [];
  // rooms.forEach((_, key) => {
  //   if (sids.get(key) === undefined) {
  //     publicRooms.push(key);
  //   }
  // });
  // return publicRooms;

  return publicRoomsLookUpTable.clonePublicRoomsForClient();
}

function getRoomParticipantCount(roomName) {
  // return wsServer.sockets.adapter.rooms.get(roomName)?.size === undefined
  //   ? 0
  //   : wsServer.sockets.adapter.rooms.get(roomName).size;

  return publicRoomsLookUpTable.get(roomName).participants.size;
}

function joinRoom({ socket, roomName, roomType, participantType }) {
  console.log("[joinRoom]");

  // Join the room
  socket.join(roomName);
  // console.log(wsServer.sockets.adapter.rooms);
  socket["joinedPublicRoomNames"].push(roomName);

  const nickname = socket["nickname"];
  let roomInfo = null;
  if (!publicRoomsLookUpTable.get(roomName)) {
    publicRoomsLookUpTable.addRoom({ roomName, roomType });

    roomInfo = publicRoomsLookUpTable.getRoomInfoForClient({ roomName });
    publicRoomsLookUpTable.addParticipant({ socket, roomName, participantType });
  } else {
    roomInfo = publicRoomsLookUpTable.getRoomInfoForClient({ roomName });
    publicRoomsLookUpTable.addParticipant({ socket, roomName, participantType });
  }
  const participantInfo = publicRoomsLookUpTable.getRoomParticipantInfoForClient({ roomName, nickname });

  // Notify everyone in the room
  socket.emit("join-room", { roomInfo, participantInfo });
  wsServer
    .to(roomName)
    .emit(
      "new-participant-join-notify",
      {
        roomName,
        participantInfo
      }
    );
}

function leaveRoom({ socket, roomName }) {
  const nickname = socket["nickname"];
  const roomDetail = publicRoomsLookUpTable
    .get(roomName);
  const participants = roomDetail.participants;
  const participantType = participants
    .get(nickname)
    .participantType;
  let roomRemoved = false;

  if (participantType === "HOST") {
    if (roomDetail.participants.size === 1) {
      publicRoomsLookUpTable.removeRoom({ roomName });
      roomRemoved = true;
    } else {
      const hostCandidateNickname = getHostCandidateNickname({ roomName });
      if (hostCandidateNickname) {
        publicRoomsLookUpTable.changeHost({ roomName, newHostNickname: hostCandidateNickname });
      } else {
        console.warn("Couldn't find adequate host candidate.");
        return;
      }
    }
  }

  if (!roomRemoved) {
    publicRoomsLookUpTable.removeParticipant({ roomName, nickname });
  }

  const idx = socket["joinedPublicRoomNames"].findIndex((joinedPublicRoomName) => joinedPublicRoomName === roomName);
  socket["joinedPublicRoomNames"].splice(idx, 1);

  socket.leave(roomName);
  socket
    .to(roomName)
    .emit("some-participant-leave-notify", { roomName, nickname });

  updatePublicRoomList();
}

function leaveAllRooms({ socket }) {
  console.log("[leaveAllRooms]");

  const nickname = socket["nickname"];
  // socket.rooms.forEach((roomName) => {
  //   socket
  //     .to(roomName)
  //     .emit(
  //       "some-participant-leave-notify",
  //       {
  //         nickname,
  //         roomName
  //       }
  //     );
  // });

  socket["joinedPublicRoomNames"].forEach((joinedPublicRoomName) => {
    const roomDetail = publicRoomsLookUpTable
      .get(joinedPublicRoomName);
    const participants = roomDetail.participants;
    const participantType = participants
      .get(nickname)
      .participantType;
    let roomRemoved = false;

    if (participantType === "HOST") {
      if (roomDetail.participants.size === 1) {
        publicRoomsLookUpTable.removeRoom({ roomName: joinedPublicRoomName });
        roomRemoved = true;
      } else {
        const hostCandidateNickname = getHostCandidateNickname({ roomName: joinedPublicRoomName });
        if (!hostCandidateNickname) {
          publicRoomsLookUpTable.changeHost({ roomName: joinedPublicRoomName, newHostNickname: hostCandidateNickname });
        } else {
          console.warn("Couldn't find adequate host candidate.");
          return;
        }
      }
    }

    if (!roomRemoved) {
      publicRoomsLookUpTable.removeParticipant({ roomName: joinedPublicRoomName, nickname });
    }

    socket.leave(joinedPublicRoomName);
    socket
      .to(joinedPublicRoomName)
      .emit(
        "some-participant-leave-notify",
        {
          roomName: joinedPublicRoomName,
          nickname
        }
      );
  });

  socket["joinedPublicRoomNames"] = [];
  updatePublicRoomList();
}

function getHostCandidateNickname({ roomName }) {
  // Candidate: longest stay manager. If not exist, longest stay guest.
  const roomDetail = publicRoomsLookUpTable.get(roomName)
  let oldHostNickname = roomDetail.roomHostNickname;
  let hostCandidateNickname = null;

  const managers = [...roomDetail.participants.entries()].filter(([nickname, participantDetail]) => participantDetail.participantType === "MANAGER");
  hostCandidateNickname = getLongestStayParticipantFromParticipantEntries(managers);
  if (hostCandidateNickname === null) {
    const guests = [...roomDetail.participants.entries()].filter(([nickname, participantDetail]) => participantDetail.participantType === "GUEST");
    hostCandidateNickname = getLongestStayParticipantFromParticipantEntries(guests);
  }
  return hostCandidateNickname;
}

function getLongestStayParticipantFromParticipantEntries(entries) {
  let longestStayParticipantNickname = null;
  let leastTimeAmountSince1970Jan1st = Infinity;

  // Get the smallest number time amount since 1970, Jan 1st.
  for (const [nickname, participantDetail] of [...entries]) {
    const timeAmountSince1970Jan1st = participantDetail.roomJoinDateTime.getTime();
    if (timeAmountSince1970Jan1st < leastTimeAmountSince1970Jan1st) {
      leastTimeAmountSince1970Jan1st = timeAmountSince1970Jan1st;
      longestStayParticipantNickname = nickname;
    }
  }
  return longestStayParticipantNickname;
}

function updatePublicRoomList() {
  console.log("[updatePublicRoomList]");

  // Update the room list in the server
  const publicRooms = getPublicRooms();

  wsServer.sockets.emit("update-public-room-list", { publicRooms });
}

async function getRoomUserSockets(roomName) {
  return await wsServer.in(roomName).fetchSockets();
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
