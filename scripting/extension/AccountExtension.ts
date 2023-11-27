import AccountScript from '../accountScript/AccountScript';
import ScriptExtension from './ScriptExtension';

class AccountDatabase {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  public get automation() {
    return {
      update: async (id: string, data: any) => {},
    };
  }
}

// TODO: auto-generate this type
export type ExtensionDependency = never;

export default abstract class AccountExtension extends ScriptExtension<AccountScript, ExtensionDependency> {
  protected readonly db: AccountDatabase;

  constructor() {
    super();
    this.db = new AccountDatabase(this.script.scriptId);
  }
}
