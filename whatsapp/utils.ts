import * as crypto from 'crypto';
import { MessageType, Message } from '@prisma/client';
import { InputMessage } from './types/inputMessage';

export function parsePhoneNumber(phoneNumber: string, format: 'jid' | 'phone') {
  if (format === 'jid') {
    return `${phoneNumber}@s.whatsapp.net`;
  } else if (format === 'phone') {
    return phoneNumber.split('@')[0];
  }

  return phoneNumber;
}

export function calculateHash(content: any) {
  const hash = crypto.createHash('sha256');
  hash.update(content);
  return hash.digest('hex');
}

export abstract class MsgUtils {
  public static isSupported(message: InputMessage): boolean {
    return !this.isUnsupported(message);
  }

  public static isUnsupported(message: InputMessage): boolean {
    return message.type === 'UNKNOWN';
  }

  public static getContentType(message: InputMessage): MessageType {
    return this.isSupported(message) ? (message.type as MessageType) : 'UNKNOWN';
  }

  public static parseDatabaseMessage(message: Message): InputMessage {
    const content = message.content as any;

    return {
      id: message.id,
      funnelId: message.funnelId,
      date: message.date,
      type: message.type as any, // TODO: Ajustar para bater com o type do banco
      processed: message.processed,
      ...content,
    };
  }

  public static parseDatabaseMessages(messages: Message[]): InputMessage[] {
    return messages.map(this.parseDatabaseMessage);
  }
}
