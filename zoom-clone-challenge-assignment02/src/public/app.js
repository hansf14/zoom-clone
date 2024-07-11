const socket = io();

const roomListContainer = document.querySelector(".room-list.container");
const controlPanelContainer = document.querySelector(".control-panel");

const roomCreateContainer = document.querySelector(".room-create.container");
const roomJoinContainer = document.querySelector(".room-join.container");

const participantListContainer = document.querySelector(".participant-list.container");
const participantList = participantListContainer.querySelector(".participant-list");
const chatRoomContainer = document.querySelector(".chat-room");
const messageSendContainer = document.querySelector(".message-send.container");
const messageSendForm = messageSendContainer.querySelector("form");
const messageSendFormInput = messageSendContainer.querySelector("input");
const messageSendPlaceholder = messageSendContainer.querySelector(".message-send-placeholder");
let messageSendPlaceholderChildNodes = [];

const roomList = roomListContainer.querySelector("ul");
const chatBoardContainer = chatRoomContainer.querySelector(".chat-board.container");
const chatBoard = chatBoardContainer.querySelector(".chat-board");
const roomTitle = chatBoardContainer.querySelector(".chat-room-title");
const participantCount = chatBoardContainer.querySelector(".chat-room-participant-count");

const nicknameChangeForm = document.querySelector(".nickname-change form");
const nicknameChangeFormInput = nicknameChangeForm.querySelector("input");

const roomCreateForm = document.querySelector(".room-create form");
const roomCreateFormInput = roomCreateForm.querySelector("input");

const roomJoinForm = document.querySelector(".room-join form")
const roomJoinFormInput = roomJoinForm.querySelector("input");

const roomQuitButton = document.querySelector(".chat-room-quit.container button");

nicknameChangeForm.addEventListener("submit", changeNicknameHandler);
roomCreateForm.addEventListener("submit", createRoomHandler);
roomJoinForm.addEventListener("submit", joinRoomHandler);

// Important my custom properties:
// socket["nickname"]
// socket["roomName"]

const defaultMessageSendPlaceholder = "Message...";

socket.on("default-nickname-set", (nickname) => {
  socket["nickname"] = nickname;
});

socket.on("join-room", (roomName, preexistingParticipantNicknames, roomParticipantCount) => {
  socket["roomName"] = roomName;
  displayChatRoom(roomName, roomParticipantCount);
  addParticipants(preexistingParticipantNicknames);
});

socket.on("new-participant-join-notify", (nickname, roomName, roomParticipantCount) => {
  console.log(`${nickname} has joined the room.`);
  console.log(`Room "${roomName} (${roomParticipantCount} online)"`);

  addJoinMessage(nickname);
  updateParticipantCount(roomParticipantCount);

  if (nickname === socket["nickname"]) {
    // 자기 자신한테서 온 notification이면
    nickname = nickname + " (Me)";
  } 
  addParticipant(nickname);
});

socket.on("some-participant-leave-notify", (nickname, roomName, roomParticipantCount) => {
  console.log(`${nickname} has left the room.`);
  console.log(`Room "${roomName} (${roomParticipantCount} online)"`);

  addLeaveMessage(nickname);
  updateParticipantCount(roomParticipantCount);
  removeParticipant(nickname);
});

socket.on("update-public-room-list", (publicRooms) => {
  roomList.replaceChildren();

  publicRooms.forEach((publicRoom) => {
    const span = document.createElement("span");
    span.textContent = publicRoom;
    span.classList.add("room-name");
  
    const li = document.createElement("li");
    li.appendChild(span);
    roomList.appendChild(li);
  });
});

socket.on("change-nickname-notify", (oldNickname, newNickname) => {
  if (newNickname === socket["nickname"]) {
    oldNickname = oldNickname + " (Me)";
    newNickname = newNickname + " (Me)";
  }

  addNicknameNotifyMessage(oldNickname, newNickname);
  changeParticipant(oldNickname, newNickname);
});

socket.on("new-message-notify", (nickname, message) => {
  addChatMessage(nickname, message);
});

