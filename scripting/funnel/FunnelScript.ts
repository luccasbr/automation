import { Lead, Funnel as PrismaFunnel, Message as PrismaMessage, FunnelTag, MessageAgent } from '@prisma/client';
import { WhatsappApi } from '../../whatsapp/WhatsappApi';
import { prisma } from '../../database/prisma';
import { CachedScriptFunction, CachedScriptProperty } from '../decorators';
import Script from '../Script';
import { MsgUtils } from '../../whatsapp/utils';
import StageMetadata from './extensions/StageMetadata';
import { NextStage, ScriptArg, ScriptEndStatus, ScriptParam, ScriptParamType } from './types';
import { nanoid } from 'nanoid';
import { FunnelScriptUtils } from './utils';
import CryptoJS from 'crypto-js';
import LocalDb from '../../database/localdb';
import Timer from '../../database/models/Timer';
import config from '../../../config';
import { TEXT } from '../macros/message';
import { OutputMessage, RetryOutputMessage } from '../../whatsapp/types/outputMessage';
import { InputMessage } from '../../whatsapp/types/inputMessage';
import FunnelExtension from '../extension/FunnelExtension';

type Funnel = PrismaFunnel & { tags: Omit<FunnelTag, 'funnelId'>[]; lead: Omit<Lead, 'userId' | 'updatedAt'> };

export default abstract class FunnelScript extends Script<FunnelExtension> {
  private funnel: Funnel;
  private api: WhatsappApi;
  protected stageMetadata: StageMetadata;
  private stageChangeAuth: string;
  private safevars: { name: string; value: string }[];
  private replyCallback: (messages: InputMessage[]) => void;
  private pendingMessages: InputMessage[];

  public readonly END_STAGE = '_end';
  public readonly START_STAGE = '_start';

  constructor(scriptId: string) {
    super(scriptId);
    this.api = WhatsappApi.getInstance();
  }

