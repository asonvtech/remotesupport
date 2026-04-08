export type RemoteControlMessage = {
  type: string;
  data?: any;
};

export function parseRemoteControlMessage(raw: string | object): RemoteControlMessage {
  let parsed: any = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error('Invalid JSON');
    }
  }

  if (!parsed || typeof parsed.type !== 'string') {
    throw new Error('Invalid remote-control message shape');
  }

  return { type: parsed.type, data: parsed.data };
}