function displayChatRoom(roomName, roomParticipantCount) {
  const classNameHidden = "hidden";

  clearRoomCreateFormInput();
  clearRoomJoinFormInput();

  roomCreateContainer.classList.add(classNameHidden);
  roomJoinContainer.classList.add(classNameHidden);
  participantListContainer.classList.remove(classNameHidden);
  chatRoomContainer.classList.remove(classNameHidden);

  roomTitle.textContent = `<${roomName}>`;
  updateParticipantCount(roomParticipantCount);

  messageSendForm.addEventListener("submit", sendMessageHandler);

  setMessageSendPlaceholderChildNodes();
  setMessageSendPlaceholder();

  messageSendFormInput.addEventListener("focus", messageSendFocusHandler);
  messageSendFormInput.addEventListener("blur", messageSendBlurHandler);
  
  roomQuitButton.addEventListener("click", quitRoomHandler);
}

function hideChatRoom() {
  const classNameHidden = "hidden";

  clearParticipantList();
  clearChatBoard();

  clearMessageSendPlaceholder();
  recoverDefaultMessageSendPlaceholder();

  clearMessageSendFormInput();

  roomCreateContainer.classList.remove(classNameHidden);
  roomJoinContainer.classList.remove(classNameHidden);
  participantListContainer.classList.add(classNameHidden);
  chatRoomContainer.classList.add(classNameHidden);

  messageSendForm.removeEventListener("submit", sendMessageHandler);
  messageSendFormInput.addEventListener("focus", messageSendFocusHandler);
  messageSendFormInput.addEventListener("blur", messageSendBlurHandler);
  roomQuitButton.removeEventListener("click", quitRoomHandler);
}

function updateParticipantCount(roomParticipantCount) {
  participantCount.textContent = `(${roomParticipantCount} online)`
}

function clearParticipantList() {
  participantList.replaceChildren();
}

function clearChatBoard() {
  chatBoard.replaceChildren();
}

function clearRoomCreateFormInput() {
  roomCreateFormInput.value = "";
}

function clearRoomJoinFormInput() {
  roomJoinFormInput.value = "";
}

function clearNicknameChangeFormInput() {
  nicknameChangeFormInput.value = "";
}

function clearMessageSendFormInput() {
  messageSendFormInput.value = "";
}

function clearMessageSendPlaceholder() {
  messageSendFormInput.placeholder = "";
  messageSendPlaceholder.replaceChildren();
}

function setMessageSendPlaceholderChildNodes() {
  const p = document.createElement("p");
  const span = document.createElement("span");
  span.textContent = socket["nickname"];
  span.classList.add("nickname");
  
  p.appendChild(span);
  p.appendChild(document.createTextNode(": ..."));
  messageSendPlaceholderChildNodes = [p]
}

function setMessageSendPlaceholder() {
  clearMessageSendPlaceholder();
  messageSendPlaceholder.append(...messageSendPlaceholderChildNodes);
}

function recoverDefaultMessageSendPlaceholder() {
  messageSendFormInput.value = defaultMessageSendPlaceholder;
}

function addJoinMessage(nickname) {
  const span = document.createElement("span");
  span.textContent = `"${nickname}"`;
  span.classList.add("nickname");

  const li = document.createElement("li");
  li.appendChild(span);
  li.appendChild(document.createTextNode(" has joined the room."));
  chatBoard.appendChild(li);
}

function addLeaveMessage(nickname) {
  const span = document.createElement("span");
  span.textContent = `"${nickname}"`;
  span.classList.add("nickname");

  const li = document.createElement("li");
  li.appendChild(span);
  li.appendChild(document.createTextNode(" has left the room."));
  chatBoard.appendChild(li);
}

function addNicknameNotifyMessage(oldNickname, newNickname) {
  let span = document.createElement("span");
  span.textContent = `"${oldNickname}"`;
  span.classList.add("nickname");

  const li = document.createElement("li");
  li.appendChild(span);
  li.appendChild(document.createTextNode(" has changed the nickname to "));

  span = document.createElement("span");
  span.textContent = `"${newNickname}"`;
  span.classList.add("nickname");

  li.appendChild(span);
  li.appendChild(document.createTextNode("."));
  chatBoard.appendChild(li);
}

function addChatMessage(nickname, message) {
  const span = document.createElement("span");
  span.textContent = `"${nickname}"`;
  span.classList.add("nickname");

  const li = document.createElement("li");
  li.appendChild(span);
  li.appendChild(document.createTextNode(`: ${message}`));
  chatBoard.appendChild(li);
}


function addParticipant(nickname) {
  const span = document.createElement("span");
  span.textContent = nickname;
  span.classList.add("nickname");

  const li = document.createElement("li");
  li.appendChild(span);
  participantList.appendChild(li);
}

