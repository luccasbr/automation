import AccountExtension from '../extension/AccountExtension';
import AccountScript from './AccountScript';

export default class DefaultAccountScript extends AccountScript {
  public async onInitialize(): Promise<void> {
    const automation = await this.getAutomation('automationId');

    automation;
  }

  public getScriptExtensions(): AccountExtension[] {
    return [];
  }
}
