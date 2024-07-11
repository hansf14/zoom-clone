import http from "http";
import WebSocket from "ws";
import express from "express";

const app = express();

app.set("view engine", "pug");
app.set("views", __dirname + "/views");
app.use("/public", express.static(__dirname + "/public"));
app.get("/", (_, res) => res.render("home"));
app.get("/*", (_, res) => res.redirect("/"));

// const handleListen = () => console.log(`Listening on http://localhost:3000`);
const handleListen = () => console.log(`Listening on http://localhost:4000`);

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const sockets = [];
wss.on("connection", (socket, req) => {
  let defaultGivenNickname = "Anonymous1";
  let socketWithGivenNickname = null;
  for (let i = 2; socketWithGivenNickname !== undefined; i++) {
    socketWithGivenNickname = sockets.find((_socket) => _socket["nickname"] === defaultGivenNickname);
    if (socketWithGivenNickname === undefined) {
      socket["nickname"] = defaultGivenNickname;
    } else {
      defaultGivenNickname = `Anonymous${i}`;
    }
  }
  console.log(`${socket["nickname"]}: Connected to the browser.`);
  socket.send(makeMessage("default-nickname", socket["nickname"]));

  sockets.push(socket);

  // console.log(socket);
  // console.log(req);

  socket.on("close", () => {
    console.log(`${socket["nickname"]}: Disconnected from the browser.`);

    const index = sockets.findIndex((_socket) => _socket["nickname"] === socket["nickname"]);
    sockets.splice(index, 1);

    sockets.forEach((_socket) => {
      _socket.send(makeMessage("leave-broadcast", { nickname: socket["nickname"] }));
    })
  });
  socket.on("message", (data, isBinary) => {
    let msg = isBinary ? data : data.toString("utf-8");

    if (isBinary) {
      return;
    }
    msg = JSON.parse(msg);

    let msgToClient = makeMessage("error", "Error: Something went wrong.");
    switch (msg.type) {
      case "join":
        const membersExcludingSelfNicknames = sockets
          .filter((_socket) => _socket["nickname"] !== socket["nickname"])
          .map((_socket) => _socket["nickname"]);

        sockets.forEach((_socket) => {
          if (_socket["nickname"] === socket["nickname"]) {
            _socket.send(makeMessage("join-broadcast", {
              nickname: socket["nickname"],
              additionalMembersNicknames: membersExcludingSelfNicknames
            }));
          } else {
            _socket.send(makeMessage("join-broadcast", {
              nickname: socket["nickname"],
              additionalMembersNicknames: []
            }));
          }
        });
        break;
      case "nickname-change":
        const prevNickname = socket["nickname"];
        const newNickname = msg.payload;
        let socketWithGivenNickname = null;
        socketWithGivenNickname = sockets.find((_socket) => _socket["nickname"] === newNickname);
        if (socketWithGivenNickname !== undefined) {
          msgToClient = makeMessage("nickname-change-fail", `Error: Nickname change failed - The nickname "${newNickname}" already exists.`);
          socket.send(msgToClient);
        } else {
          socket["nickname"] = newNickname;

          msgToClient = makeMessage("nickname-change-success", newNickname);
          socket.send(msgToClient);

          msgToClient = makeMessage("nickname-change-broadcast", { prevNickname, newNickname });
          sockets.forEach((_socket) => {
            _socket.send(msgToClient);
          });
        }
        break;
      case "new-message":
        msgToClient = makeMessage("new-message", { nickname: socket["nickname"], msgContent: msg.payload });
        sockets.forEach((_socket) => {
          if (_socket["nickname"] !== socket["nickname"]) {
            _socket.send(msgToClient);
          }
        });
        break;
      default:
        console.warn(`Undefined message type: ${msg.type}`);
        break;
    }
  });
});

function makeMessage(type, payload) {
  const msg = { type, payload }
  return JSON.stringify(msg);
}

// server.listen(3000, handleListen);
server.listen(4000, handleListen);
