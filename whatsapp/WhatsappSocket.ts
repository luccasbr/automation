import {
  WhatsappSocketOptions,
  OnReceiveMessageCallback,
  ConnectionUpdate,
  PresenceUpdate,
  PresenceType,
} from './types';
import { parsePhoneNumber } from './utils';
import {
  makeWASocket,
  UserFacingSocketConfig,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  isJidUser,
  BaileysEventMap,
  normalizeMessageContent,
  WAMessage,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';
import config from '../../config';
import { pino } from 'pino';
import { Boom } from '@hapi/boom';
import fs from 'fs-extra';

type Options = Omit<UserFacingSocketConfig, 'auth' | 'printQRInTerminal' | 'logger'> & WhatsappSocketOptions;

const defaultOptions: Options = {
  autoReconnect: true,
  ignoreJids: {
    broadcast: true,
    groups: true,
    self: true,
  },
};

export default class WhatsappSocket {
  private socket: ReturnType<typeof makeWASocket> | undefined;
  private connected = false;
  private options: Options = defaultOptions;
  private logger = pino({ level: config.logLevel[process.env.NODE_ENV] });
  private receiveMessageCallback: OnReceiveMessageCallback | undefined;
  private maxReconnectAttemptsCallback: (() => void) | undefined;
  private reconnectAttempts = 0;

  public async createConnection(
    onConnectionUpdate?: (update: ConnectionUpdate) => Promise<void>,
    options?: Options,
  ): Promise<void> {
    this.reconnectAttempts++;

    this.options = { ...defaultOptions, ...options };

    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Usando WA v${version.join('.')}, última versao: ${isLatest ? 'sim' : 'não'}`);

    this.socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
      logger: this.logger,
      ...options,
      markOnlineOnConnect: true,
    });
    this.socket.ev.on('creds.update', saveCreds);

    this.socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'close') {
        this.connected = false;
        const shouldReconnect = (lastDisconnect!.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`Conexão fechada devido ao erro: ${lastDisconnect!.error}`);
        if (onConnectionUpdate) {
          onConnectionUpdate({
            state: 'close',
            error: lastDisconnect!.error as Boom,
          });
        }
        if (shouldReconnect && this.options.autoReconnect && this.reconnectAttempts < config.maxReconnectAttempts) {
          console.log('Reconectando...');
          this.createConnection(onConnectionUpdate, options);
        } else if (this.reconnectAttempts >= config.maxReconnectAttempts) {
          console.log('Limite de reconexões atingido');
          if (this.maxReconnectAttemptsCallback) {
            this.maxReconnectAttemptsCallback();
          }
        }
      } else if (connection === 'open') {
        this.reconnectAttempts = 0;
        console.log('Conexão com socket aberta com sucesso');
        this.connected = true;
        if (onConnectionUpdate) {
          onConnectionUpdate({ state: 'open' });
        }
      }
    });
  }

  public onMaxReconnectAttemptsListener(callback: () => void) {
    this.maxReconnectAttemptsCallback = callback;
  }

  private shouldIgnoreJid(key: any): boolean {
    return !isJidUser(key.remoteJid) || key.fromMe;
  }

  private async handleReceivedMessage(messageEvent: BaileysEventMap['messages.upsert']) {
    const { messages } = messageEvent;
    messages.forEach((message) => {
      if (message.key.remoteJid && !this.shouldIgnoreJid(message.key)) {
        message.message = normalizeMessageContent(message.message);
        this.receiveMessageCallback?.(message);
      }
    });
  }

  public getSocket() {
    return this.socket;
  }

  public async onReceiveMessage(callback: OnReceiveMessageCallback) {
    if (callback !== null) {
      if (!this.receiveMessageCallback) {
        this.receiveMessageCallback = callback;
        this.socket?.ev.on('messages.upsert', (message) => {
          this.handleReceivedMessage(message);
        });
      }
    }
  }

  public async removeOnReceiveMessageListener() {
    if (this.receiveMessageCallback) {
      this.socket?.ev.removeAllListeners('messages.upsert');
      this.receiveMessageCallback = undefined;
    }
  }

  public isConnected() {
    return this.connected;
  }

  public async downloadMedia(message: WAMessage, subdir: string, mimetype: string) {
    // TODO fazer upload do arquivo para o storage e retornar o id do arquivo

    const buffer = await downloadMediaMessage(
      message,
      'buffer',
      {},
      {
        logger: this.logger,
        reuploadRequest: this.socket!.updateMediaMessage,
      },
    );

    const ext = mimetype.split('/');

    const localPath = `${config.media.rootDir}/${subdir}/${message.key.id}.${ext[1]}`;

    await fs.outputFile(localPath, buffer as Buffer);

    return localPath;
  }

  public presenceUpdate(callback: (update: PresenceUpdate) => void) {
    this.socket.ev.on('presence.update', (update) => {
      const jid = update && update.presences ? Object.keys(update.presences)[0] : null;
      const presence = jid ? update.presences[jid].lastKnownPresence : null;

      if (
        jid &&
        (presence === PresenceType.available ||
          presence === PresenceType.composing ||
          presence === PresenceType.recording)
      ) {
        callback({
          phone: parsePhoneNumber(jid, 'phone'),
          type: PresenceType[presence],
        });
      }
    });
  }
}