  public async initialize({ funnel, newMessages }: { funnel: Funnel; newMessages: PrismaMessage[] }) {
    this.funnel = funnel;

    Reflect.defineMetadata('runningInTestMode', this.funnel.test, this);

    const paramVars = (this.funnel.scriptArgs as ScriptArg[]).filter((p: any) => p.type === 'VAR');

    // Carrega as variáveis de ambiente
    this.safevars = await prisma.safevar.findMany({
      where: {
        userId: process.env.USER_ID,
        value: { in: paramVars.map((p: any) => p.value) },
      },
      select: { name: true, value: true },
    });

    console.log(
      ` - Registrando listener para mensagens do cliente ${this.funnel.lead.phone}${
        this.funnel.lead.name ? ` - ${this.funnel.lead.name}` : ''
      }`,
    );

    console.log(`${this.funnel.status === 'CREATED' ? 'Executando' : 'Restaurando'} etapa ${this.funnel.currentStage}`);

    const currentStageMetadata = await prisma.stageMetadata.findUnique({
      where: {
        funnelId_stageName: { funnelId: this.funnel.id, stageName: this.funnel.currentStage },
      },
      select: { metadata: true },
    });

    // Extensão de script para gerenciar os metadados da etapa
    this.stageMetadata = new StageMetadata(currentStageMetadata?.metadata as any);
    this.addScriptExtension(this.stageMetadata);

    this.api.addMessageListener(this.funnel.lead.phone, async (messages) => {
      FunnelScriptUtils.saveNewMessages(this.funnel, { id: this.funnel.lead.phone, type: 'LEAD' }, messages);

      if (this.isAwaiting) {
        if (this.replyCallback) {
          this.replyCallback(messages);
        } else {
          // TODO: verificar se isso é válido
          this.error(`Callback de resposta não encontrada para continução do fluxo do funil. Contatar o suporte.`);
        }
      } else if (this.isRunning) {
        // Lead mandou mensagem enquanto o funil estava processando as mensagens anteriores
        // TODO: Rollback das ações de banco desde a última resposta do sendQuestion, adicionar essas mensagens ao cached result da última sendQuestion
      }
    });

    const pendingMessages = MsgUtils.parseDatabaseMessages(newMessages);

    // Pode ser que no meio tempo entre criar e inicializar o funil o cliente tenha mandado mais mensagens, busca essas mensagens não tratadas
    const apiNewMessages = this.api.getUserUnhandledMessages(funnel.lead.phone);
    pendingMessages.push(...apiNewMessages);

    if (apiNewMessages?.length > 0) {
      await FunnelScriptUtils.saveNewMessages(
        this.funnel,
        { id: this.funnel.lead.phone, type: 'LEAD' },
        apiNewMessages,
      );
      pendingMessages.sort((a, b) => a.date.getTime() - b.date.getTime());
    }

    if (this.isAwaiting && pendingMessages.length > 0) {
      /* Funil estava aguardando resposta e o cliente mandou mensagens enquanto o funil não estava executando 
         Adiciona as mensagens em uma lista de pendentes para serem devolvidas quando o sendQuestion for chamado novamente na sequencia */
      this.pendingMessages = pendingMessages;
    }

    let nextStage: (NextStage & { status?: ScriptEndStatus }) | void;

    do {
      // A cada etapa, redefine as sequências de execução
      Reflect.set(this, 'execSequence', 0);
      Reflect.set(this, 'internalExecSequence', 0);

      if (this.funnel.status === 'CREATED') {
        // Funil novo, chama onStart
        await prisma.funnel.update({
          where: { id: this.funnel.id },
          data: { status: 'EXECUTING' },
        });

        // Marca as mensagens como não pendentes
        /*await prisma.message.updateMany({
          where: {
            funnelId: this.funnel.id,
            id: { in: this.funnel.pendingMessages.map((msg) => MsgUtils.getId(msg)) },
          },
          data: { pending: false },
        });*/

        nextStage = await this.onStart(pendingMessages.filter((msg) => MsgUtils.isSupported(msg)));
      }

      // Restaura o funil
      if (!nextStage) {
        this.stageChangeAuth = nanoid(11);

        nextStage = {
          stageName: this.funnel.currentStage,
          authorization: this.stageChangeAuth,
        };
      }

      if (nextStage.authorization !== this.stageChangeAuth) {
        throw new Error(
          `Autorização de troca de etapa inválida. Use as funções loopStage(), switchStage() ou end() para voltar na etapa atual, trocar para outra etapa ou finalizar o funil, respectivamente.`,
        );
      }

      const { funcName } = Reflect.getMetadata(`stage:${this.funnel.currentStage}`, this) || {};

      if (!funcName) {
        throw new Error(`Etapa '${nextStage.stageName}' não possui função de execução associada. Contatar o suporte.`);
      }

      const lastStageName = nextStage.stageName;

      nextStage = await (nextStage.stageName === this.END_STAGE
        ? this[funcName](this.funnel.status)
        : this[funcName]());

      if (nextStage) {
        const loopBack = nextStage.stageName === lastStageName;

        console.log(`${loopBack ? 'Voltando na' : 'Trocando para a'} etapa ${nextStage.stageName}`);

        if (!this.stageExists(nextStage.stageName)) {
          throw new Error(
            `Etapa do funil '${nextStage.stageName}' não encontrada no script de execução. Verificar script do funil.`,
          );
        }

        let currentMetadata: any;

        if (nextStage.metadata) {
          // Se houver metadados passados, busca possíveis metadados já existentes na etapa
          if (!loopBack) {
            const currentStageMetadata = await prisma.stageMetadata.findUnique({
              where: {
                funnelId_stageName: { funnelId: this.funnel.id, stageName: nextStage.stageName },
              },
              select: { metadata: true },
            });
            currentMetadata = currentStageMetadata?.metadata;
          } else {
            // Se for um loop, define os metadados atuais
            currentMetadata = Reflect.get(this.stageMetadata, 'metadata');
          }
        }

        if (currentMetadata) {
          // Se já existir metadados na etapa, atualiza com os novos metadados
          await prisma.stageMetadata.update({
            where: { funnelId_stageName: { funnelId: this.funnel.id, stageName: nextStage.stageName } },
            data: { metadata: { ...currentMetadata, ...nextStage.metadata } },
          });
        }

        const data = {
          currentStage: nextStage.stageName,
          stagesMetadata: !currentMetadata
            ? {
                create: {
                  stageName: nextStage.stageName,
                  metadata: nextStage.metadata,
                },
              }
            : undefined,
          leadPath: {
            create: {
              stageName: nextStage.stageName,
            },
          },
        };

        if (nextStage.stageName === this.END_STAGE) {
          data['status'] = nextStage.status;
          this.funnel.status = nextStage.status;
        }

        await prisma.funnel.update({
          where: { id: this.funnel.id },
          data,
        });

        Reflect.set(this.stageMetadata, 'metadata', nextStage.metadata || {});
        this.funnel.currentStage = nextStage.stageName;
      } else if (lastStageName !== this.END_STAGE) {
        this.warn(`Funil cancelado: etapa '${lastStageName}' não encontrou uma saída para a próxima etapa.`);
        await prisma.funnel.update({
          where: { id: this.funnel.id },
          data: { status: 'CANCELED' },
        });
      }
    } while (nextStage);

    this.api.removeMessageListener(this.funnel.lead.phone);
    this.clearScriptCachedVars();
    this.clearScriptTimers();
  }