function addParticipants(nicknames) {
  const lis = nicknames.map((nickname) => {
    const span = document.createElement("span");
    span.textContent = nickname;
    span.classList.add("nickname");

    const li = document.createElement("li");
    li.appendChild(span);
    return li;
  });
  
  participantList.append(...lis);
}

function removeParticipant(nickname) {
  const spans = participantList.querySelectorAll("span");
  for (const span of spans) {
    if (span.textContent === nickname) {
      span.parentElement.remove(); // li
    }
  }
}

function changeParticipant(oldNickname, newNickname) {
  const spans = participantList.querySelectorAll("span");
  for (const span of spans) {
    if (span.textContent === oldNickname) {
      span.textContent = newNickname;
    }
  }
}

function createRoomHandler(event) {
  event.preventDefault();
  const roomName = roomCreateFormInput.value;
  
  clearNicknameChangeFormInput();
  clearRoomCreateFormInput();
  clearRoomJoinFormInput();

  if (roomName.trim() === "") {
    alert("The room name cannot be an empty text nor only include whitespaces.");
    return;
  }

  socket.emit("create-room", roomName, (res) => {
    if (res.status === "ok") {
      console.log(`"${socket["nickname"]}" has created the room: "${roomName}"`);
    } else {
      // Error
      switch (res.status) {
        case "room-already-exist":
          alert(`The room "${roomName}" already exists. You can't create that room.`);
          break;
        default:
          alert(res.status);
          break;
      }
    }
  });
}

function joinRoomHandler(event) {
  event.preventDefault();
  const roomName = roomJoinFormInput.value;
  
  clearNicknameChangeFormInput();
  clearRoomCreateFormInput();
  clearRoomJoinFormInput();

  if (roomName.trim() === "") {
    alert("The room name cannot be an empty text nor only include whitespaces.");
    return;
  }

  socket.emit("join-room", roomName, (res) => {
    if (res.status === "ok") {
      console.log(`"${socket["nickname"]}" has joined the room: "${roomName}"`);
    } else {
      // Error
      switch (res.status) {
        case "room-not-exist":
          alert(`The room "${roomName}" does not exist. You can't join that room.`);
          break;
        default:
          alert(res.status);
          break;
      }
    }
  });
}

function changeNicknameHandler(event) {
  event.preventDefault();
  const newNickname = nicknameChangeFormInput.value;
  
  clearNicknameChangeFormInput();
  clearRoomCreateFormInput();
  clearRoomJoinFormInput();

  if (newNickname.trim() === "" || /[\s]/.test(newNickname)) {
    alert("Nickname cannot be an empty text or include whitespaces.");
    return;
  }

  const oldNickname = socket["nickname"];
  if (newNickname.trim() === oldNickname) {
    alert(`The new nickname is the same as the old nickname. Your nickname "${oldNickname}" will remain the same.`);
  }

  socket.emit("change-nickname", newNickname, (res) => {
    if (res.status === "ok") {
      socket["nickname"] = newNickname;

      setMessageSendPlaceholderChildNodes();
      setMessageSendPlaceholder();

      socket.emit("change-nickname-notify", oldNickname, newNickname);
      
      alert(`Your nickname has been changed to "${newNickname}".`);
    } else {
      // Error
      switch (res.status) {
        case "nickname-already-exist":
          alert(`The nickname "${newNickname}" already exists. You can't change to that nickname.`);
          break;
        default:
          alert(res.status);
          break;
      }
    }
  });
}

function sendMessageHandler(event) {
  event.preventDefault();
  const message = messageSendFormInput.value;
  clearMessageSendFormInput();

  const nickname = socket["nickname"];
  const roomName = socket["roomName"];
  socket.emit("new-message-notify", message, roomName, (res) => {
    if (res.status === "ok") {
      addChatMessage(nickname + " (Me)", message);
    } else {
      console.warn("Abnormal operation detected when sending a message.");
    }
  });
}

function quitRoomHandler(event) {
  const nickname = socket["nickname"];
  socket.emit("quit-room");
  hideChatRoom();
}

function messageSendFocusHandler() {
  clearMessageSendPlaceholder();
}

function messageSendBlurHandler() {
  if (messageSendFormInput.value === "") {
    setMessageSendPlaceholder();
  }
}
