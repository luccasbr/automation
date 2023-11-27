import { InputMessage } from '../../whatsapp/types/inputMessage';
import { ScriptFunction } from '../decorators';
import ScriptExtension from '../extension/ScriptExtension';
import PreScript from './PreScript';
import { PreFunnelScript } from '../preScript/decortators';
import { StartupScript } from '../preScript/types';

@PreFunnelScript({ automationId: '_default' })
export default class DefaultPreScript extends PreScript {
  @ScriptFunction()
  public async onLeadMessage(messages: InputMessage[]): Promise<StartupScript> {
    return this.DEFAULT_SCRIPT;
  }

  @ScriptFunction()
  public async onTesterMessage(messages: InputMessage[]): Promise<StartupScript> {
    return this.DEFAULT_SCRIPT;
  }

  public getScriptExtensions(): ScriptExtension<PreScript>[] {
    return [];
  }
}