  protected getTextParam(key: string) {
    return this.getParam<'TEXT'>(key);
  }

  protected getTextListParam(key: string) {
    return this.getParam<'TEXT_LIST'>(key);
  }

  protected getNumberParam(key: string) {
    return this.getParam<'NUMBER'>(key);
  }

  protected getLogicParam(key: string) {
    return this.getParam<'LOGIC'>(key);
  }

  protected getWebhookParam(key: string) {
    return this.getParam<'WEBHOOK'>(key);
  }

  protected getStringVar(key: string) {
    return this.getVar<string>(key);
  }

  protected getNumberVar(key: string) {
    return this.getVar<number>(key);
  }

  protected getBooleanVar(key: string) {
    return this.getVar<boolean>(key);
  }

  protected getVar<T extends string | number | boolean>(key: string): T | undefined {
    const safevar = this.safevars.find((v) => v.name === key);

    if (safevar) {
      try {
        const bytes = CryptoJS.AES.decrypt(safevar.value, process.env.SAFEVAR_SECRET);
        return bytes.toString(CryptoJS.enc.Utf8) as T;
      } catch (error) {
        throw new Error(`Erro ao descriptografar variável de ambiente '${key}'. Contatar o suporte.`);
      }
    }
  }

  protected getParam<T extends ScriptParamType>(key: string) {
    const param = this.funnel.scriptArgs['args'].find((p: any) => p.key === key && p.type !== 'VAR');
    return param
      ? (param.value as T extends 'TEXT' | 'WEBHOOK'
          ? string
          : T extends 'TEXT_LIST'
          ? string[]
          : T extends 'NUMBER'
          ? number
          : boolean)
      : undefined;
  }

  @CachedScriptProperty
  protected get status() {
    return this.funnel.status;
  }

  @CachedScriptProperty
  protected get isAwaiting() {
    return this.status === 'AWAITING';
  }

  @CachedScriptProperty
  protected get isRunning() {
    return this.status === 'EXECUTING';
  }

  @CachedScriptProperty
  protected get isCanceled() {
    return this.status === 'CANCELED';
  }

  @CachedScriptProperty
  protected get isCompleted() {
    return this.status === 'COMPLETED';
  }

  private get isInternalExecution() {
    return Reflect.getMetadata('internal', this) || false;
  }

  /**
   * Retorna true se o funil estiver em um estado finalizado (encerrado ou concluído)
   * @returns {boolean} `true` se o funil estiver em um estado finalizado (encerrado ou concluído), `false` caso contrário.
   */
  @CachedScriptProperty
  protected get isDone(): boolean {
    return this.isCanceled || this.isCompleted;
  }

  @CachedScriptProperty
  public get stageName(): string {
    return this.funnel.currentStage;
  }

  @CachedScriptFunction()
  public async getStageMetadata(stageName: string, key?: string) {
    const metadata = await prisma.stageMetadata.findFirst({
      where: {
        funnelId: this.funnel.id,
        stageName,
      },
      select: { metadata: true },
    });

    return metadata ? (key ? metadata?.metadata[key] : metadata?.metadata) : {};
  }

  @CachedScriptFunction()
  public async addTag(tag: string) {
    const newTag = await prisma.funnelTag.create({
      data: {
        funnelId: this.funnel.id,
        name: tag,
      },
    });

    this.funnel.tags.push(newTag);
  }

  @CachedScriptFunction()
  public hasTag(tag: string): boolean {
    return this.funnel.tags.some((t) => t.name === tag);
  }

  @CachedScriptFunction()
  public countTags(tag: string): number {
    return this.funnel.tags.filter((t) => t.name === tag).length;
  }

