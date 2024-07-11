// eslint-disable-next-line no-undef
const socket = io();
alert("Currently under maintenance... (Upgrading functionalities)")
//////////////////////////////////////////////////////
// Chat Room List
const chatRoomListContainer = document.querySelector(".chat-room-list-container");
const chatRoomList = chatRoomListContainer.querySelector(".chat-room-list");

//////////////////////////////////////////////////////
// Control Panel
const controlPanel = document.querySelector(".control-panel");

const groupChatRoomParticipantListContainer = controlPanel.querySelector(
  ".group-chat-room-participant-list-container"
);
const groupChatRoomParticipantList = groupChatRoomParticipantListContainer.querySelector(
  ".group-chat-room-participant-list"
);

const videoChatRoomParticipantListContainer = controlPanel.querySelector(
  ".video-chat-room-participant-list-container"
);
const videoChatRoomParticipantList = videoChatRoomParticipantListContainer.querySelector(
  ".video-chat-room-participant-list"
);

const nicknameChangeForm = controlPanel.querySelector(".nickname-change-container form");
const nicknameChangeFormInput = nicknameChangeForm.querySelector("input");

const chatRoomCreateContainer = controlPanel.querySelector(".chat-room-create-container");
const chatRoomCreateForm = chatRoomCreateContainer.querySelector("form");
const chatRoomTypeSelect = chatRoomCreateForm.querySelector(".chat-room-type select");
const chatRoomCreateFormInput = chatRoomCreateForm.querySelector(".chat-room-name input");

const chatRoomJoinContainer = controlPanel.querySelector(".chat-room-join-container");
const chatRoomJoinForm = chatRoomJoinContainer.querySelector("form");
const chatRoomJoinFormInput = chatRoomJoinForm.querySelector("input");

//////////////////////////////////////////////////////
// Group Chat
const groupChatRoom = document.querySelector(".group-chat-room");
const groupChatRoomBoardContainer = groupChatRoom.querySelector(
  ".group-chat-room__board-container"
);
const groupChatRoomTitle = groupChatRoomBoardContainer.querySelector(".group-chat-room__title");
const groupChatRoomParticipantCount = groupChatRoomBoardContainer.querySelector(
  ".group-chat-room__participant-count"
);
const groupChatRoomMessageBoard = groupChatRoomBoardContainer.querySelector(".group-chat-room__message-board");

const groupChatRoomPublicMessageSendContainer = groupChatRoom.querySelector(".group-chat-room__public-message-send-container");
const groupChatRoomPublicMessageSendForm = groupChatRoomPublicMessageSendContainer.querySelector("form");
const groupChatRoomPublicMessageSendFormInput = groupChatRoomPublicMessageSendForm.querySelector("input");
const groupChatRoomPublicMessageSendPlaceholder = groupChatRoomPublicMessageSendForm.querySelector(
  ".group-chat-room__public-message-send-placeholder"
);

const groupChatRoomQuitButton = groupChatRoom.querySelector(
  ".group-chat-room__quit-container button"
);

//////////////////////////////////////////////////////
nicknameChangeForm.addEventListener("submit", changeNicknameHandler);
chatRoomCreateForm.addEventListener("submit", createChatRoomHandler);
chatRoomJoinForm.addEventListener("submit", joinChatRoomHandler);

//////////////////////////////////////////////////////
// Important my custom properties:
// socket["nickname"]

const roomTypes = [
  "GROUP-CHAT",
  "VIDEO-CHAT"
];
const joinedPublicRoomsLookUpTable = new Map();
// Map([ roomName => {
//   roomType: ...,
//   roomHostNickname: host nickname from participants,
//   roomManagerNicknames: manager nicknames from participants,
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

joinedPublicRoomsLookUpTable.addRoom = function ({ roomInfo }) {
  const roomName = roomInfo.roomName;
  const roomDetail = { ...roomInfo };
  delete roomDetail.roomName;
  roomDetail.participants = new Map(roomDetail.participants);
  this.set(roomName, roomDetail);
}

joinedPublicRoomsLookUpTable.removeRoom = function ({ roomName }) {
  this.delete(roomName);
}

joinedPublicRoomsLookUpTable.addParticipant = function ({ roomName, participantInfo }) {
  const { nickname, ...participantDetail } = participantInfo;
  const participantType = participantDetail.participantType;
  const roomDetail = this.get(roomName);
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
      console.warn('Invalid participant type at: "joinedPublicRoomsLookUpTable.addParticipant".');
      return false;
  }
  roomDetail.participants.set(nickname, participantDetail);
}

joinedPublicRoomsLookUpTable.removeParticipant = function ({ roomName, nickname }) {
  const roomDetail = this.get(roomName);
  const participantType = roomDetail.participants.get(nickname).participantType;
  switch (participantType) {
    case "HOST":
      roomDetail.roomHostNickname = null;
      break;
    case "MANAGER": {
      const idx = roomDetail.roomManagerNicknames.findIndex((roomManagerNickname) => roomManagerNickname === nickname);
      roomDetail.roomManagerNicknames.splice(idx, 1);
      break;
    }
    case "GUEST":
      break;
    default:
      console.warn('Invalid participant type at: "joinedPublicRoomsLookUpTable.addParticipant".');
      return false;
  }
  this.get(roomName).participants.delete(nickname);
}

joinedPublicRoomsLookUpTable.changeNickname = function ({ oldNickname, newNickname }) {
  for (const [roomName, roomDetail] of [...this.entries()]) {
    const participants = this.get(roomName).participants;
    const participantDetail = participants.get(oldNickname);
    participants.delete(oldNickname);
    participants.set(newNickname, participantDetail);
  }
}

const publicRoomsLookUpTable = new Map();

publicRoomsLookUpTable.changeNickname = function ({ roomName, oldNickname, newNickname }) {
  const participants = this.get(roomName).participants;
  const participantDetail = participants.get(oldNickname);
  participants.delete(oldNickname);
  participants.set(newNickname, participantDetail);
}

//////////////////////////////////////////////////////

socket.on("default-nickname-set", ({ nickname }) => {
  console.log("default-nickname-set:", nickname);
  socket["nickname"] = nickname;
});

socket.on(
  "join-room",
  async ({ roomInfo }) => {
    const { roomName, roomType } = roomInfo;
    if (!roomTypes.includes(roomType)) {
      console.warn('Invalid room type at: "join-room"');
      return;
    }

    console.log("room:", roomInfo);
    joinedPublicRoomsLookUpTable.addRoom({ roomInfo });
    const participants = joinedPublicRoomsLookUpTable.get(roomName).participants;

    displayChatRoom({ roomName, roomType, participants });

    switch (roomType) {
      case "GROUP-CHAT":
        break;
      case "VIDEO-CHAT": {
        // Web RTC
        await initVideoChatMediaLocalSettings();
        initVideoChatConnectionLocalSettings({ roomName });

        socket.emit("rtc-signaling-check-initiation", { roomName }, (res) => {
          switch (res.status) {
            case "idle":
              console.log(`The room "${roomName}" is currently waiting for another participant to join.`);
              break;
            case "start":
              console.log(`The room "${roomName}" is currently initiating rtc signaling.`);
              break;
            case "abnormal-operation":
            case "too-many-participants":
              console.warn(`"rtc-signaling-check-initiation" failed: "${res.status}"`);
              break;
          }
        });
        break;
      }
      default:
        socket.emit("quit-room", { roomName });
        console.warn("Invalid room type.");
        return;
    }
  }
);

socket.on(
  "new-participant-join-notify",
  ({ roomName, participantInfo }) => {
    const roomType = joinedPublicRoomsLookUpTable.get(roomName).roomType;
    if (!roomTypes.includes(roomType)) {
      console.warn('Invalid room type at: "new-participant-join-notify"');
      return;
    }

    joinedPublicRoomsLookUpTable.addParticipant({ roomName, participantInfo });

    let nickname = participantInfo.nickname;
    const roomParticipantCount = joinedPublicRoomsLookUpTable.get(roomName).participants.size;
    const participantType = participantInfo.participantType;
    console.log(`${nickname} has joined the room.`);
    console.log(`Room "${roomName} (${roomParticipantCount} online)"`);

    if (nickname === socket["nickname"]) {
      // 자기 자신한테서 온 notification이면
      nickname = nickname + " (Me)";
    }

    switch (roomType) {
      case "GROUP-CHAT":
        addGroupChatRoomJoinMessage({ nickname });
        updateGroupChatRoomParticipantCount({ roomParticipantCount });
        addGroupChatRoomParticipant({ nickname, participantType });
        break;
      case "VIDEO-CHAT":
        addVideoChatRoomJoinMessage({ nickname });
        updateVideoChatRoomParticipantCount({ roomParticipantCount });
        addVideoChatRoomParticipant({ nickname, participantType });
        break;
      default:
        break;
    }
  }
);

