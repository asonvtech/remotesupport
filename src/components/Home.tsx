import React, { useState } from 'react';
import { Monitor, ShieldCheck, ArrowRight, Keyboard } from 'lucide-react';
import { motion } from 'motion/react';

interface HomeProps {
  onJoin: (id: string, name: string) => void;
}

export default function Home({ onJoin }: HomeProps) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (id && name) {
      onJoin(id, name);
    }
  };

  const generateId = () => {
    const newId = Math.floor(100000000 + Math.random() * 900000000).toString();
    setId(newId);
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-20">
      <header className="text-center mb-16">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-6 shadow-lg shadow-blue-200"
        >
          <Monitor className="text-white w-8 h-8" />
        </motion.div>
        <h1 className="text-4xl font-medium tracking-tight mb-4">Remote Support</h1>
        <p className="text-gray-500 text-lg max-w-xl mx-auto">
          Securely share your screen or help someone else with their computer.
          Fast, simple, and completely free.
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Get Support */}
        <motion.div 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-50 rounded-lg">
              <ShieldCheck className="text-blue-600 w-6 h-6" />
            </div>
            <h2 className="text-xl font-medium">Get Support</h2>
          </div>
          <p className="text-gray-600 mb-8 leading-relaxed">
            Generate a code to share with someone you trust. They will be able to see your screen and help you.
          </p>
          <button 
            onClick={generateId}
            className="w-full py-3 px-6 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 group"
          >
            Generate Code
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
          {id && (
            <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-center">
              <span className="text-xs uppercase tracking-widest text-gray-400 font-bold block mb-1">Your Access Code</span>
              <span className="text-3xl font-mono tracking-wider text-blue-700 font-bold">{id}</span>
            </div>
          )}
        </motion.div>

        {/* Give Support */}
        <motion.div 
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-green-50 rounded-lg">
              <Keyboard className="text-green-600 w-6 h-6" />
            </div>
            <h2 className="text-xl font-medium">Give Support</h2>
          </div>
          <p className="text-gray-600 mb-8 leading-relaxed">
            Enter the access code provided by the person you are helping to start the session.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Access Code</label>
              <input 
                type="text" 
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="123456789"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-mono text-lg"
                required
              />
            </div>
            <button 
              type="submit"
              className="w-full py-3 px-6 bg-gray-900 text-white rounded-xl font-medium hover:bg-black transition-colors"
            >
              Connect
            </button>
          </form>
        </motion.div>
      </div>

      <footer className="mt-20 text-center text-gray-400 text-sm">
        <p>© 2026 RemoteSupport. Securely encrypted peer-to-peer connection.</p>
      </footer>
    </div>
  );
}