  @CachedScriptFunction()
  public async removeTags(tag: string, count?: number) {
    if (count !== 0) {
      const tags = this.funnel.tags.filter((t) => t.name === tag);

      const tagsToRemove = count ? tags.slice(0, count) : tags;

      await prisma.funnelTag.deleteMany({
        where: {
          funnelId: this.funnel.id,
          id: count ? { in: tagsToRemove.map((t) => t.id) } : undefined,
          name: count ? undefined : tag,
        },
      });

      this.funnel.tags = this.funnel.tags.filter((t) => !tagsToRemove.includes(t));
    }
  }

  @CachedScriptFunction()
  public async clearTags() {
    await prisma.funnelTag.deleteMany({
      where: {
        funnelId: this.funnel.id,
      },
    });

    this.funnel.tags = [];
  }

  private stageExists(stageName: string) {
    return Reflect.hasMetadata(`stage:${stageName}`, this);
  }

  @CachedScriptFunction()
  public async switchStage(stageName: string, metadata?: any): Promise<NextStage | void> {
    this.stageChangeAuth = nanoid(11);
    return { stageName, metadata, authorization: this.stageChangeAuth };
  }

  public async loopStage(metadata?: any): Promise<NextStage | void> {
    return this.switchStage(this.funnel.currentStage, metadata);
  }

  @CachedScriptFunction()
  public async end(status: ScriptEndStatus, metadata?: any): Promise<(NextStage & { status: ScriptEndStatus }) | void> {
    this.stageChangeAuth = nanoid(11);
    return { stageName: this.END_STAGE, metadata, status, authorization: this.stageChangeAuth };
  }

  public async restart(metadata?: any): Promise<NextStage | void> {
    return this.switchStage(this.START_STAGE, metadata);
  }

  public abstract onStart(messages: Readonly<InputMessage>[]): Promise<NextStage | void>;
  public abstract onEnd(endStatus: ScriptEndStatus): Promise<void> | void;
  public abstract onWebhookEvent(event: any): Promise<void> | void;
  public abstract getParamSchema(): ScriptParam[];

  // Previne que o dev chamem a função runInternal diretamente de um script
  protected runInternal<T>(func: () => T | Promise<T>): Promise<T> {
    throw new Error('Função runInternal não pode ser chamada de um script.');
  }

  private setCachedVar<T>({ name, value }: { name: string; value: T }): T {
    return LocalDb.getInstance().setCachedVar({
      name,
      scriptId: this.scriptId,
      execSequence: this.isInternalExecution ? Reflect.get(this, 'internalExecSequence') : this.execSequence,
      internal: this.isInternalExecution,
      value,
    });
  }

  private getCachedVar<T>({ name, defaultValue }: { name: string; defaultValue: T }): T {
    return LocalDb.getInstance().getCachedVar<T>({
      name,
      scriptId: this.scriptId,
      execSequence: this.isInternalExecution ? Reflect.get(this, 'internalExecSequence') : this.execSequence,
      internal: this.isInternalExecution,
      defaultValue,
    });
  }

  private clearScriptCachedVars() {
    LocalDb.getInstance().clearScriptCachedVars({ scriptId: this.scriptId });
  }

  private clearScriptTimers() {
    LocalDb.getInstance().clearScriptTimers({ scriptId: this.scriptId });
  }