socket.on(
  "some-participant-leave-notify",
  ({ roomName, nickname }) => {
    const roomType = joinedPublicRoomsLookUpTable.get(roomName).roomType;
    if (!roomTypes.includes(roomType)) {
      console.warn('Invalid room type at: "some-participant-leave-notify"');
      return;
    }

    joinedPublicRoomsLookUpTable.removeParticipant({ roomName, nickname });

    const roomParticipantCount = joinedPublicRoomsLookUpTable.get(roomName).participants.size;
    console.log(`${nickname} has left the room.`);
    console.log(`Room "${roomName} (${roomParticipantCount} online)"`);

    switch (roomType) {
      case "GROUP-CHAT":
        addGroupChatRoomLeaveMessage({ nickname });
        updateGroupChatRoomParticipantCount({ roomParticipantCount });
        removeGroupChatRoomParticipant({ nickname });
        break;
      case "VIDEO-CHAT":
        addVideoChatRoomLeaveMessage({ nickname });
        updateVideoChatRoomParticipantCount({ roomParticipantCount });
        removeVideoChatRoomParticipant({ nickname });
        break;
      default:
        break;
    }
  }
);

socket.on("update-public-room-list", ({ publicRooms }) => {
  chatRoomList.replaceChildren();
  publicRoomsLookUpTable.clear();
  publicRooms.forEach(([roomName, roomDetail]) => {
    publicRoomsLookUpTable.set(roomName, roomDetail);
  });

  [...publicRoomsLookUpTable.entries()].forEach(([roomName, roomDetail]) => {
    const span = document.createElement("span");
    span.textContent = roomName;
    span.classList.add("room-name");

    const li = document.createElement("li");
    li.appendChild(span);
    chatRoomList.appendChild(li);
  });
});

socket.on("change-nickname-notify", ({ roomName, oldNickname, newNickname }) => {
  if (newNickname === socket["nickname"]) {
    oldNickname = oldNickname + " (Me)";
    newNickname = newNickname + " (Me)";
  }

  const roomType = joinedPublicRoomsLookUpTable.get(roomName).roomType;
  switch (roomType) {
    case "GROUP-CHAT":
      addGroupChatRoomNicknameChangeNotifyMessage({ oldNickname, newNickname });
      changeGroupChatRoomParticipantNickname({ oldNickname, newNickname });
      break;
    case "VIDEO-CHAT":
      addVideoChatRoomNicknameChangeNotifyMessage({ oldNickname, newNickname });
      changeVideoChatRoomParticipantNickname({ oldNickname, newNickname });
      break;
    default:
      console.warn('Invalid room type at: "change-nickname-notify"');
      return;
  }

  joinedPublicRoomsLookUpTable.changeNickname({ oldNickname, newNickname });
});

socket.on("new-message-notify", ({ roomName, nickname, message }) => {
  const roomType = joinedPublicRoomsLookUpTable.get(roomName).roomType;
  switch (roomType) {
    case "GROUP-CHAT":
      addGroupChatRoomPublicMessage({ nickname, message });
      break;
    case "VIDEO-CHAT":
      addVideoChatRoomGeneralMessage({ nickname, message });
      break;
    default:
      console.warn('Invalid room type at: "new-message-notify"');
      break;
  }
});

let boundSendGroupChatRoomPublicMessageHandler = null;
let boundSendVideoChatRoomGeneralMessageHandler = null;
let boundQuitGroupChatRoomHandler = null;
let boundQuitVideoChatRoomHandler = null;

function displayChatRoom({ roomName, roomType, participants }) {
  const classNameHidden = "hidden";

  clearNicknameChangeFormInput();
  clearChatRoomCreateFormInput();
  clearChatRoomTypeSelect();
  clearChatRoomJoinFormInput();

  switch (roomType) {
    case "GROUP-CHAT": {
      chatRoomCreateContainer.classList.add(classNameHidden);
      chatRoomJoinContainer.classList.add(classNameHidden);

      groupChatRoomParticipantListContainer.classList.remove(classNameHidden);
      groupChatRoom.classList.remove(classNameHidden);

      const roomParticipantCount = participants.size;
      updateGroupChatRoomTitle({ roomName });
      updateGroupChatRoomParticipantCount({ roomParticipantCount });

      clearGroupChatRoomPublicMessageSendFormInput();
      setGroupChatRoomPublicMessageSendPlaceholder();
      showGroupChatRoomPublicMessageSendPlaceholder();

      addGroupChatRoomParticipants({ participants });

      boundSendGroupChatRoomPublicMessageHandler = (event) => {
        sendGroupChatRoomPublicMessageHandler(event, { roomName });
      };
      boundQuitGroupChatRoomHandler = (event) => {
        quitGroupChatRoomHandler(event, { roomName });
      };

      groupChatRoomPublicMessageSendForm.addEventListener("submit", boundSendGroupChatRoomPublicMessageHandler);
      groupChatRoomPublicMessageSendFormInput.addEventListener("focus", groupChatRoomPublicMessageSendFocusHandler);
      groupChatRoomPublicMessageSendFormInput.addEventListener("blur", groupChatRoomPublicMessageSendBlurHandler);
      groupChatRoomQuitButton.addEventListener("click", boundQuitGroupChatRoomHandler);
      break;
    }
    case "VIDEO-CHAT": {
      chatRoomCreateContainer.classList.add(classNameHidden);
      chatRoomJoinContainer.classList.add(classNameHidden);

      videoChatRoomParticipantListContainer.classList.remove(classNameHidden);
      videoChatRoom.classList.remove(classNameHidden);

      const roomParticipantCount = participants.size;
      updateVideoChatRoomTitle({ roomName });
      updateVideoChatRoomParticipantCount({ roomParticipantCount });

      clearVideoChatRoomGeneralMessageSendFormInput();
      setVideoChatRoomGeneralMessageSendPlaceholder();
      showVideoChatRoomGeneralMessageSendPlaceholder();

      addVideoChatRoomParticipants({ participants });

      boundSendVideoChatRoomGeneralMessageHandler = (event) => {
        sendVideoChatRoomGeneralMessageHandler(event, { roomName });
      };
      boundQuitVideoChatRoomHandler = (event) => {
        quitVideoChatRoomHandler(event, { roomName });
      };

      videoChatRoomGeneralMessageSendForm.addEventListener("submit", boundSendVideoChatRoomGeneralMessageHandler);
      videoChatRoomGeneralMessageSendFormInput.addEventListener("focus", videoChatRoomGeneralMessageSendFocusHandler);
      videoChatRoomGeneralMessageSendFormInput.addEventListener("blur", videoChatRoomGeneralMessageSendBlurHandler);
      videoChatRoomQuitButton.addEventListener("click", boundQuitVideoChatRoomHandler);
      break;
    }
    default:
      socket.emit("quit-room", { roomName });
      console.warn("Invalid room type.");
      return;
  }
}

function hideChatRoom({ roomType }) {
  const classNameHidden = "hidden";

  clearNicknameChangeFormInput();
  clearChatRoomCreateFormInput();
  clearChatRoomTypeSelect();
  clearChatRoomJoinFormInput();

  switch (roomType) {
    case "GROUP-CHAT":
      clearGroupChatRoomParticipantList();
      clearGroupChatRoomMessageBoard();

      chatRoomCreateContainer.classList.remove(classNameHidden);
      chatRoomJoinContainer.classList.remove(classNameHidden);
      groupChatRoomParticipantListContainer.classList.add(classNameHidden);
      groupChatRoom.classList.add(classNameHidden);

      groupChatRoomPublicMessageSendForm.removeEventListener("submit", boundSendGroupChatRoomPublicMessageHandler);
      groupChatRoomPublicMessageSendFormInput.removeEventListener("focus", groupChatRoomPublicMessageSendFocusHandler);
      groupChatRoomPublicMessageSendFormInput.removeEventListener("focus", groupChatRoomPublicMessageSendBlurHandler);
      groupChatRoomQuitButton.removeEventListener("click", boundQuitGroupChatRoomHandler);

      boundSendGroupChatRoomPublicMessageHandler = null;
      boundQuitGroupChatRoomHandler = null;

      break;
    case "VIDEO-CHAT":
      clearVideoChatRoomParticipantList();
      clearVideoChatRoomMessageBoard();

      chatRoomCreateContainer.classList.remove(classNameHidden);
      chatRoomJoinContainer.classList.remove(classNameHidden);
      videoChatRoomParticipantListContainer.classList.add(classNameHidden);
      videoChatRoom.classList.add(classNameHidden);

      videoChatRoomGeneralMessageSendForm.removeEventListener("submit", boundSendVideoChatRoomGeneralMessageHandler);
      videoChatRoomGeneralMessageSendFormInput.removeEventListener("focus", videoChatRoomGeneralMessageSendFocusHandler);
      videoChatRoomGeneralMessageSendFormInput.removeEventListener("focus", videoChatRoomGeneralMessageSendBlurHandler);
      videoChatRoomQuitButton.removeEventListener("click", boundQuitVideoChatRoomHandler);

      boundSendVideoChatRoomGeneralMessageHandler = null;
      boundQuitVideoChatRoomHandler = null;

      break;
    default:
      console.warn("Invalid room type.");
      return;
  }
}

