import { prisma } from '../database/prisma';
import Script from './Script';
import AccountScript from './accountScript/AccountScript';
import DefaultAccountScript from './accountScript/DefaultAccountScript';
import DefaultFunnel from './funnel/DefaultFunnelScript';
import FunnelScript from './funnel/FunnelScript';
import PreScript from './preScript/PreScript';
import { ScriptUtils, createClassInstanceByTsContent } from './utils';

type InstanceType = 'AccountScript' | 'FunnelScript' | 'PreScript' | 'ExtensionScript';

type InstanceId = {
  id: string;
  type: InstanceType;
};

export default class ScriptInstanceManager {
  private scriptInstances: Map<InstanceId, Script<any>> = new Map<InstanceId, Script<any>>();

  private static instance: ScriptInstanceManager;

  public static getInstance(): ScriptInstanceManager {
    if (!ScriptInstanceManager.instance) {
      ScriptInstanceManager.instance = new ScriptInstanceManager();
    }
    return ScriptInstanceManager.instance;
  }

  public addScriptInstance(instance: Script<any>, type: InstanceType) {
    this.scriptInstances.set({ id: instance.scriptId, type }, instance);
  }

  public getScriptInstance<T extends Script<any>>(id: string, type: InstanceType): T | undefined {
    return this.scriptInstances.get({ id, type }) as T | undefined;
  }

  public async getAccountInstance(id: string): Promise<AccountScript | undefined> {
    let cachedInstance = this.getScriptInstance<AccountScript>(id, 'AccountScript');

    if (!cachedInstance) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: id },
          select: { accountScript: true },
        });

        if (user) {
          if (user.accountScript) {
            cachedInstance = await createClassInstanceByTsContent(user.accountScript, id);
          } else {
            cachedInstance = new DefaultAccountScript(id);
          }
        }
      } catch (error) {
        console.error(error);
      }
    }

    return cachedInstance;
  }

  public getFunnelInstance(id: string): FunnelScript | undefined {
    return this.getScriptInstance(id, 'FunnelScript');
  }

  public addFunnelInstance(instance: FunnelScript) {
    this.addScriptInstance(instance, 'FunnelScript');
  }

  public getPreScriptInstance(id: string): PreScript | undefined {
    return this.getScriptInstance(id, 'PreScript');
  }

  public addPreScriptInstance(instance: PreScript) {
    this.addScriptInstance(instance, 'PreScript');
  }
}
