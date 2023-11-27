import { WAMessage } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';

export type ConnectionUpdate =
  | {
      state: 'open';
    }
  | {
      state: 'close';
      error: Boom;
    };

export type WhatsappSocketOptions = {
  autoReconnect?: boolean;
  ignoreJids?: {
    groups?: boolean;
    broadcast?: boolean;
    self?: boolean;
  };
  allowMessageTypes?: {
    text?: boolean;
    notes?: boolean;
  };
};

export type OnReceiveMessageCallback = (message: WAMessage) => void;

export enum PresenceType {
  available = 'available',
  composing = 'composing',
  recording = 'recording',
}

export type PresenceUpdate = {
  phone: string;
  type: PresenceType;
};
