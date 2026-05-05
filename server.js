const express = require("express");
const http = require("http");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static("public"));

/* ===== FILE STORAGE ===== */
const filePath = path.join(__dirname, "messages.json");

let messages = [];

try {
  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath, "utf8");
    messages = data ? JSON.parse(data) : [];
  }
} catch (err) {
  console.log("Read error:", err);
}

/* ===== USERS (IN MEMORY) ===== */
let users = {};

/* ===== REGISTER ===== */
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  if (users[username]) {
    return res.json({ success: false, message: "User exists" });
  }

  const hashed = await bcrypt.hash(password, 10);
  users[username] = hashed;

  res.json({ success: true });
});

/* ===== LOGIN ===== */
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const user = users[username];
  if (!user) return res.json({ success: false });

  const valid = await bcrypt.compare(password, user);
  if (!valid) return res.json({ success: false });

  const token = jwt.sign({ username }, "secret123");
  res.json({ success: true, token, username });
});

/* ===== SOCKET AUTH ===== */
io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  try {
    const user = jwt.verify(token, "secret123");
    socket.user = user;
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

/* ===== SOCKET CHAT ===== */
io.on("connection", (socket) => {
  console.log("User connected:", socket.user.username);

  // Send old messages
  socket.emit("loadMessages", messages);

  socket.on("chatMessage", (msg) => {
    const fullMsg = `${socket.user.username}: ${msg}`;

    messages.push(fullMsg);

    try {
      fs.writeFileSync(filePath, JSON.stringify(messages, null, 2));
      console.log("Saved:", fullMsg);
    } catch (err) {
      console.log("Save error:", err);
    }

    io.emit("message", fullMsg);
  });
});

/* ===== START SERVER ===== */
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});