  @CachedScriptFunction()
  public async await(timeMs: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = LocalDb.getInstance().getTimer({
        name: 'await',
        scriptId: this.scriptId,
        execSequence: this.isInternalExecution ? Reflect.get(this, 'internalExecSequence') : this.execSequence,
        internal: this.isInternalExecution,
        timeMs,
      });

      timer.start(resolve);
    });
  }

  private timeout(name: string, timeMs: number, callback: () => void, autoStart = true): Timer {
    const timer = LocalDb.getInstance().getTimer({
      name,
      scriptId: this.scriptId,
      execSequence: this.isInternalExecution ? Reflect.get(this, 'internalExecSequence') : this.execSequence,
      internal: this.isInternalExecution,
      timeMs,
    });

    if ((!timeMs || timeMs <= 0) && !timer.cached) {
      this.warn(`Tempo de timeout inválido. Usando timeout padrão de ${config.defaultTimeoutSec / 60} minutos.`);
    }

    if (autoStart) {
      timer.start(callback);
    }

    return timer;
  }

  @CachedScriptFunction()
  public async sendText(content: string) {
    await this.dispatchMessage(TEXT(content));
  }

  @CachedScriptFunction()
  public async sendMessage(content: OutputMessage) {
    await this.dispatchMessage(content);
  }

  private async dispatchMessage(content: OutputMessage, agentType?: Exclude<MessageAgent, 'LEAD'>) {
    agentType = agentType || 'AUTOMATION';

    let message: InputMessage = null;

    switch (content.type) {
      case 'TEXT':
        message = await this.api.sendTextMessage(this.funnel.lead.phone, content.content);
        break;
      default:
        throw new Error(`Tipo de mensagem '${content.type}' não suportado. Contatar o suporte.`);
    }

    if (message) {
      await FunnelScriptUtils.saveNewMessages(this.funnel, { id: this.funnel.lead.phone, type: agentType }, [message]);
    }
  }

  @CachedScriptFunction({
    async transformResult(_, result: any, operation: 'get' | 'set') {
      if (operation === 'set') {
        return result.status === 'SUCCESS'
          ? { status: result.status, retryMessage: result.retryMessage, messages: result.messages.map((m) => m.id) }
          : result;
      } else {
        return result.status === 'SUCCESS'
          ? {
              status: result.status,
              retryMessage: result.retryMessage,
              messages: await FunnelScriptUtils.getMessagesFromIds(result.messages),
            }
          : result;
      }
    },
  })
  public async sendQuestion(
    message: OutputMessage,
    options: {
      timeoutIn: number;
      retryCount?: number;
      onRetry?: (retry: number, lastRetryMessage: RetryOutputMessage) => RetryOutputMessage;
    },
  ): Promise<QuestionResponse> {
    options.retryCount = options.onRetry ? options.retryCount || 1 : 0;

    let lastRetryMessage = this.getCachedVar<RetryOutputMessage>({
      name: 'sendQuestionLastRetryMessage',
      defaultValue: message,
    });

    if (!this.isAwaiting) {
      await prisma.funnel.update({
        where: { id: this.funnel.id },
        data: { status: 'AWAITING' },
      });
      this.funnel.status = 'AWAITING';
    } else {
      // Funil já estava aguardando, se houver mensagens pendentes, deve devolve-las como resposta
      return {
        status: 'SUCCESS',
        messages: this.pendingMessages,
        retryMessage: lastRetryMessage,
      };
    }

    let result: QuestionResponse;

    const currentRetry = this.getCachedVar({ name: 'sendQuestionCurrentRetry', defaultValue: 0 });

    for (let i = currentRetry; i < options.retryCount + 1; i++) {
      result = await new Promise<QuestionResponse>(async (resolve) => {
        const retryMessage: RetryOutputMessage = i == 0 ? message : options.onRetry(i, lastRetryMessage);

        if (!retryMessage) {
          this.warn(
            `Reenvio de mensagem após tempo excedido configurado não retornou um modelo de mensagem válida. Verificar script do funil.`,
          );
          return resolve({ status: 'TIMEOUT', retryMessage: i > 0 ? lastRetryMessage : undefined });
        }

        // enviar mensagem via api
        super.runInternal(() => {});

        this.replyCallback = (messages) => {
          if (timer) {
            timer.cancel();
          }
          this.replyCallback = null;
          resolve({
            status: 'SUCCESS',
            messages: messages,
          });
        };

        lastRetryMessage = this.setCachedVar({ name: 'sendQuestionLastRetryMessage', value: retryMessage });

        if (i > 0) {
          this.setCachedVar({ name: 'sendQuestionCurrentRetry', value: i });
        }

        const timer = this.timeout(
          `sendQuestionTimeout_retry_${i}`,
          retryMessage.timeoutIn || options.timeoutIn,
          () => {
            this.replyCallback = null;
            resolve({ status: 'TIMEOUT', retryMessage: i > 0 ? lastRetryMessage : undefined });
          },
        );
      });

      if (result.status === 'SUCCESS') {
        break;
      }
    }

    return result;
  }

  private async _sendAudio(assetName: string, isNote: boolean) {}

  public async sendAudio(assetName: string) {
    await this._sendAudio(assetName, false);
  }

  public async sendVoice(assetName: string) {
    await this._sendAudio(assetName, true);
  }

  public async sendDocument(assetName: string, caption?: string) {}

  public async sendImage(assetName: string, caption?: string) {}

  public async sendVideo(assetName: string, caption?: string) {}
}

type QuestionResponse =
  | {
      status: 'SUCCESS';
      messages: Readonly<InputMessage>[];
      retryMessage?: RetryOutputMessage;
    }
  | {
      status: 'TIMEOUT';
      retryMessage?: RetryOutputMessage;
    }
  | {
      status: 'CANCELED';
    };
