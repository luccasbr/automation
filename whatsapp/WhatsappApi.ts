import WhatsappSocket from './WhatsappSocket';
import { PresenceType, PresenceUpdate } from './types';
import { parsePhoneNumber } from './utils';
import { WAMessage } from '@whiskeysockets/baileys';
import config from '../../config';
import { InputMessage } from './types/inputMessage';

type ChatCache = {
  pushName?: string;
  lastPresenceUpdate?: {
    timestamp: number;
    type: PresenceType;
  };
  pendingMessages: InputMessage[];
  presenceTimer?: NodeJS.Timeout;
  processed: boolean;
};

type ChatUpdate = {
  phone: string;
  pushName?: string;
  newMessages: InputMessage[];
};

export class WhatsappApi {
  private socket: WhatsappSocket;
  private userMessageListener: Map<string, (pendingMessage: InputMessage[]) => void> = new Map();
  private chatUpdateListener: (chatUpdate: ChatUpdate) => void = () => {};
  private chatCache: Map<string, ChatCache> = new Map();
  private chatUpsertListener: (lead: { phone: string; pushName?: string }) => Promise<void>;

  private static instance: WhatsappApi;

  constructor() {
    this.socket = new WhatsappSocket();
  }

  public static getInstance() {
    if (!WhatsappApi.instance) {
      WhatsappApi.instance = new WhatsappApi();
    }

    return WhatsappApi.instance;
  }

  public async connect() {
    return new Promise<void>((resolve) => {
      this.socket.createConnection(
        async (update) => {
          if (update.state === 'open') {
            this.init();
            resolve();
          } else {
            throw update.error;
          }
        },
        {
          syncFullHistory: false,
          ignoreJids: {},
        },
      );
    });
  }

  public getUserUnhandledMessages(phone: string) {
    const chat = this.chatCache.get(phone);

    if (!chat) return [];

    return chat.pendingMessages;
  }

  private async init() {
    // Registra evento para recebiemento de mensagens
    this.socket.onReceiveMessage(async (message) => {
      const parsedMessage = await this.parseMessage(message);
      this.handleNewMessage(message.pushName, parsePhoneNumber(message.key.remoteJid!, 'phone'), parsedMessage);
    });

    // Registra evento para quando o número máximo de reconexões for atingido
    this.socket.onMaxReconnectAttemptsListener(() => {
      throw new Error('Número máximo de reconexões ao socket atingido');
    });

    this.socket.presenceUpdate((update) => this.updatePresence(update));
  }

  private async handleNewMessage(pushName: string, phone: string, message: InputMessage) {
    console.log('Processando novas mensagens...');

    let chat = this.chatCache.get(phone);

    if (!chat) {
      console.log(`Usuário ${phone} não encontrado no cache. Criando novo registro...`);
      chat = {
        pushName,
        pendingMessages: [],
        lastPresenceUpdate: {
          timestamp: Date.now(),
          type: PresenceType.available,
        },
        presenceTimer: setTimeout(() => this.processChatPendingMessages(phone), 1000 * config.minMessageReplyTimerSec),
        processed: false,
      };
      this.chatCache.set(phone, chat);
      this.subscribeToPresence(phone);
      if (this.chatUpsertListener) {
        await this.chatUpsertListener({ phone, pushName });
      }
    }

    /* Quando o usuário está digitando, a última atualização de presença é do tipo 'composing'.
       Isso força a atualização para available sempre que uma mensagem é recebida, ajustando o timer. */
    if (chat.lastPresenceUpdate.type !== PresenceType.available) {
      this.updatePresence({ phone, type: PresenceType.available });
    }

    if (chat.lastPresenceUpdate.timestamp < Date.now() - 1000 * config.presenceRefreshIntervalSec) {
      console.log(
        `A ultima atualização de presença do usuário ${phone} não condiz com a data da mensagem recebida. Atualizando presença...`,
      );
      this.subscribeToPresence(phone);
    }

    chat.pendingMessages.push(message);
  }

  private updatePresence(update: PresenceUpdate) {
    const chat = this.chatCache.get(update.phone);

    if (!chat) return;

    // estava digitando/gravando e continuou digitando/gravando
    if (update.type !== PresenceType.available && chat.lastPresenceUpdate.type !== PresenceType.available) {
    }

    // reseta o timer para processar as mensagens não tratadas
    if (chat.presenceTimer) clearTimeout(chat.presenceTimer);

    // parou de digitar/gravar
    if (update.type === PresenceType.available) {
      // ativa o timer para processar as mensagens não tratadas
      chat.presenceTimer = setTimeout(
        () => this.processChatPendingMessages(update.phone),
        1000 * config.minMessageReplyTimerSec,
      );
    }

    chat.lastPresenceUpdate = { timestamp: Date.now(), type: update.type };
  }

