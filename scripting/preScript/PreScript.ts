import { prisma } from '../../database/prisma';
import { StartupScript, Initiator } from './types';
import Script from '../Script';
import { ScriptFunction } from '../decorators';
import { InputMessage } from '../../whatsapp/types/inputMessage';
import PreScriptExtension from '../extension/PreScriptExtension';

export type PreScriptConstructorArgs = {
  id: string;
  initiator: Initiator;
  runningInTestMode: boolean;
};

export default abstract class PreScript extends Script<PreScriptExtension> {
  protected initiator: Initiator;
  private runningInTestMode: boolean;

  protected DEFAULT_SCRIPT: StartupScript;

  constructor({ id, initiator, runningInTestMode }: PreScriptConstructorArgs) {
    super(id);
    this.initiator = initiator;
    this.runningInTestMode = runningInTestMode;
    Reflect.defineMetadata('runningInTestMode', this.runningInTestMode, this);

    this.DEFAULT_SCRIPT = {
      scriptName: '_default',
      params: [
        {
          key: 'name',
          value: this.initiator.name,
        },
      ],
    };
  }

  public abstract onLeadMessage(messages: InputMessage[]): Promise<StartupScript>;
  public abstract onTesterMessage(messages: InputMessage[]): Promise<StartupScript>;

  async runScriptById(scriptId: string, version?: number): Promise<StartupScript> {
    return { scriptId, version };
  }

  async runScriptByName(scriptName: string, version?: number): Promise<StartupScript> {
    return { scriptName, version };
  }

  @ScriptFunction()
  protected async isFirstInteraction(): Promise<boolean> {
    return (await prisma.lead.count({ where: { phone: this.initiator.phone } })) === 0;
  }

  // Previne que o dev chamem a função runInternal diretamente
  protected runInternal<T>(func: () => T | Promise<T>): Promise<T> {
    throw new Error('Função runInternal não pode ser chamada de um script.');
  }
}