function updateGroupChatRoomTitle({ roomName }) {
  groupChatRoomTitle.textContent = `<${roomName}>`;
}

function updateVideoChatRoomTitle({ roomName }) {
  videoChatRoomTitle.textContent = `<${roomName}>`;
}

function updateGroupChatRoomParticipantCount({ roomParticipantCount }) {
  groupChatRoomParticipantCount.textContent = `(${roomParticipantCount} online)`;
}

function updateVideoChatRoomParticipantCount({ roomParticipantCount }) {
  videoChatRoomParticipantCount.textContent = `(${roomParticipantCount} online)`;
}

function clearGroupChatRoomParticipantList() {
  groupChatRoomParticipantList.replaceChildren();
}

function clearVideoChatRoomParticipantList() {
  videoChatRoomParticipantList.replaceChildren();
}

function clearGroupChatRoomMessageBoard() {
  groupChatRoomMessageBoard.replaceChildren();
}

function clearVideoChatRoomMessageBoard() {
  videoChatRoomMessageBoard.replaceChildren();
}

function clearChatRoomCreateFormInput() {
  chatRoomCreateFormInput.value = "";
}

function clearChatRoomTypeSelect() {
  chatRoomTypeSelect.value = "";
}

function clearChatRoomJoinFormInput() {
  chatRoomJoinFormInput.value = "";
}

function clearNicknameChangeFormInput() {
  nicknameChangeFormInput.value = "";
}

function clearGroupChatRoomPublicMessageSendFormInput() {
  groupChatRoomPublicMessageSendFormInput.value = "";
}

function clearVideoChatRoomGeneralMessageSendFormInput() {
  videoChatRoomGeneralMessageSendFormInput.value = "";
}

function setGroupChatRoomPublicMessageSendPlaceholder() {
  groupChatRoomPublicMessageSendPlaceholder.replaceChildren();

  const p = document.createElement("p");
  const span = document.createElement("span");
  span.textContent = socket["nickname"];
  span.classList.add("nickname");

  p.appendChild(span);
  p.appendChild(document.createTextNode(": ..."));
  groupChatRoomPublicMessageSendPlaceholder.appendChild(p);
}

function showGroupChatRoomPublicMessageSendPlaceholder() {
  groupChatRoomPublicMessageSendPlaceholder.classList.remove("hidden");
}

function hideGroupChatRoomPublicMessageSendPlaceholder() {
  groupChatRoomPublicMessageSendPlaceholder.classList.add("hidden");
}

function setVideoChatRoomGeneralMessageSendPlaceholder() {
  videoChatRoomGeneralMessageSendPlaceholder.replaceChildren();

  const p = document.createElement("p");
  const span = document.createElement("span");
  span.textContent = socket["nickname"];
  span.classList.add("nickname");

  p.appendChild(span);
  p.appendChild(document.createTextNode(": ..."));
  videoChatRoomGeneralMessageSendPlaceholder.appendChild(p);
}

function showVideoChatRoomGeneralMessageSendPlaceholder() {
  videoChatRoomGeneralMessageSendPlaceholder.classList.remove("hidden");
}

function hideVideoChatRoomGeneralMessageSendPlaceholder() {
  videoChatRoomGeneralMessageSendPlaceholder.classList.add("hidden");
}

function addGroupChatRoomMessage({ li }) {
  let scrollIntoView = false;
  const bottom = groupChatRoomMessageBoard.scrollTop + groupChatRoomMessageBoard.clientHeight;
  if (groupChatRoomMessageBoard.scrollHeight - bottom < 20) {
    scrollIntoView = true;
  }

  groupChatRoomMessageBoard.appendChild(li);
  if (scrollIntoView) {
    li.scrollIntoView();
  }
}

function addVideoChatRoomMessage({ li }) {
  videoChatRoomMessageBoard.appendChild(li);
}

function addGroupChatRoomJoinMessage({ nickname }) {
  const span = document.createElement("span");
  span.textContent = `"${nickname}"`;
  span.classList.add("nickname");

  const li = document.createElement("li");
  li.appendChild(span);
  li.appendChild(document.createTextNode(" has joined the room."));

  addGroupChatRoomMessage({ li });
}

function addVideoChatRoomJoinMessage({ nickname }) {
  const span = document.createElement("span");
  span.textContent = `"${nickname}"`;
  span.classList.add("nickname");

  const li = document.createElement("li");
  li.appendChild(span);
  li.appendChild(document.createTextNode(" has joined the room."));

  addVideoChatRoomMessage({ li });
}

function addGroupChatRoomLeaveMessage({ nickname }) {
  const span = document.createElement("span");
  span.textContent = `"${nickname}"`;
  span.classList.add("nickname");

  const li = document.createElement("li");
  li.appendChild(span);
  li.appendChild(document.createTextNode(" has left the room."));

  addGroupChatRoomMessage({ li });
}

function addVideoChatRoomLeaveMessage({ nickname }) {
  const span = document.createElement("span");
  span.textContent = `"${nickname}"`;
  span.classList.add("nickname");

  const li = document.createElement("li");
  li.appendChild(span);
  li.appendChild(document.createTextNode(" has left the room."));

  addVideoChatRoomMessage({ li });
}

function addGroupChatRoomNicknameChangeNotifyMessage({ oldNickname, newNickname }) {
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

  addGroupChatRoomMessage({ li });
}

function addVideoChatRoomNicknameChangeNotifyMessage({ oldNickname, newNickname }) {
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

  addVideoChatRoomMessage({ li });
}

function addGroupChatRoomPublicMessage({ nickname, message }) {
  const span = document.createElement("span");
  span.textContent = `"${nickname}"`;
  span.classList.add("nickname");

  const li = document.createElement("li");
  li.appendChild(span);
  li.appendChild(document.createTextNode(`: ${message}`));

  addGroupChatRoomMessage({ li });
}

function addVideoChatRoomGeneralMessage({ nickname, message }) {
  const span = document.createElement("span");
  span.textContent = `"${nickname}"`;
  span.classList.add("nickname");

  const li = document.createElement("li");
  li.appendChild(span);
  li.appendChild(document.createTextNode(`: ${message}`));

  addVideoChatRoomMessage({ li });
}

function addGroupChatRoomParticipant({ nickname, participantType }) {
  const span = document.createElement("span");
  span.textContent = nickname;
  span.classList.add("nickname");

  const li = document.createElement("li");
  li.appendChild(span);
  groupChatRoomParticipantList.appendChild(li);
}

function addVideoChatRoomParticipant({ nickname, participantType }) {
  const span = document.createElement("span");
  span.textContent = nickname;
  span.classList.add("nickname");

  const li = document.createElement("li");
  li.appendChild(span);
  videoChatRoomParticipantList.appendChild(li);
}

function addGroupChatRoomParticipants({ participants }) {
  const lis = [...participants.entries()].map(([nickname, participantDetail]) => {
    const span = document.createElement("span");
    span.textContent = nickname;
    span.classList.add("nickname");

    const li = document.createElement("li");
    li.appendChild(span);
    return li;
  });

  groupChatRoomParticipantList.append(...lis);
}

function addVideoChatRoomParticipants({ participants }) {
  const lis = [...participants.entries()].map(([nickname, participantDetail]) => {
    const span = document.createElement("span");
    span.textContent = nickname;
    span.classList.add("nickname");

    const li = document.createElement("li");
    li.appendChild(span);
    return li;
  });

  videoChatRoomParticipantList.append(...lis);
}

