import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = Number(process.env.PORT) || 3000;

  // Socket.io signaling logic
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Note: keep a simple in-memory map of which socket has control for each room.
    // This is intentionally simple for demo purposes.
    const allowedControllers = new Map<string, string>();

    socket.on("join-room", (roomId: string) => {
      socket.join(roomId);
      console.log(`User ${socket.id} joined room ${roomId}`);
      
      // Notify others in the room
      socket.to(roomId).emit("user-joined", socket.id);
    });

    socket.on("offer", ({ roomId, offer, to }) => {
      socket.to(to).emit("offer", { from: socket.id, offer });
    });

    socket.on("answer", ({ roomId, answer, to }) => {
      socket.to(to).emit("answer", { from: socket.id, answer });
    });

    socket.on("ice-candidate", ({ roomId, candidate, to }) => {
      socket.to(to).emit("ice-candidate", { from: socket.id, candidate });
    });

    socket.on("chat-message", ({ roomId, message, senderName }) => {
      io.to(roomId).emit("chat-message", { senderId: socket.id, senderName, message, timestamp: Date.now() });
    });

    socket.on('control-request', ({ roomId }: { roomId: string }) => {
      socket.to(roomId).emit('control-request', { from: socket.id });
    });

    socket.on('control-response', ({ roomId, to, accept }: { roomId: string; to: string; accept: boolean }) => {
      if (accept) {
        allowedControllers.set(roomId, to);
        socket.to(to).emit('control-granted', { roomId, from: socket.id });
        socket.to(roomId).emit('control-granted-notify', { grantedTo: to });
      } else {
        socket.to(to).emit('control-denied', { roomId, from: socket.id });
      }
    });

    socket.on('control-release', ({ roomId, from }: { roomId: string; from: string }) => {
      const current = allowedControllers.get(roomId);
      if (current && current === from) {
        allowedControllers.delete(roomId);
        io.to(roomId).emit('control-revoked', { roomId, from });
      }
    });

    socket.on("remote-control", ({ roomId, type, data, to }: { roomId: string; type: string; data: any; to?: string }) => {
      // If 'to' is a specific socket id, forward directly
      if (to && to !== 'all' && to !== roomId) {
        socket.to(to).emit("remote-control", { from: socket.id, type, data });
        return;
      }

      // If broadcasting to the room, ensure sender has been granted control for this room
      const controller = allowedControllers.get(roomId);
      if (!controller || controller !== socket.id) {
        // ignore remote-control messages from clients that don't have permission
        console.log(`Ignoring remote-control from ${socket.id} for room ${roomId} (no permission)`);
        return;
      }

      // Broadcast to others in the room
      socket.to(roomId).emit("remote-control", { from: socket.id, type, data });
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
