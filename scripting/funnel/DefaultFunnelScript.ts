import { InputMessage } from '../../whatsapp/types/inputMessage';
import ScriptExtension from '../extension/ScriptExtension';
import FunnelScript from './FunnelScript';
import { Funnel, Stage } from './decorators';
import { NextStage, ScriptParam } from './types';

@Funnel({ id: '_default', name: 'Padrão', version: 1 })
export default class DefaultFunnel extends FunnelScript {
  public async onStart(messages: InputMessage[]): Promise<NextStage | void> {
    this.info('Iniciando funil');
    return this.switchStage('Hello World');
  }

  @Stage({ name: 'Hello World' })
  public async helloWorld(): Promise<NextStage | void> {
    const name = this.getParam('name');

    this.info(`Hello World ${name}`);

    return this.end('COMPLETED');
  }

  public async onEnd() {
    this.info('Finalizando funil');
  }

  public onWebhookEvent(event: any): void {
    this.info('Evento de Webhook recebido', event);
  }

  public getParamSchema(): ScriptParam[] {
    return [{ type: 'TEXT', key: 'name', name: 'Nome do usário inicializador do funil', required: true }];
  }

  public getScriptExtensions(): ScriptExtension<FunnelScript>[] {
    return [];
  }
}