function removeGroupChatRoomParticipant({ nickname }) {
  const spans = groupChatRoomParticipantList.querySelectorAll("span");
  for (const span of spans) {
    if (span.textContent === nickname) {
      span.parentElement.remove(); // li
    }
  }
}

function removeVideoChatRoomParticipant({ nickname }) {
  const spans = videoChatRoomParticipantList.querySelectorAll("span");
  for (const span of spans) {
    if (span.textContent === nickname) {
      span.parentElement.remove(); // li
    }
  }
}

function changeGroupChatRoomParticipantNickname({ oldNickname, newNickname }) {
  const spans = groupChatRoomParticipantList.querySelectorAll("span");
  for (const span of spans) {
    if (span.textContent === oldNickname) {
      span.textContent = newNickname;
    }
  }
}

function changeVideoChatRoomParticipantNickname({ oldNickname, newNickname }) {
  const spans = videoChatRoomParticipantList.querySelectorAll("span");
  for (const span of spans) {
    if (span.textContent === oldNickname) {
      span.textContent = newNickname;
    }
  }
}

function createChatRoomHandler(event) {
  event.preventDefault();
  const roomName = chatRoomCreateFormInput.value;
  const roomType = chatRoomTypeSelect.value;
  let hasRoomTypeError = false;
  switch (roomType) {
    case "GROUP-CHAT":
    case "VIDEO-CHAT":
      break;
    case "":
      hasRoomTypeError = true;
      alert("Please select the room type.");
      break;
    default:
      hasRoomTypeError = true;
      console.warn("Abnormal operation for the room type.");
      alert("Abnormal operation for the room type.");
      break;
  }

  clearNicknameChangeFormInput();
  clearChatRoomCreateFormInput();
  clearChatRoomTypeSelect();
  clearChatRoomJoinFormInput();

  if (roomName.trim() === "") {
    alert(
      "The room name cannot be an empty text nor only include whitespaces."
    );
    return;
  }
  if (hasRoomTypeError) {
    return;
  }

  socket.emit("create-room", { roomName, roomType }, (res) => {
    if (res.status === "ok") {
      console.log(
        `"${socket["nickname"]}" has created the room: "${roomName}"`
      );
    } else {
      // Error
      switch (res.status) {
        case "room-already-exist":
          alert(
            `The room "${roomName}" already exists. You can't create that room.`
          );
          break;
        default:
          alert(res.status);
          break;
      }
    }
  });
}