  private async processChatPendingMessages(phone: string) {
    const chat = this.chatCache.get(phone);

    if (!chat) return;

    const pendingMessages = chat.pendingMessages;
    chat.pendingMessages = [];

    if (pendingMessages.length === 0) return;

    console.log(`Processando mensagens de ${phone}`, JSON.stringify(pendingMessages, null, 2));

    const userCallback = this.userMessageListener.get(phone);

    if (userCallback) {
      console.log(`Enviando mensagens para o callback do usuário ${phone}...`);
      userCallback(pendingMessages);
    } else if (!chat.processed) {
      console.log(
        `Nenhum callback registrado para o usuário ${phone}. Enviando para o callback de atualização de chat...`,
      );
      this.chatUpdateListener({
        phone,
        pushName: chat.pushName,
        newMessages: pendingMessages,
      });
      chat.processed = true;
    }
  }

  private async parseMessage(message: WAMessage): Promise<InputMessage> {
    // Atribui os valores comuns a todas as mensagens (id, telefone, nome, timestamp)
    let parsedMessage: Partial<InputMessage> = {
      id: message.key.id!,
      date: new Date(message.messageTimestamp as number),
      processed: false,
      quoteId: message.message.extendedTextMessage.contextInfo.stanzaId,
    };

    if (message.message) {
      if (message.message.conversation || message.message.extendedTextMessage) {
        // A mensagem é um texto

        // Define o conteúdo da mensagem como um objeto de texto
        parsedMessage = {
          ...parsedMessage,
          type: 'TEXT',
          content: (message.message.conversation || message.message.extendedTextMessage!.text)!,
        };
      } else if (message.message.audioMessage) {
        // A mensagem é um áudio

        const badMimetypeIndex = message.message.audioMessage.mimetype.indexOf(';');
        const mimetype =
          badMimetypeIndex != -1
            ? message.message.audioMessage.mimetype.substring(0, badMimetypeIndex)
            : message.message.audioMessage.mimetype;

        // Faz o download do áudio para diretório local
        const fileId = await this.socket.downloadMedia(message, config.media.audiosSubdir, mimetype);

        // Define o conteúdo da mensagem como um objeto de áudio
        parsedMessage = {
          type: message.message.audioMessage.ptt ? 'VOICE' : 'AUDIO',
          mimetype: mimetype,
          fileId,
          fileSize: (message.message.audioMessage.fileLength || 0) as number,
          duration: (message.message.audioMessage.seconds || 0) * 1000,
        };
      }
    }

    // Se a mensagem tem type foi parseada corretamente, senão é uma mensagem desconhecida
    if (parsedMessage.type) {
      return parsedMessage as InputMessage;
    } else {
      return {
        ...parsedMessage,
        type: 'UNKNOWN',
      } as InputMessage;
    }
  }

  public onChatUpdate(callback: (chatUpdate: ChatUpdate) => void) {
    this.chatUpdateListener = callback;
  }

  public addMessageListener(phoneNumber: string, callback: (messages: InputMessage[]) => void) {
    this.userMessageListener.set(phoneNumber, callback);
  }

  public removeMessageListener(phoneNumber?: string) {
    if (phoneNumber) {
      this.userMessageListener.delete(phoneNumber);
    } else {
      this.chatUpdateListener = () => {};
    }
  }

  public onChatUpsert(callback: (lead: { phone: string; pushName?: string }) => Promise<void>) {
    this.chatUpsertListener = callback;
  }

  public async forwardMessage(to: string, headline: string, message: WAMessage) {
    await this.socket.getSocket().sendMessage(to, { forward: message, text: headline });
  }

  public getSocket() {
    return this.socket;
  }

  public isConnected() {
    return this.socket.isConnected();
  }

  private subscribeToPresence(phone: string) {
    console.log(`Inscrevendo usuário ${phone} para atualizações de presença...`);
    this.socket.getSocket().presenceSubscribe(parsePhoneNumber(phone, 'jid'));
  }

  public async sendTextMessage(phone: string, text: string): Promise<InputMessage> {
    const message = await this.socket.getSocket().sendMessage(parsePhoneNumber(phone, 'jid'), { text });
    return this.parseMessage(message);
  }
}
