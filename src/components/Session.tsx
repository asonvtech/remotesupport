import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Video, VideoOff, Mic, MicOff, MonitorUp, PhoneOff, 
  MessageSquare, Users, Settings, MousePointer2, 
  Maximize2, Minimize2 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { ChatMessage, ConnectionStatus } from '../types';
import Chat from './Chat';

interface SessionProps {
  roomId: string;
  userName: string;
  onLeave: () => void;
}

export default function Session({ roomId, userName, onLeave }: SessionProps) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [remotePointer, setRemotePointer] = useState<{ x: number, y: number } | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  useEffect(() => {
    socketRef.current = io();
    const socket = socketRef.current;

    socket.emit('join-room', roomId);

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
        setRemotePointer(data);
      }
    });

    // Initialize local stream
    initLocalStream();

    return () => {
      socket.disconnect();
      localStreamRef.current?.getTracks().forEach(track => track.stop());
      peerRef.current?.close();
    };
  }, [roomId]);

  const initLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
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
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const videoTrack = screenStream.getVideoTracks()[0];

      if (peerRef.current) {
        const sender = peerRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = screenStream;
      }

      videoTrack.onended = () => {
        stopScreenShare();
      };

      setIsScreenSharing(true);
    } catch (err) {
      console.error('Error starting screen share:', err);
    }
  };

  const stopScreenShare = async () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (peerRef.current) {
        const sender = peerRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
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
      
      socketRef.current?.emit('remote-control', {
        roomId,
        type: 'mousemove',
        data: { x, y },
        to: 'all' // In a 1:1 session this is fine
      });
    }
  };

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
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative flex overflow-hidden">
        <div className="flex-1 relative bg-black flex items-center justify-center p-4">
          {/* Remote Video (The other person's screen or camera) */}
          <div className="relative w-full h-full max-w-6xl mx-auto rounded-2xl overflow-hidden bg-gray-900 shadow-2xl">
            <video 
              ref={remoteVideoRef} 
              autoPlay 
              playsInline 
              className="w-full h-full object-contain"
              onMouseMove={handleMouseMove}
            />
            
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
      </footer>

      <style>{`
        .mirror {
          transform: scaleX(-1);
        }
      `}</style>
    </div>
  );
}
