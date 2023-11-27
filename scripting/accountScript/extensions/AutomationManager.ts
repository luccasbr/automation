import AccountExtension, { ExtensionDependency } from '../../extension/AccountExtension';
import { Extension } from '../../extension/decorators';

@Extension()
export default class AutomationManager extends AccountExtension {
  public getDependencies(): ExtensionDependency[] {
    throw new Error('Method not implemented.');
  }
  public readonly id: string;

  constructor(id: string) {
    super();
    this.id = id;
  }

  public async enable() {}

  public async disable() {}
}
