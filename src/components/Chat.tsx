import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { ChatMessage } from '../types';
import { cn } from '../lib/utils';

interface ChatProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  currentUserId: string;
}

export default function Chat({ messages, onSendMessage, currentUserId }: ChatProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-800">
        <h3 className="font-medium">Chat</h3>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-700"
      >
        {messages.map((msg, i) => {
          const isMe = msg.senderId === currentUserId;
          return (
            <div 
              key={i} 
              className={cn(
                "flex flex-col max-w-[85%]",
                isMe ? "ml-auto items-end" : "mr-auto items-start"
              )}
            >
              <span className="text-[10px] text-gray-500 mb-1 px-1">
                {isMe ? 'You' : msg.senderName}
              </span>
              <div className={cn(
                "px-3 py-2 rounded-2xl text-sm",
                isMe ? "bg-blue-600 text-white rounded-tr-none" : "bg-gray-800 text-gray-200 rounded-tl-none"
              )}>
                {msg.message}
              </div>
            </div>
          );
        })}
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 text-center p-8">
            <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <Send className="w-5 h-5 opacity-20" />
            </div>
            <p className="text-xs">No messages yet. Start the conversation!</p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 bg-[#202124] border-t border-gray-800">
        <div className="relative">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="w-full bg-gray-800 border-none rounded-xl py-3 pl-4 pr-12 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          />
          <button 
            type="submit"
            disabled={!input.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-blue-500 hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
