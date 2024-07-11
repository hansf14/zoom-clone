alert("Hello");

const chat = document.querySelector("#chat");
const members = document.querySelector("#members");
const nicknameForm = document.querySelector("#nickname");
const messageForm = document.querySelector("#message");
const messageInput = messageForm.querySelector("input");
const placeholder = messageForm.querySelector(".placeholder p");
let placeholderChildNodes = [...placeholder.childNodes];

const socket = new WebSocket(`ws://${window.location.host}`);
// const socket = new WebSocket(`wss://${window.location.host}`);

let myNickname = null;
let membersNicknamesList = [];

socket.addEventListener("open", (event) => {
  // console.log(event);
  console.log("Connected to the server.");

  socket.send(makeMessage("join", null));
});

socket.addEventListener("message", (event) => {
  let msg = event.data;
  msg = JSON.parse(msg);
  // console.log(msg);

  switch (msg.type) {
    case "join-broadcast": {
      const { nickname, additionalMembersNicknames } = msg.payload;

      let textToAppend = `"${nickname}"`;
      let span = document.createElement("span");
      span.classList.add("nickname");
      span.innerText = textToAppend;

      let li = document.createElement("li");
      li.appendChild(span);

      textToAppend = " has joined the chat.";
      let textNode = document.createTextNode(textToAppend);
      li.appendChild(textNode);

      chat.append(li);

      membersNicknamesList =
        additionalMembersNicknames.length === 0
          ? membersNicknamesList
          : [...additionalMembersNicknames];
      membersNicknamesList.push(nickname);
      updateMembersBoard();

      break;
    }
    case "default-nickname": {
      myNickname = msg.payload;

      placeholder.replaceChildren();
      let span = document.createElement("span");
      span.classList.add("nickname");
      span.innerText = myNickname;
      placeholder.appendChild(span);
      placeholder.appendChild(document.createTextNode(": ..."));

      placeholderChildNodes = [...placeholder.childNodes];
      break;
    }
    case "nickname-change-success": {
      myNickname = msg.payload;
      alert(`Successfully changed your nickname to "${myNickname}".`);

      placeholder.replaceChildren();
      let span = document.createElement("span");
      span.classList.add("nickname");
      span.innerText = myNickname;
      placeholder.appendChild(span);
      placeholder.appendChild(document.createTextNode(": ..."));

      placeholderChildNodes = [...placeholder.childNodes];
      break;
    }
    case "nickname-change-broadcast": {
      const { prevNickname, newNickname } = msg.payload;

      let textToAppend = `"${prevNickname}"`;
      let span = document.createElement("span");
      span.classList.add("nickname");
      span.innerText = textToAppend;

      const li = document.createElement("li");
      li.appendChild(span);

      textToAppend = " has changed the nickname to ";
      let textNode = document.createTextNode(textToAppend);
      li.appendChild(textNode);

      textToAppend = `"${newNickname}"`;
      span = document.createElement("span");
      span.classList.add("nickname");
      span.innerText = textToAppend;
      li.appendChild(span);

      textToAppend = ".";
      textNode = document.createTextNode(textToAppend);
      li.appendChild(textNode);

      chat.append(li);

      const idx = membersNicknamesList.findIndex(
        (nickname) => nickname === prevNickname
      );
      membersNicknamesList[idx] = newNickname;
      updateMembersBoard();

      break;
    }
    case "new-message": {
      const { nickname, msgContent } = msg.payload;

      let span = document.createElement("span");
      span.classList.add("nickname");
      span.innerText = nickname;

      const li = document.createElement("li");
      li.appendChild(span);
      li.appendChild(document.createTextNode(`: ${msgContent}`));

      chat.append(li);
      break;
    }
    case "leave-broadcast": {
      const { nickname: nicknameToRemove } = msg.payload;

      let textToAppend = `"${nicknameToRemove}"`;
      let span = document.createElement("span");
      span.classList.add("nickname");
      span.innerText = textToAppend;

      const li = document.createElement("li");
      li.appendChild(span);

      textToAppend = " has left the chat.";
      let textNode = document.createTextNode(textToAppend);
      li.appendChild(textNode);

      chat.append(li);

      const idx = membersNicknamesList.findIndex(
        (nickname) => nickname === nicknameToRemove
      );
      membersNicknamesList.splice(idx, 1);
      updateMembersBoard();

      break;
    }
    case "nickname-change-fail":
      alert(msg.payload);
      break;
    case "error":
      alert(msg.payload);
      break;
    default:
      alert("Undefined error occurred.");
      break;
  }
});

socket.addEventListener("close", (event) => {
  console.log("Disconnected from the server.");
});

nicknameForm.addEventListener("submit", nicknameSubmitHandler);
messageForm.addEventListener("submit", messageSubmitHandler);
messageInput.addEventListener("focus", messageFocusHandler);
messageInput.addEventListener("blur", messageBlurHandler);

function updateMembersBoard() {
  const listToUpdateFrom = membersNicknamesList.sort();
  let lis = members.querySelectorAll("li");

  if (listToUpdateFrom.length >= lis.length) {
    lis.forEach((li, _idx) => {
      li.textContent = listToUpdateFrom[_idx];
    });
  } else {
    for (let i = listToUpdateFrom.length; i < lis.length; i++) {
      lis[i].remove();
    }
    lis.forEach((li, _idx) => {
      li.textContent = listToUpdateFrom[_idx];
    });
  }

  if (listToUpdateFrom.length > lis.length) {
    lis = listToUpdateFrom
      .slice(lis.length, listToUpdateFrom.length)
      .map((memberNickname) => {
        const li = document.createElement("li");
        li.textContent = memberNickname;
        return li;
      });
    members.append(...lis);
  }
}

function nicknameSubmitHandler(event) {
  event.preventDefault();
  const input = nicknameForm.querySelector("input");

  const newNickname = input.value;
  input.value = "";
  if (myNickname === newNickname) {
    alert(
      "You have put in the same nickname as your current nickname. Your nickname will remain the same."
    );
    return;
  }
  socket.send(makeMessage("nickname-change", newNickname));
}

function messageSubmitHandler(event) {
  event.preventDefault();
  const input = messageInput;

  socket.send(makeMessage("new-message", input.value));

  let span = document.createElement("span");
  span.classList.add("nickname");
  span.innerText = "Me";

  const li = document.createElement("li");
  li.appendChild(span);
  li.appendChild(document.createTextNode(`: ${input.value}`));

  chat.append(li);
  input.value = "";
}

function messageFocusHandler(event) {
  placeholder.replaceChildren();
}

function messageBlurHandler(event) {
  if (messageInput.value === "") {
    placeholder.append(...placeholderChildNodes);
  }
}

function makeMessage(type, payload) {
  const msg = { type, payload };
  return JSON.stringify(msg);
}
