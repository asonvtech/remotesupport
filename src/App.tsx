/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import Home from './components/Home';
import Session from './components/Session';

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');

  // Check URL for room ID on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      setRoomId(room);
    }
  }, []);

  const handleJoin = (id: string, name: string) => {
    setRoomId(id);
    setUserName(name);
    // Update URL without reload
    const url = new URL(window.location.href);
    url.searchParams.set('room', id);
    window.history.pushState({}, '', url);
  };

  const handleLeave = () => {
    setRoomId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.pushState({}, '', url);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#202124] font-sans">
      {!roomId ? (
        <Home onJoin={handleJoin} />
      ) : (
        <Session 
          roomId={roomId} 
          userName={userName || 'User'} 
          onLeave={handleLeave} 
        />
      )}
    </div>
  );
}
