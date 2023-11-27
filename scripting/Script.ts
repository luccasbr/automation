import LocalDb from '../database/localdb';
import { CachedScriptFunction } from './decorators';
import ScriptExtension from './extension/ScriptExtension';

const localdb = LocalDb.getInstance();

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export default abstract class Script<ExtensionType extends ScriptExtension<any>> {
  public readonly scriptId: string;
  public readonly execSequence: number = 0;

  private readonly internalExecSequence: number = 0;

  private scriptExtensions: ExtensionType[] = [];

  constructor(scriptId: string) {
    this.scriptId = scriptId;
    Reflect.defineMetadata('scriptId', this.scriptId, this);
    this.addScriptExtensions(...(this.getScriptExtensions() || []));
  }

  public addScriptExtension(scriptExtension: ExtensionType) {
    if (!this.scriptExtensions.includes(scriptExtension)) {
      this.scriptExtensions.push(scriptExtension);
      Reflect.set(scriptExtension, 'script', this);
    }
  }

  private addScriptExtensions(...scriptExtensions: ExtensionType[]) {
    scriptExtensions.forEach((scriptExtension) => this.addScriptExtension(scriptExtension));
  }

  public abstract getScriptExtensions(): ExtensionType[];

  protected async runInternal<T>(func: () => Promise<T> | T) {
    Reflect.defineMetadata('internal', true, this);
    const result = await func();
    Reflect.defineMetadata('internal', false, this);
    return result;
  }

  public info(text: string, data?: any) {
    this.log('info', text, data);
  }

  public warn(text: string, data?: any) {
    this.log('warn', text, data);
  }

  public error(text: string, data?: any) {
    this.log('error', text, data);
  }

  public debug(text: string, data?: any) {
    if (Reflect.getMetadata('runningInTestMode', this)) {
      this.log('debug', text, data);
    }
  }

  @CachedScriptFunction()
  public log(level: LogLevel, text: string, data?: any) {
    console['logEmptyLine']();
    console.log(`[${level.toUpperCase()}] ${text}`, data ? JSON.stringify(data) : '');
    localdb.createScriptLog({
      scriptId: Reflect.getMetadata('scriptId', this),
      automationId: process.env.AUTOMATION_ID,
      level,
      text: text,
      data: data ? JSON.stringify({ content: data }) : undefined,
    });
  }
}
