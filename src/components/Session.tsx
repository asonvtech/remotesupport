import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Video, VideoOff, Mic, MicOff, MonitorUp, PhoneOff, 
  MessageSquare, Users, Settings, MousePointer2, 
  Maximize2, Minimize2 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import Toast from './Toast';
import Chat from './Chat';
import { ChatMessage, ConnectionStatus } from '../types';

interface SessionProps {
  roomId: string;
  userName: string;
  onLeave: () => void;
}

export default function Session({ roomId, userName, onLeave }: SessionProps) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isRemoteMouseDown, setIsRemoteMouseDown] = useState(false);

  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [remotePointer, setRemotePointer] = useState<{ x: number, y: number } | null>(null);
  // For smoothing: the displayed pointer will interpolate towards targetPointerRef.current
  const displayedPointerRef = useRef<{ x: number, y: number } | null>(null);
  const targetPointerRef = useRef<{ x: number, y: number } | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const sharedVideoRef = useRef<HTMLVideoElement>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const sharedStreamRef = useRef<MediaStream | null>(null);
  const [remoteRipples, setRemoteRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const [remoteKey, setRemoteKey] = useState<{ key: string; ts: number } | null>(null);
  const [hasControl, setHasControl] = useState(false);
  const [controlRequestFrom, setControlRequestFrom] = useState<string | null>(null);

  const addRemoteRipple = (x: number, y: number) => {
    const id = Date.now();
    setRemoteRipples((r) => [...r, { id, x, y }]);
    // remove after 600ms
    setTimeout(() => setRemoteRipples((r) => r.filter(rr => rr.id !== id)), 600);
  };

  const showRemoteKey = (key: string) => {
    setRemoteKey({ key, ts: Date.now() });
    setTimeout(() => setRemoteKey(null), 1500);
  };

  useEffect(() => {
    socketRef.current = io();
    const socket = socketRef.current;

    // Register handlers first, then initialize local media and join the room.
    // This ensures we have local tracks available before creating offers for new peers.
    socket.on('user-joined', (userId) => {
      console.log('User joined:', userId);
      createOffer(userId);
    });

    socket.on('offer', async ({ from, offer }) => {
      await handleOffer(from, offer);
    });

    socket.on('answer', async ({ from, answer }) => {
      await handleAnswer(from, answer);
    });

    socket.on('ice-candidate', async ({ from, candidate }) => {
      if (peerRef.current) {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    socket.on('chat-message', (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
    });

    socket.on('remote-control', ({ from, type, data }) => {
      if (type === 'mousemove') {
        // update target pointer for smoothing
        targetPointerRef.current = data;
      } else if (type === 'mousedown') {
        setIsRemoteMouseDown(true);
        // add a ripple at the pointer location
        if (data && typeof data.x === 'number' && typeof data.y === 'number') {
          addRemoteRipple(data.x, data.y);
        }
        // also position pointer
        targetPointerRef.current = data;
      } else if (type === 'mouseup') {
        setIsRemoteMouseDown(false);
        targetPointerRef.current = data;
      } else if (type === 'keydown' || type === 'keyup') {
        // show a small key visual near the pointer
        if (data && data.key) showRemoteKey(data.key);
        setToastMessage(`Remote ${type}: ${data.key}`);
      }
    });

    // Control request/respond flow
    socket.on('control-request', ({ from }: { from: string }) => {
      // If this client is currently sharing the screen, show a prompt to accept/deny
      setControlRequestFrom(from);
    });

    socket.on('control-granted', ({ roomId, from }: { roomId: string; from: string }) => {
      // This client was granted control
      setHasControl(true);
      setToastMessage('Control granted');
    });

    socket.on('control-denied', ({ roomId, from }: { roomId: string; from: string }) => {
      setToastMessage('Control request denied');
    });

    socket.on('control-revoked', ({ roomId, from }: { roomId: string; from: string }) => {
      if (hasControl) setHasControl(false);
      setToastMessage('Control revoked');
    });

    // Initialize local stream first, then announce join to the room so any
    // offer/answer exchanges include our local tracks.
    (async () => {
      await initLocalStream();
      socket.emit('join-room', roomId);
    })();

    return () => {
      socket.disconnect();
      localStreamRef.current?.getTracks().forEach(track => track.stop());
      peerRef.current?.close();
    };
  }, [roomId]);

  // Interpolation loop for smooth pointer movement
  useEffect(() => {
    let rafId: number;
    const step = () => {
      const target = targetPointerRef.current;
      const displayed = displayedPointerRef.current;
      if (target && (!displayed || displayed.x !== target.x || displayed.y !== target.y)) {
        if (!displayed) {
          displayedPointerRef.current = { x: target.x, y: target.y };
        } else {
          // ease towards target
          displayedPointerRef.current = {
            x: displayed.x + (target.x - displayed.x) * 0.22,
            y: displayed.y + (target.y - displayed.y) * 0.22,
          };
        }
        setRemotePointer({ ...displayedPointerRef.current! });
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const initLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      // If video should be off by default, disable video tracks immediately
      if (!isVideoOn) {
        stream.getVideoTracks().forEach(t => (t.enabled = false));
      }

      if (localVideoRef.current) {
        // localVideoRef should always show the camera (if any)
        localVideoRef.current.srcObject = stream;
      }
      setStatus('idle');
    } catch (err) {
      console.error('Error accessing media devices:', err);
      setStatus('error');
    }
  };

  const createPeerConnection = (targetId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('ice-candidate', { roomId, candidate: event.candidate, to: targetId });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        setStatus('connected');
      }
    };

    // Add local tracks
    localStreamRef.current?.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current!);
    });

    // Data channel for remote control/chat
    const dc = pc.createDataChannel('control');
    setupDataChannel(dc);
    dataChannelRef.current = dc;

    pc.ondatachannel = (event) => {
      setupDataChannel(event.channel);
    };

    peerRef.current = pc;
    return pc;
  };

  const setupDataChannel = (dc: RTCDataChannel) => {
    dc.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'mousemove') {
        setRemotePointer(data.data);
      }
    };
  };

  const createOffer = async (targetId: string) => {
    const pc = createPeerConnection(targetId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socketRef.current?.emit('offer', { roomId, offer, to: targetId });
  };

  const handleOffer = async (from: string, offer: RTCSessionDescriptionInit) => {
    const pc = createPeerConnection(from);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socketRef.current?.emit('answer', { roomId, answer, to: from });
  };

  const handleAnswer = async (from: string, answer: RTCSessionDescriptionInit) => {
    if (peerRef.current) {
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer));
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioOn(audioTrack.enabled);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOn(videoTrack.enabled);
    }
  };

  const startScreenShare = async () => {
    try {
      // Feature-detect getDisplayMedia for browsers/devices that don't support it (e.g., iOS Safari)
      const hasGetDisplayMedia = typeof (navigator.mediaDevices as any).getDisplayMedia === 'function';
      let screenStream: MediaStream | null = null;

      if (hasGetDisplayMedia) {
        screenStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
      } else {
        // Fallback: inform the user and try to fall back to camera capture where possible
        // (true screen capture on mobile browsers is limited/unavailable)
        alert('Screen sharing is not supported on this device/browser. Falling back to camera capture.');
        screenStream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      if (!screenStream) return;

      const videoTrack = screenStream.getVideoTracks()[0];

        if (peerRef.current) {
          const sender = peerRef.current.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(videoTrack);
          }
        }

        // Store shared stream and show it in the main area locally
        sharedStreamRef.current = screenStream;
        if (sharedVideoRef.current) sharedVideoRef.current.srcObject = screenStream;

        videoTrack.onended = () => {
          stopScreenShare();
        };

        setIsScreenSharing(true);
    } catch (err) {
      console.error('Error starting screen share:', err);
      alert('Unable to start screen share on this device/browser.');
    }
  };

  const stopScreenShare = async () => {
    // Replace the outgoing video track with the camera track (if available)
    if (peerRef.current && localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      const sender = peerRef.current.getSenders().find(s => s.track?.kind === 'video');
      if (sender && videoTrack) {
        sender.replaceTrack(videoTrack);
      }
    }

    // Stop and clear the shared stream locally
    if (sharedStreamRef.current) {
      sharedStreamRef.current.getTracks().forEach(t => t.stop());
      sharedStreamRef.current = null;
    }
    if (sharedVideoRef.current) {
      sharedVideoRef.current.srcObject = null;
    }

    // Ensure local preview shows camera
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }

    setIsScreenSharing(false);
  };

  const sendMessage = (text: string) => {
    socketRef.current?.emit('chat-message', { roomId, message: text, senderName: userName });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isScreenSharing) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const payload = { x, y };
      socketRef.current?.emit('remote-control', { roomId, type: 'mousemove', data: payload, to: roomId });
      try { dataChannelRef.current?.send(JSON.stringify({ type: 'mousemove', data: payload })); } catch {}
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isScreenSharing) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const payload = { x, y, button: e.button };
      socketRef.current?.emit('remote-control', { roomId, type: 'mousedown', data: payload, to: roomId });
      try { dataChannelRef.current?.send(JSON.stringify({ type: 'mousedown', data: payload })); } catch {};
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isScreenSharing) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const payload = { x, y, button: e.button };
      socketRef.current?.emit('remote-control', { roomId, type: 'mouseup', data: payload, to: roomId });
      try { dataChannelRef.current?.send(JSON.stringify({ type: 'mouseup', data: payload })); } catch {};
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (isScreenSharing) {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const payload = { x, y, deltaX: e.deltaX, deltaY: e.deltaY };
      socketRef.current?.emit('remote-control', { roomId, type: 'wheel', data: payload, to: roomId });
      try { dataChannelRef.current?.send(JSON.stringify({ type: 'wheel', data: payload })); } catch {}
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (isScreenSharing) {
      e.preventDefault();
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const payload = { x, y, button: e.button };
      socketRef.current?.emit('remote-control', { roomId, type: 'contextmenu', data: payload, to: roomId });
      try { dataChannelRef.current?.send(JSON.stringify({ type: 'contextmenu', data: payload })); } catch {}
    }
  };

  // Keyboard events (when screen sharing)
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (!isScreenSharing) return;
      const payload = { key: ev.key, code: ev.code, altKey: ev.altKey, ctrlKey: ev.ctrlKey, shiftKey: ev.shiftKey };
      socketRef.current?.emit('remote-control', { roomId, type: 'keydown', data: payload, to: roomId });
      try { dataChannelRef.current?.send(JSON.stringify({ type: 'keydown', data: payload })); } catch {}
    };
    const onKeyUp = (ev: KeyboardEvent) => {
      if (!isScreenSharing) return;
      const payload = { key: ev.key, code: ev.code, altKey: ev.altKey, ctrlKey: ev.ctrlKey, shiftKey: ev.shiftKey };
      socketRef.current?.emit('remote-control', { roomId, type: 'keyup', data: payload, to: roomId });
      try { dataChannelRef.current?.send(JSON.stringify({ type: 'keyup', data: payload })); } catch {}
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [isScreenSharing, roomId]);

  return (
    <div className="h-screen flex flex-col bg-[#1a1a1a] text-white overflow-hidden">
      {/* Header */}
      <header className="px-6 py-4 bg-[#202124] border-b border-gray-800 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2 rounded-lg">
            <MonitorUp className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-medium text-sm">Session: {roomId}</h2>
            <div className="flex items-center gap-2">
              <span className={cn(
                "w-2 h-2 rounded-full",
                status === 'connected' ? "bg-green-500" : "bg-yellow-500"
              )} />
              <span className="text-xs text-gray-400 capitalize">{status}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowChat(!showChat)}
            className={cn(
              "p-2 rounded-full transition-colors relative",
              showChat ? "bg-blue-600 text-white" : "hover:bg-gray-800 text-gray-400"
            )}
          >
            <MessageSquare className="w-5 h-5" />
            {messages.length > 0 && !showChat && (
              <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>
          <button className="p-2 rounded-full hover:bg-gray-800 text-gray-400">
            <Users className="w-5 h-5" />
          </button>
          <button className="p-2 rounded-full hover:bg-gray-800 text-gray-400">
            <Settings className="w-5 h-5" />
          </button>
          {/* Request control button - shown to viewers */}
          {!isScreenSharing && (
            <button
              onClick={() => socketRef.current?.emit('control-request', { roomId })}
              className={cn("p-2 rounded-full hover:bg-gray-800 text-gray-400")}
            >
              Request Control
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative flex overflow-hidden">
        <div className="flex-1 relative bg-black flex items-center justify-center p-4">
          {/* Remote Video (The other person's screen or camera) */}
          <div className="relative w-full h-full max-w-6xl mx-auto rounded-2xl overflow-hidden bg-gray-900 shadow-2xl">
            {isScreenSharing ? (
              <video
                ref={sharedVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain"
                onMouseMove={handleMouseMove}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onWheel={handleWheel}
                onContextMenu={handleContextMenu}
              />
            ) : (
              <video 
                ref={remoteVideoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-contain"
                onMouseMove={handleMouseMove}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onWheel={handleWheel}
                onContextMenu={handleContextMenu}
              />
            )}
            
            {/* Remote Pointer Visualization */}
            {remotePointer && (
              <motion.div 
                animate={{ x: `${remotePointer.x * 100}%`, y: `${remotePointer.y * 100}%` }}
                className="absolute top-0 left-0 pointer-events-none z-50"
              >
                <div className="relative">
                  <MousePointer2 className="text-red-500 w-6 h-6 drop-shadow-lg fill-red-500" />
                  <div className="absolute top-full left-full bg-red-500 text-white text-[10px] px-1 rounded whitespace-nowrap">
                    Remote User
                  </div>
                </div>
              </motion.div>
            )}

            {/* Remote click ripples */}
            {remoteRipples.map(r => (
              <div key={r.id} className="absolute top-0 left-0 pointer-events-none z-40" style={{ transform: `translate(${r.x * 100}%, ${r.y * 100}%)` }}>
                <span className="block w-6 h-6 -translate-x-1/2 -translate-y-1/2 bg-white/30 rounded-full animate-ping" />
              </div>
            ))}

            {/* Remote key visual */}
            {remoteKey && remotePointer && (
              <div className="absolute z-50 pointer-events-none" style={{ left: `${remotePointer.x * 100}%`, top: `${remotePointer.y * 100}%`, transform: 'translate(-50%,-160%)' }}>
                <div className="bg-yellow-400 text-black px-2 py-1 rounded text-sm font-semibold drop-shadow">{remoteKey.key}</div>
              </div>
            )}

            {status === 'connecting' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 backdrop-blur-sm">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-gray-400 font-medium">Waiting for connection...</p>
              </div>
            )}
          </div>

          {/* Local Video Preview (Small floating window) */}
          <motion.div 
            drag
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            className="absolute bottom-8 right-8 w-64 aspect-video bg-gray-800 rounded-xl overflow-hidden shadow-2xl border-2 border-gray-700 z-20 cursor-move"
          >
            <video 
              ref={localVideoRef} 
              autoPlay 
              muted 
              playsInline 
              className="w-full h-full object-cover mirror"
            />
            {/* Outgoing video indicator */}
            {!isVideoOn && (
              <div className="absolute top-2 right-2 bg-red-600 text-white text-xs px-2 py-1 rounded">
                Video Off
              </div>
            )}
            <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-0.5 rounded text-[10px] font-medium">
              You ({userName})
            </div>
          </motion.div>
        </div>

        {/* Chat Sidebar */}
        <AnimatePresence>
          {showChat && (
            <motion.div 
              initial={{ x: 320 }}
              animate={{ x: 0 }}
              exit={{ x: 320 }}
              className="w-80 bg-[#202124] border-l border-gray-800 flex flex-col"
            >
              <Chat 
                messages={messages} 
                onSendMessage={sendMessage} 
                currentUserId={socketRef.current?.id || ''} 
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Controls Bar */}
      <footer className="px-6 py-6 bg-[#202124] border-t border-gray-800 flex items-center justify-center gap-4 z-10">
        <button 
          onClick={toggleAudio}
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-all",
            isAudioOn ? "bg-gray-800 hover:bg-gray-700 text-white" : "bg-red-500 hover:bg-red-600 text-white"
          )}
        >
          {isAudioOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>
        
        <button 
          onClick={toggleVideo}
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-all",
            isVideoOn ? "bg-gray-800 hover:bg-gray-700 text-white" : "bg-red-500 hover:bg-red-600 text-white"
          )}
        >
          {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>

        <button 
          onClick={isScreenSharing ? stopScreenShare : startScreenShare}
          className={cn(
            "px-6 h-12 rounded-full flex items-center justify-center gap-2 transition-all font-medium",
            isScreenSharing ? "bg-blue-600 text-white" : "bg-gray-800 hover:bg-gray-700 text-white"
          )}
        >
          <MonitorUp className="w-5 h-5" />
          {isScreenSharing ? "Stop Sharing" : "Share Screen"}
        </button>

        <div className="w-px h-8 bg-gray-800 mx-2" />

        <button 
          onClick={onLeave}
          className="px-6 h-12 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center gap-2 font-medium transition-all"
        >
          <PhoneOff className="w-5 h-5" />
          End Session
        </button>
        {/* Release control button when this client has control */}
        {hasControl && (
          <button
            onClick={() => {
              socketRef.current?.emit('control-release', { roomId, from: socketRef.current?.id });
              setHasControl(false);
            }}
            className="px-4 h-12 rounded-full bg-yellow-500 hover:bg-yellow-600 text-black flex items-center justify-center gap-2 font-medium transition-all"
          >
            Release Control
          </button>
        )}
      </footer>

  {/* Toast messages */}
  <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      {/* Control request modal (shown to sharer) */}
      {controlRequestFrom && isScreenSharing && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60">
          <div className="bg-white text-black p-6 rounded-lg shadow-lg">
            <p className="mb-4">User <strong>{controlRequestFrom}</strong> is requesting control. Allow?</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => {
                socketRef.current?.emit('control-response', { roomId, to: controlRequestFrom, accept: false });
                setControlRequestFrom(null);
              }} className="px-4 py-2 rounded bg-gray-200">Deny</button>
              <button onClick={() => {
                socketRef.current?.emit('control-response', { roomId, to: controlRequestFrom, accept: true });
                setControlRequestFrom(null);
              }} className="px-4 py-2 rounded bg-blue-600 text-white">Allow</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .mirror {
          transform: scaleX(-1);
        }
      `}</style>
    </div>
  );
}
