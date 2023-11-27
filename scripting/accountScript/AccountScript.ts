import Script from '../Script';
import AccountExtension from '../extension/AccountExtension';
import AutomationManager from './extensions/AutomationManager';

export default abstract class AccountScript extends Script<AccountExtension> {
  public abstract onInitialize(): Promise<void> | void;

  protected async onLLMRequest() {}

  protected async onWebhookEvent() {}

  protected async getAutomation(id: string): Promise<AutomationManager> {
    const extensions = Reflect.get(this, 'scriptExtensions') as AccountExtension[];

    let automation = extensions.find((extension) => extension instanceof AutomationManager && extension.id === id);

    if (!automation) {
      automation = new AutomationManager(id);
      this.addScriptExtension(automation);
    }

    return automation as AutomationManager;
  }
}