function joinChatRoomHandler(event) {
  event.preventDefault();
  const roomName = chatRoomJoinFormInput.value;

  clearNicknameChangeFormInput();
  clearChatRoomCreateFormInput();
  clearChatRoomTypeSelect();
  clearChatRoomJoinFormInput();

  if (roomName.trim() === "") {
    alert(
      "The room name cannot be an empty text nor only include whitespaces."
    );
    return;
  }

  socket.emit("join-room", { roomName }, (res) => {
    if (res.status === "ok") {
      console.log(`"${socket["nickname"]}" has joined the room: "${roomName}"`);
    } else {
      // Error
      switch (res.status) {
        case "room-not-exist":
          alert(`The room "${roomName}" does not exist. You can't join that room.`);
          break;
        case "video-chat-full":
          alert(`The video chat room "${roomName}" is already full. You can't join that room.`);
          break;
        case "invalid-video-chat-participant-count":
          alert(`The video chat room "${roomName}" has invalid participant count. You can't join that room.`);
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
  clearChatRoomCreateFormInput();
  clearChatRoomTypeSelect();
  clearChatRoomJoinFormInput();

  if (newNickname.trim() === "" || /[\s]/.test(newNickname)) {
    alert("Nickname cannot be an empty text or include whitespaces.");
    return;
  }

  const oldNickname = socket["nickname"];
  if (newNickname.trim() === oldNickname) {
    alert(
      `The new nickname is the same as the old nickname. Your nickname "${oldNickname}" will remain the same.`
    );
  }

  socket.emit("change-nickname", { newNickname }, (res) => {
    if (res.status === "ok") {
      socket["nickname"] = newNickname;

      setGroupChatRoomPublicMessageSendPlaceholder();
      setVideoChatRoomGeneralMessageSendPlaceholder();

      if (document.activeElement === groupChatRoomPublicMessageSendFormInput ||
        groupChatRoomPublicMessageSendFormInput.value !== "") {
        hideGroupChatRoomPublicMessageSendPlaceholder();
      } else {
        showGroupChatRoomPublicMessageSendPlaceholder();
      }
      if (document.activeElement === videoChatRoomGeneralMessageSendFormInput ||
        videoChatRoomGeneralMessageSendFormInput.value !== "") {
        hideVideoChatRoomGeneralMessageSendPlaceholder();
      } else {
        showVideoChatRoomGeneralMessageSendPlaceholder();
      }

      socket.emit("change-nickname-notify", { oldNickname, newNickname });

      alert(`Your nickname has been changed to "${newNickname}".`);
    } else {
      // Error
      switch (res.status) {
        case "nickname-already-exist":
          alert(
            `The nickname "${newNickname}" already exists. You can't change to that nickname.`
          );
          break;
        default:
          alert(res.status);
          break;
      }
    }
  });
}

function sendGroupChatRoomPublicMessageHandler(event, { roomName }) {
  event.preventDefault();
  const message = groupChatRoomPublicMessageSendFormInput.value;

  clearGroupChatRoomPublicMessageSendFormInput();
  showGroupChatRoomPublicMessageSendPlaceholder();

  const nickname = socket["nickname"];
  socket.emit("new-message-notify", { roomName, message }, (res) => {
    if (res.status === "ok") {
      addGroupChatRoomPublicMessage({ nickname: nickname + " (Me)", message });
    } else {
      console.warn("Abnormal operation detected when sending a message.");
    }
  });
}

function sendVideoChatRoomGeneralMessageHandler(event, { roomName }) {
  event.preventDefault();
  const message = videoChatRoomGeneralMessageSendFormInput.value;

  clearVideoChatRoomGeneralMessageSendFormInput();
  showVideoChatRoomGeneralMessageSendPlaceholder();

  const nickname = socket["nickname"];
  socket.emit("new-message-notify", { message, roomName }, (res) => {
    if (res.status === "ok") {
      addVideoChatRoomGeneralMessage({ nickname: nickname + " (Me)", message });
    } else {
      console.warn("Abnormal operation detected when sending a message.");
    }
  });
}

function quitGroupChatRoomHandler(event, { roomName }) {
  const roomType = "GROUP-CHAT";
  hideChatRoom({ roomType });
  socket.emit("quit-room", { roomName });
}

function quitVideoChatRoomHandler(event, { roomName }) {
  const roomType = "VIDEO-CHAT";
  cleanUpVideoChatSettings({ roomName });
  hideChatRoom({ roomType });
  socket.emit("quit-room", { roomName });
}

function groupChatRoomPublicMessageSendFocusHandler() {
  hideGroupChatRoomPublicMessageSendPlaceholder();
}

function videoChatRoomGeneralMessageSendFocusHandler() {
  hideVideoChatRoomGeneralMessageSendPlaceholder();
}

function groupChatRoomPublicMessageSendBlurHandler() {
  if (groupChatRoomPublicMessageSendFormInput.value === "") {
    showGroupChatRoomPublicMessageSendPlaceholder();
  }
}

function videoChatRoomGeneralMessageSendBlurHandler() {
  if (videoChatRoomGeneralMessageSendFormInput.value === "") {
    showVideoChatRoomGeneralMessageSendPlaceholder();
  }
}

//////////////////////////////////////////////////////
// WebRTC
// Video Chat
const videoChatRoom = document.querySelector(".video-chat-room");
const videoChatRoomBoardContainer = videoChatRoom.querySelector(
  ".video-chat-room__board-container"
);
const videoChatRoomTitle = videoChatRoomBoardContainer.querySelector(".video-chat-room__title");
const videoChatRoomParticipantCount = videoChatRoomBoardContainer.querySelector(
  ".video-chat-room__participant-count"
);
const videoChatRoomCamBoard = videoChatRoomBoardContainer.querySelector(".video-chat-room__cam-board");
const videoChatRoomMessageBoard = videoChatRoomBoardContainer.querySelector(".video-chat-room__message-board");

const videoChatRoomMyCam = videoChatRoomCamBoard.querySelector(".video-chat-room__my-cam");
const videoChatRoomPeerCam = videoChatRoomCamBoard.querySelector(".video-chat-room__peer-cam");
const videoChatRoomMyCameraChangeSelect = videoChatRoomCamBoard.querySelector(".video-chat-room__my-camera-change-select");
const videoChatRoomMyCameraMuteToggleButton = videoChatRoomCamBoard.querySelector(".video-chat-room__my-camera-mute-toggle-button");
const videoChatRoomMyCameraToggleButton = videoChatRoomCamBoard.querySelector(".video-chat-room__my-camera-toggle-button");

const videoChatRoomGeneralMessageSendContainer = videoChatRoom.querySelector(".video-chat-room__general-message-send-container");
const videoChatRoomGeneralMessageSendForm = videoChatRoomGeneralMessageSendContainer.querySelector("form");
const videoChatRoomGeneralMessageSendFormInput = videoChatRoomGeneralMessageSendForm.querySelector("input");
const videoChatRoomGeneralMessageSendPlaceholder = videoChatRoomGeneralMessageSendForm.querySelector(
  ".video-chat-room__general-message-send-placeholder"
);

const videoChatRoomQuitButton = videoChatRoom.querySelector(
  ".video-chat-room__quit-container button"
);

//////////////////////////////////////////////////////
videoChatRoomMyCameraMuteToggleButton.addEventListener("click", videoChatMuteToggleHandler);
videoChatRoomMyCameraToggleButton.addEventListener("click", videoChatCameraToggleHandler);
videoChatRoomMyCameraChangeSelect.addEventListener("input", videoChatCameraChangeHandler);

let localStream = null;
let peerConnection = null;
let dataChannel = null;
const peerConnectionConfig = {
  iceServers: [
    {
      urls: "stun:relay.metered.ca:80"
    },
    {
      urls: "turn:relay.metered.ca:80",
      username: "036c67a78e9280aa8f7800b0",
      credential: "xdVM0LCt3DcsvnyK",
    },
  ],
};
let cameraMuted = false;
let cameraOff = false;
// Configuration for the `RTCPeerConnection`
// Includes the configuration for the ice servers (STUN or/and TURN servers)

function cleanUpVideoChatSettings({ roomName }) {
  navigator.mediaDevices.removeEventListener("devicechange", availableVideoDevicesUpdateHandler);
  peerConnection.removeEventListener("icecandidate", boundRtcTransmitIceCandidatesHandler);
  peerConnection.removeEventListener("track", rtcAddRemoteStreamTrackHandler);

  const nickname = socket["nickname"];
  const participantType = joinedPublicRoomsLookUpTable.get(roomName).participants.get(nickname).participantType;
  switch (participantType) {
    case "HOST":
      dataChannel.removeEventListener("message", videoChatMessageHandler);
      break;
    case "MANAGER":
    case "GUEST":
      peerConnection.removeEventListener("datachannel", videoChatReceiveDataChannelHandler);
      dataChannel.removeEventListener("message", videoChatMessageHandler);
      break;
    default:
      console.warn(`Invalid participant type at "cleanUpVideoChatSettings" for the participant "${nickname}" at the room ${roomName}`);
      return;
  }
  localStream = null;
  peerConnection = null;
  dataChannel = null;
  cameraMuted = false;
  cameraOff = false;
}

async function initVideoChatMediaLocalSettings() {
  console.log("[initVideoChatMediaLocalSettings]");
  // * Listen for changes to media devices and update the list accordingly.
  // (Ex. plugged in a USB webcam during runtime
  // or certain media device is disconnected during runtime.)

  navigator.mediaDevices.addEventListener("devicechange", availableVideoDevicesUpdateHandler);

  await updateLocalStream({});
  await updateAvailableVideoDevicesList();

  // stream을 해당 video DOM element에 srcObject로서 attach 시켜준다.
  videoChatRoomMyCam.srcObject = localStream;
}

async function availableVideoDevicesUpdateHandler() {
  await updateAvailableVideoDevicesList();
}

// * Trigger a permissions request for the media devices.
// If accepted, the promise is resolved with a `MediaStream`.
// If denied, a PermissionDeniedError is thrown. 
// In case there are no matching media devices connected, a `NotFoundError` will be thrown.
//
// * Streams and tracks
// stream은 비디오와 오디오가 결합된거다.
// A `MediaStream` represents a stream of media content,
// which consists of tracks (`MediaStreamTrack`) of audio and video.
// You can retrieve all the tracks from `MediaStream` by calling `MediaStream.getTracks()`,
// which returns an array of `MediaStreamTrack` objects.
//
// MediaStreamTrack
// A `MediaStreamTrack` has a `kind` property that is either `audio` or `video`,
// indicating the kind of media it represents.
// Each track can be muted by toggling its `enabled` property.
// A track has a Boolean property `remote` that indicates if it is sourced
// by a `RTCPeerConnection` and coming from a remote peer.
//
// stream의 멋진 점은 우리에게 `track`이라는 것을 제공해주는거다.
// 그리고 우리는 여러 다른 track들을 가질 수 있다.
// 비디오가 하나의 track이 될 수 있고,
// 오디오도 하나의 track이 될 수 있고,
// 자막도 하나의 track이 될 수 있다.

// return value: returns a new stream that was requested under the specific constraints.
async function openMediaDevice({ constraints }) {
  // The constraints object, which must implement the `MediaStreamConstraints` interface,
  // that we pass as a parameter to `getUserMedia()`
  // allows us to open a media device that matches a certain requirement.
  return await navigator.mediaDevices.getUserMedia(constraints);
}
// cf> MediaStream
// {
//   active: true
//   id: "30fc5844-c231-45fe-a77b-779d102725e9"
//   onactive: null
//   onaddtrack: null
//   oninactive: null
//   onremovetrack: null
// }


// * `navigator.mediaDevices.enumerateDevices()` return value:
// Resolves to an array of `MediaDevicesInfo` that describes
// each known media device (allowed media input sources)
//
// 컴퓨터나 모바일이 가지고 있는 모든 미디어 장치를 우리에게 알려준다.
// 즉, `enumerateDevices`를 쓰면 모든 미디어 장치 정보를 알 수 있다.
async function getConnectedMediaDevices({ type }) {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === type);
}

// * Listen for changes to media devices and update the list accordingly.
// (Ex. plugged in a USB webcam during runtime
// or certain media device is disconnected during runtime.)
//
// navigator.mediaDevices.addEventListener("devicechange", event => {
//   const newCameraList = getConnectedMediaDevices("videoinput");
//   updateCameraList(newCameraList);
// });

// // * Open camera with at least `minWidth` and `minHeight` capabilities
// async function openCamera(cameraId, minWidth, minHeight) {
//   const constraints = {
//     'audio': { 'echoCancellation': true },
//     'video': {
//       'deviceId': cameraId,
//       'width': { 'min': minWidth },
//       'height': { 'min': minHeight }
//     }
//   }
//   return await navigator.mediaDevices.getUserMedia(constraints);
// }
//
// const cameras = getConnectedDevices("videoinput");
// if (cameras && cameras.length > 0) {
//   // Open first available video camera with a resolution of 1280x720 pixels
//   const stream = openCamera(cameras[0].deviceId, 1280, 720);
// }

// * Local playback
// Once a media device has been opened and we have a `MediaStream` available,
// we can assign it to a `video` or `audio` element to play the stream locally.
// async function playVideoFromCamera() {
//   try {
//     const constraints = { "video": true, "audio": true };
//     const stream = await navigator.mediaDevices.getUserMedia(constraints);
//     const videoElement = document.querySelector("video#localVideo");
//     videoElement.srcObject = stream;
//   } catch (error) {
//     console.error("Error opening video camera.", error);
//   }
// }
// The HTML needed for a typical video element used with `getUserMedia()`
// will usually have the attributes `autoplay` and `playsinline`.
// The `autoplay` attribute will cause new streams assigned to the element
// to play automatically.
// The `playsinline` attribute allows video to play inline,
// instead of only in full screen, on certain mobile browsers.
// It is also recommended to use `controls="false"` for live streams,
// unless the user should be able to pause them.
// <video id="localVideo" autoplay playsinline controls="false"/>

// stream을 set or update함으로써 (새로운 stream 값으로 할당함으로써)
// 유저의 카메라와 오디오를 가져온다.
//
// deviceId: optional param
async function updateLocalStream({ deviceId }) {
  try {
    // `MediaStreamConstraints`
    const initialConstraints = {
      audio: true,
      video: { facingMode: "user" }, // The video source is facing toward the user
    };
    const cameraConstraints = {
      audio: true,
      video: {
        deviceId: {
          exact: deviceId,
        },
      },
    };
    const constraints = deviceId ? cameraConstraints : initialConstraints;

    // On some devices, it is necessary to stop the previous track before changing the media device
    // (in this case, camera).
    // Stop the active tracks if the stream is already preexisting and active.
    // 이 코드가 없으면 카메라 select를 바꾸는 과정에서 에러가 생긴다.
    if (localStream) {
      const tracks = localStream.getTracks();
      tracks.forEach((track) => {
        track.stop();
      });
    }

    // sets new stream under specific stream constraints
    // that include specific device requirements.
    // `getUserMedia()`
    localStream = await openMediaDevice({ constraints });
    // console.log("localStream:", localStream);

    // If the setting is "muted", mute all the audio tracks on the stream.
    // (keep the `mute` value setting)
    // If the setting is "cameraOff", turn off all the video tracks on the stream.
    // (keep the `cameraOff` value setting)
    // 이 코드가 없으면 음소거 되어있는 상태에서 카메라를 변경할 시
    // 음소거가 풀려서 다시 소리가 들린다.
    localStream
      .getAudioTracks()
      .forEach((track) => (track.enabled = cameraMuted ? false : true));
    localStream
      .getVideoTracks()
      .forEach((track) => (track.enabled = cameraOff ? false : true));
    // console.log("localStream:", localStream);
  } catch (e) {
    console.log(e);
  }
}

// 카메라를 선택할 수 있게 `select`에 카메라들을 추가한다.
// 해당 추가하는 작업은 `select` 태그 안에
// device label(device.label)과 device id(device.deviceId)를 가져오는 것이다.
// 그리고 카메라를 바꾸기 위해선 device id가 필요하다.
// getVideoDevices
// (1) get all the available video devices
// (2) get the video device (video track) connected to the stream (current camera)
async function updateAvailableVideoDevicesList() {
  try {
    // `enumerateDevices()`
    // `enumerateDevices()`를 통해 얻은 device array 중에서
    // device.kind가 `"videoinput"`으로 된 것들만 선택해온다.
    // 그것들이 바로 카메라들(video devices)이다.
    // availableVideoDevices: MediaDeviceInfo[]에서 kind가 videoinput인 장치들
    const availableVideoDevices = await getConnectedMediaDevices({ type: "videoinput" });
    console.log("availableVideoDevices:", availableVideoDevices);
    // TODO: length === 0


    // videoTrack
    const videoTracksAttachedToCurrentStream = localStream.getVideoTracks();
    // TODO: length === 0
    const videoTrackAttachedToCurrentStream = videoTracksAttachedToCurrentStream[0];

    // videoDevice
    availableVideoDevices.forEach((videoDevice) => {
      const option = document.createElement("option");
      option.value = videoDevice.deviceId;
      option.innerText = videoDevice.label;

      // check the device name (label)
      // TODO: check if it's better to check with device id or label.
      if (videoTrackAttachedToCurrentStream.label === videoDevice.label) {
        option.selected = true;
      }
      videoChatRoomMyCameraChangeSelect.appendChild(option);
    });
  } catch (e) {
    console.log(e);
  }
}

// TODO: organize the code
function videoChatMuteToggleHandler() {
  console.log("audio tracks:", localStream.getAudioTracks());

  if (cameraMuted) {
    localStream.getAudioTracks().forEach((track) => (track.enabled = true));
    cameraMuted = false;
    videoChatRoomMyCameraMuteToggleButton.innerText = "Mute";
  } else {
    localStream.getAudioTracks().forEach((track) => (track.enabled = false));
    cameraMuted = true;
    videoChatRoomMyCameraMuteToggleButton.innerText = "Unmute";
  }
}

// TODO: organize the code
function videoChatCameraToggleHandler() {
  console.log("video tracks:", localStream.getVideoTracks());

  if (cameraOff) {
    localStream.getVideoTracks().forEach((track) => (track.enabled = true));
    cameraOff = false;
    videoChatRoomMyCameraToggleButton.innerText = "Turn Camera Off";
  } else {
    localStream.getVideoTracks().forEach((track) => (track.enabled = false));
    cameraOff = true;
    videoChatRoomMyCameraToggleButton.innerText = "Turn Camera On";
  }
}

async function videoChatCameraChangeHandler() {
  // 유저가 select 태그를 통해 video device를 변경하면
  // stream을 새롭게 변경된 video device를 가진 장치 stream으로 다시 대입해줄거다.
  // 해당 video device id를 이용해 새로운 stream을 받아서 사용한다.
  await updateLocalStream({ deviceId: videoChatRoomMyCameraChangeSelect.value });

  if (peerConnection) {
    // 새로 업데이트된 media device stream을 통해 video track을 가져온다.
    // TODO: length === 0
    const videoTrack = localStream.getVideoTracks()[0];
    const videoSender = peerConnection
      .getSenders()
      .find((sender) => sender.track.kind === "video");

    console.log("videoTrack:", videoTrack);
    // console.log("myPeerConnection.getSenders():", myPeerConnection.getSenders());
    // (2) [RTCRtpSender, RTCRtpSender]
    console.log("videoSender:", videoSender);

    // peerConnection에 대한 sender의 video track을 교체함
    videoSender.replaceTrack(videoTrack);
  }
}

// Peer connections is the part of the WebRTC specifications
// that deals with connecting two applications on different computers
// to communicate using a peer-to-peer protocol.
// The communication between peers can be video, audio
// or arbitrary binary data (for clients supporting the `RTCDataChannel` API). 
//
// In order to discover how two peers can connect,
// both clients need to provide an ICE Server configuration.
// This is either a STUN or a TURN-server, and their role is
// to provide ICE candidates to each client which is then transferred to the remote peer.
// This transferring of ICE candidates is commonly called signaling.

// * Signaling
// The WebRTC specification includes APIs for communicating with an ICE
// (Internet Connectivity Establishment) Server,
// but the signaling component is not part of it.
// Signaling is needed in order for two peers to share how they should connect.
// Usually this is solved through a regular HTTP-based Web API
// (i.e., a REST service or other RPC mechanism)
// where web applications can relay the necessary information
// before the peer connection is initiated.
//
// The following code snippet shows how this fictious signaling service can be used
// to send and receive messages asynchronously.
// This will be used in the remaining examples in this guide where necessary.
//
// Set up an asynchronous communication channel that will be
// used during the peer connection setup
// const signalingChannel = new SignalingChannel(remoteClientId);
// signalingChannel.addEventListener('message', message => {
//    // New message from remote client received
// });
//
// Send an asynchronous message to the remote client
// signalingChannel.send('Hello!');
// Signaling can be implemented in many different ways,
// and the WebRTC specification doesn't prefer any specific solution.

// * Initiating peer connections
// Each peer connection is handled by a `RTCPeerConnection` object.
// The constructor for this class takes a single `RTCConfiguration` object as its parameter.
// This object defines how the peer connection is set up
// and should contain information about the ICE servers to use.
//
// Once the `RTCPeerConnection` is created we need to create an SDP offer or answer,
// depending on if we are the calling peer or receiving peer.
// Once the SDP offer or answer is created,
// it must be sent to the remote peer through a different channel.
// Passing SDP objects to remote peers is called signaling
// and is not covered by the WebRTC specification.
//
// To initiate the peer connection setup from the calling side,
// we create a `RTCPeerConnection` object and then call `createOffer()`
// to create a `RTCSessionDescription` object.
// This session description is set as the local description using `setLocalDescription()`
// and is then sent over our signaling channel to the receiving side.
// We also set up a listener to our signaling channel
// for when an answer to our offered session description is received from the receiving side.
//
// async function makeCall() {
//   const configuration = {'iceServers': [{'urls': 'stun:stun.l.google.com:19302'}]}
//   const peerConnection = new RTCPeerConnection(configuration);
//   signalingChannel.addEventListener('message', async message => {
//       if (message.answer) {
//           const remoteDesc = new RTCSessionDescription(message.answer);
//           await peerConnection.setRemoteDescription(remoteDesc);
//       }
//   });
//   const offer = await peerConnection.createOffer();
//   await peerConnection.setLocalDescription(offer);
//   signalingChannel.send({'offer': offer});
// }
//
// On the receiving side, we wait for an incoming offer before
// we create our RTCPeerConnection instance.
// Once that is done we set the received offer using `setRemoteDescription()`.
// Next, we call `createAnswer()` to create an answer to the received offer.
// This answer is set as the local description using `setLocalDescription()`
// and then sent to the calling side over our signaling server.
//
// const peerConnection = new RTCPeerConnection(configuration);
// signalingChannel.addEventListener('message', async message => {
//   if (message.offer) {
//     peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
//     const answer = await peerConnection.createAnswer();
//     await peerConnection.setLocalDescription(answer);
//     signalingChannel.send({'answer': answer});
//   }
// });
//
// Once the two peers have set both the local and remote session descriptions
// they know the capabilities of the remote peer.
// This doesn't mean that the connection between the peers is ready.
// For this to work we need to collect the ICE candidates at each peer
// and transfer (over the signaling channel) to the other peer.

// * ICE candidates
// Before two peers can communicate using WebRTC,
// they need to exchange connectivity information.
// Since the network conditions can vary depending on a number of factors,
// an external service is usually used for discovering the possible candidates
// for connecting to a peer.
// This service is called ICE and is using either a STUN or a TURN server.
// STUN stands for Session Traversal Utilities for NAT,
// and is usually used indirectly in most WebRTC applications.
//
// TURN (Traversal Using Relay NAT) is the more advanced solution
// that incorporates the STUN protocols
// and most commercial WebRTC based services use a TURN server
// for establishing connections between peers.
// The WebRTC API supports both STUN and TURN directly,
// and it is gathered under the more complete term Internet Connectivity Establishment.
// When creating a WebRTC connection,
// we usually provide one or several ICE servers in the configuration
// for the `RTCPeerConnection` object.
//
// * Trickle ICE
// Once a `RTCPeerConnection` object is created,
// the underlying framework uses the provided ICE servers to gather candidates
// for connectivity establishment (ICE candidates).
// The event `icegatheringstatechange` on `RTCPeerConnection` signals in
// what state the ICE gathering is (`new`, `gathering` or `complete`).
//
// While it is possible for a peer to wait until the ICE gathering is complete,
// it is usually much more efficient to use a "trickle ice" technique
// and transmit each ICE candidate to the remote peer as it gets discovered.
// This will significantly reduce the setup time for the peer connectivity
// and allow a video call to get started with less delays.
//
// To gather ICE candidates, simply add a listener for the `icecandidate` event.
// The `RTCPeerConnectionIceEvent` emitted on that listener
// will contain candidate property that represents a new candidate
// that should be sent to the remote peer (See Signaling).
//
// // Listen for local ICE candidates on the local RTCPeerConnection
// peerConnection.addEventListener('icecandidate', event => {
//   if (event.candidate) {
//       signalingChannel.send({'new-ice-candidate': event.candidate});
//   }
// });
//
// // Listen for remote ICE candidates and add them to the local RTCPeerConnection
// signalingChannel.addEventListener('message', async message => {
//   if (message.iceCandidate) {
//       try {
//           await peerConnection.addIceCandidate(message.iceCandidate);
//       } catch (e) {
//           console.error('Error adding received ice candidate', e);
//       }
//   }
// });

// * Connection established
// Once ICE candidates are being received,
// we should expect the state for our peer connection will eventually change
// to a connected state. To detect this, we add a listener to our `RTCPeerConnection`
// where we listen for `connectionstatechange` events.
//
// // Listen for `connectionstatechange` on the local `RTCPeerConnection`
// peerConnection.addEventListener('connectionstatechange', event => {
//   if (peerConnection.connectionState === 'connected') {
//     // Peers connected!
//   }
// });

// Once a RTCPeerConnection is connected to a remote peer,
// it is possible to stream audio and video between them.
// This is the point where we connect the stream we receive from `getUserMedia()`
// to the `RTCPeerConnection`.
// A media stream consists of at least one media track,
// and these are individually added to the `RTCPeerConnection`
// when we want to transmit the media to the remote peer.
//
// const localStream = await getUserMedia({video: true, audio: true});
// const peerConnection = new RTCPeerConnection(iceConfig);
// localStream.getTracks().forEach(track => {
//   peerConnection.addTrack(track, localStream);
// });
//
// Tracks can be added to a `RTCPeerConnection` before it has connected to a remote peer,
// so it makes sense to perform this setup as early as possible
// instead of waiting for the connection to be completed.
//
// * Adding remote tracks
// To receive the remote tracks that were added by the other peer,
// we register a listener on the local `RTCPeerConnection` listening for the `track` event.
// The `RTCTrackEvent` contains an array of `MediaStream` objects 
// that have the same `MediaStream.id` values as the peer's corresponding local streams.
// In our example, each track is only associated with a single stream.
//
// Note that while `MediaStream` IDs match on both sides of the peer connection,
// the same is generally not true for `MediaStreamTrack` IDs.
//
// const remoteVideo = document.querySelector('#remoteVideo');
// peerConnection.addEventListener('track', async (event) => {
//   const [remoteStream] = event.streams;
//   remoteVideo.srcObject = remoteStream;
// });

// * Data channels
// The WebRTC standard also covers an API for sending arbitrary data
// over a `RTCPeerConnection`.
// This is done by calling `createDataChannel()` on a `RTCPeerConnection` object,
// which returns a `RTCDataChannel` object.
//
// const peerConnection = new RTCPeerConnection(configuration);
// const dataChannel = peerConnection.createDataChannel();
//
// The remote peer can receive data channels by listening for the `datachannel` event
// on the `RTCPeerConnection` object.
// The received event is of the type `RTCDataChannelEvent`
// and contains a channel property that represents the `RTCDataChannel`
// connected between the peers.
//
// const peerConnection = new RTCPeerConnection(configuration);
// peerConnection.addEventListener('datachannel', event => {
//   const dataChannel = event.channel;
// });
//
// * Open and close events
// Before a data channel can be used for sending data,
// the client needs to wait until it has been opened.
// This is done by listening to the `open` event.
// Likewise, there is a `close` event for when either side closes the channel.
//
// const messageBox = document.querySelector('#messageBox');
// const sendButton = document.querySelector('#sendButton');
// const peerConnection = new RTCPeerConnection(configuration);
// const dataChannel = peerConnection.createDataChannel();
//
// Enable textarea and button when opened
// dataChannel.addEventListener('open', event => {
//   messageBox.disabled = false;
//   messageBox.focus();
//   sendButton.disabled = false;
// });
//
// Disable input when closed
// dataChannel.addEventListener('close', event => {
//   messageBox.disabled = false;
//   sendButton.disabled = false;
// });
//
// * Messages
// Sending a message on a `RTCDataChannel` is done by calling the `send()` function
// with the data we want to send.
// The `data` parameter for this function can be either
// a string, a Blob, an ArrayBuffer or and ArrayBufferView.
//
// const messageBox = document.querySelector('#messageBox');
// const sendButton = document.querySelector('#sendButton');
// // Send a simple text message when we click the button
// sendButton.addEventListener('click', event => {
//   const message = messageBox.textContent;
//   dataChannel.send(message);
// })
//
// The remote peer will receive messages sent on a `RTCDataChannel`
// by listening on the `message` event.
//
// const incomingMessages = document.querySelector('#incomingMessages');
// const peerConnection = new RTCPeerConnection(configuration);
// const dataChannel = peerConnection.createDataChannel();
//
// // Append new messages to the box of incoming messages
// dataChannel.addEventListener('message', event => {
//   const message = event.data;
//   incomingMessages.textContent += message + '\n';
// });

let boundRtcTransmitIceCandidatesHandler = null;

// 아래 이 함수는 모든 클라이언트들에서 실행될 함수이다.
// (peer-to-peer connection을 만들고
// 각 클라이언트들의 브라우저에서 카메라와 마이크 데이터 stream을 받아서
// 연결 안에 집어 넣은 것이다)
// 이 함수의 실행이 끝나도 아직 브라우저들을 연결한건 아니다.
// 각 브라우저들이 필요한 구성을 해줬을 뿐이다.
function initVideoChatConnectionLocalSettings({ roomName }) {
  console.log("[initVideoChatConnectionLocalSettings]");

  peerConnection = new RTCPeerConnection(peerConnectionConfig);
  // 이 연결을 peer와 (상대방과) 공유하고 싶다.

  console.log("localStream.getTracks():", localStream.getTracks());
  // (2) [MediaStreamTrack, MediaStreamTrack]
  // MediaStreamTrack {kind: 'audio', id: 'ea732b74-b27e-4fd8-a6ae-930a6998646b', label: '기본값 - 마이크 배열(Realtek High Definition Audio)', enabled: true, muted: false, …}
  // MediaStreamTrack {kind: 'video', id: '4ea9fd79-911f-4555-97f4-5a526b66fef4', label: 'HP Wide Vision HD Camera (04f2:b5d6)', enabled: true, muted: false, …}
  // 우리 로컬 stream 에는 보다시피 두 개의 트랙이 있다. 오디오 트랙과 영상 트랙.
  // 이 두 트랙을 연결에 공유할거다.
  // (영상과 오디오 데이터를 주고 받을 때 사용되는 stream의 track들을
  // peer connection에 넣어준다(addTrack))

  // `icecandidate` event:
  // An icecandidate event is sent to an `RTCPeerConnection`
  // when an `RTCIceCandidate` has been identified
  // and added to the local peer
  // by a call to `RTCPeerConnection.setLocalDescription()`.
  // The event handler should transmit the candidate
  // to the remote peer over the signaling channel
  // so the remote peer can add it to its set of remote candidates.
  boundRtcTransmitIceCandidatesHandler = (event) => {
    rtcTransmitIceCandidatesHandler(event, { roomName });
  };
  peerConnection.addEventListener("icecandidate", boundRtcTransmitIceCandidatesHandler);
  // `track` event:
  // indicates received the remote tracks that were added by the other peer.
  peerConnection.addEventListener("track", rtcAddRemoteStreamTrackHandler);

  // Add tracks (`MediaStreamTrack`s) to the connection.
  // modern version of `addStream` (obsolete) code.
  localStream
    .getTracks()
    .forEach((track) => peerConnection.addTrack(track, localStream));
}

// Gets executed when we have added the ice candidates to the local
// and need to transmit the ice candidates to the remote peer.
function rtcTransmitIceCandidatesHandler(event, { roomName }) {
  // Transmits the ICE candidates to the remote peer.
  // console.log("event.candidate:", event.candidate);
  socket.emit("rtc-signaling-transmit-ice", { iceCandidate: event.candidate, roomName });

  // console.log("Sent ICECandidate:", event.candidate);
  // console.log("Sent ICECandidate.");
}

// Gets executed when we sensor the remote tracks have been added
// to the peer connection.
function rtcAddRemoteStreamTrackHandler(data) {
  console.log("Got an event from my peer:", data);
  console.log("Peer's stream:", data.streams[0]);
  console.log("My stream:", localStream);

  videoChatRoomPeerCam.srcObject = data.streams[0];
}

// Both
// This code gets executed at both sides.
socket.on("rtc-signaling-transmit-ice", ({ iceCandidate }) => {
  // console.log("received ICECandidate:", iceCandidate);
  console.log("received ICECandidate.");
  peerConnection.addIceCandidate(iceCandidate);
});

socket.on("rtc-caller-connection-start", ({ roomName }) => {
  console.log("[rtc-caller-connection-start]");
  initCallerConnection({ roomName });
});

socket.on("rtc-receiver-connection-start", () => {
  console.log("[rtc-receiver-connection-start]");
  initReceiverConnection();
});

async function initCallerConnection({ roomName }) {
  initCallerDataChannel();
  await sendRtcSignalingOffer({ roomName });
}

function initReceiverConnection() {
  initReceiverDataChannel();
}

// 이제 `createOffer()`를 peer A(Caller)가 호출해서 offer를 생성하고
// peer B(Receiver)는 `createAnswer()`를 만든다.
// 그럼 누가 peer A가 되어야하고, 누가 peer B가 되야할까?
// Peer A는 일반적으로 방에 제일 최초로 들어간 사람이다.
// 그 이유는 다른 누군가가 방에 참가하면 알림을 받는게 Peer A이기 때문.
// 그러니까 peer A가 offer를 만드는 행위를 시작하는 주체라고 할 수 있다.

///////////////////////////////////////////////////////////////
// Caller
// This code gets executed at the Caller side.
function initCallerDataChannel() {
  dataChannel = peerConnection.createDataChannel("general-message");
  console.log("Made data channel.");
  dataChannel.addEventListener("message", videoChatMessageHandler);
}

function videoChatMessageHandler(event) {
  console.log(event.data);
}

// offer 오브젝트를 만드는데 이 offer 오브젝트에는
// 아주 많은 텍스트 데이터들이 들어있다.
// 그 내용을 우리가 이해하기는 어렵지만 이 텍스트들이 무슨 역할을 하냐면
// 다른 브라우저들이 참가할 수 있도록 초대장을 만드는거다.
// 이건 real-time 세션에 대한 설명(description)을 담고 있다.
// 우리가 누구이며 어디있고 등등의 내용들.
//
// 그리고 `setLocalDescription()`을 호출한다.
// 만들어진 offer로 연결을 구성해주는 역할이다.
//
// Caller
// This code gets executed at the Caller side.
async function sendRtcSignalingOffer({ roomName }) {
  const offer = await peerConnection.createOffer();
  peerConnection.setLocalDescription(offer);

  socket.emit("rtc-signaling-transmit-offer", { offer, roomName });
  console.log("Sent the offer:", offer);
  // offer를 전송한다.
  // 근데 server에서 socket.io한테 어떤 방으로 이 offer를 emit해서
  // 누구한테로 이 offer를 보낼건지를 알려줘야한다.
  // 그래서 roomName도 같이 보내줘야 한다.
  // (server.js 코드 참고)
}

///////////////////////////////////////////////////////////////
// Receiver
// This code gets executed at the Receiver side.
function initReceiverDataChannel() {
  peerConnection.addEventListener("datachannel", videoChatReceiveDataChannelHandler);
}

function videoChatReceiveDataChannelHandler(event) {
  console.log("Sensored and received data channel creation.");
  console.log(event);
  dataChannel = event.channel;
  dataChannel.addEventListener("message", videoChatMessageHandler)
}

///////////////////////////////////////////////////////////////
// Receiver
// This code gets executed at the Receiver side.
socket.on("rtc-signaling-transmit-offer", ({ offer, roomName }) => {
  receiveRtcSignalingOffer({ offer });
  sendRtcSignalingAnswer({ roomName });
});

// Receiver
// This code gets executed at the Receiver side.
function receiveRtcSignalingOffer({ offer }) {
  console.log("Received the offer:", offer);
  peerConnection.setRemoteDescription(offer);
}

// Receiver는 서버를 통해서 Caller한테 받은 offer 객체에
// `setRemoteDescription`을 해준 후
// Caller가 offer 객체를 만들고 설정(`setLocalDescription`)을 해준 후 전송했을 때처럼 
// Receiver도 answer 오브젝트를 만들고 `setLocalDescription`을 해주고,
// Caller가 offer를 보내듯 Receiver도 answer 객체를 reply(응답)로써
// socket을 통해 전송해준다.
// answer 객체도 offer 객체와 비슷하게 아주 많은 텍스트 데이터들이 들어있고,
// 구조도 비슷하게 생겼다.
//
// answer를 서버로 보내고 서버에서는 socket.on으로 answer를 받아내고,
// 그걸 방에 있는 모든 사람(여기선 1:1 화상채팅이므로 상대방[Receiver])에게 알려줘야한다.
// 그러려면 server가 해당 방을 인지하고(`roomName`) `emit`해줘야하므로
// payload로써 roomName도 같이 보내줘야한다.

// Receiver
// This code gets executed at the Receiver side.
async function sendRtcSignalingAnswer({ roomName }) {
  const answer = await peerConnection.createAnswer();
  peerConnection.setLocalDescription(answer);

  socket.emit("rtc-signaling-transmit-answer", { answer, roomName });
  console.log("sent the answer:", answer);
}

///////////////////////////////////////////////////////////////
// Receiver가 받은 offer를 `setRemoteDescription` 해준것과 마찬가지로
// Caller도 받은 answer를 `setRemoteDescription` 해준다.
// 그러고나면 두 클라이언트 (Caller, Receiver) 모두
// session LocalDescription과 RemoteDescription을 가지게 된다.
//
// Peer A               Peer B
// offer  -------------> offer
// (LocalDescription)    (RemoteDescription)
//
// answer  <-----------  answer
// (RemoteDescription)   (LocalDescription)
//
// 참고로
// `initVideoChatMediaLocalSettings`
// (`updateLocalStream`[`openMediaDevice`[`getUserMedia`]] &
// `updateAvailableVideoDevicesList`) 코드와
// `initVideoChatConnectionLocalSettings`
// (`addTrack`) 코드들은
// offer-answer ping-pong 과정(단계)(signaling)에서 포함된(필요한) 과정은 아니다.

// Caller
// This code gets executed at the caller side.
function receiveRtcSignalingAnswer({ answer }) {
  console.log("Received the answer:", answer);
  peerConnection.setRemoteDescription(answer);
}

// Caller
// This code gets executed at the caller side.
socket.on("rtc-signaling-transmit-answer", ({ answer }) => {
  receiveRtcSignalingAnswer({ answer });
})
