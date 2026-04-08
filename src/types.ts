export interface ChatMessage {
  senderId: string;
  senderName: string;
  message: string;
  timestamp: number;
}

export interface RemoteControlEvent {
  type: 'mousemove' | 'mousedown' | 'mouseup' | 'keydown';
  data: any;
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';
