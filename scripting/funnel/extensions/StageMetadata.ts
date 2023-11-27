import { prisma } from '../../../database/prisma';
import FunnelExtension from '../../extension/FunnelExtension';
import { CachedScriptFunction } from '../../decorators';
import { Extension } from '../../extension/decorators';

@Extension()
export default class StageMetadata extends FunnelExtension {
  private metadata: Record<string, any>;

  constructor(metadata?: Record<string, any>) {
    super();
    this.metadata = metadata || {};
  }

  @CachedScriptFunction()
  public get(key: string): any {
    return this.metadata[key];
  }

  @CachedScriptFunction()
  public async set(key: string, value: any) {
    await prisma.stageMetadata.upsert({
      where: { funnelId_stageName: { funnelId: this.script.scriptId, stageName: this.script.stageName } },
      update: { metadata: { [key]: value } },
      create: { funnelId: this.script.scriptId, stageName: this.script.stageName, metadata: { [key]: value } },
    });

    this.metadata[key] = value;
  }

  @CachedScriptFunction()
  public async clear() {
    await prisma.stageMetadata.delete({
      where: { funnelId_stageName: { funnelId: this.script.scriptId, stageName: this.script.stageName } },
    });

    this.metadata = {};
  }

  @CachedScriptFunction()
  public async delete(key: string) {
    if (this.metadata[key]) {
      delete this.metadata[key];

      await prisma.stageMetadata.update({
        where: { funnelId_stageName: { funnelId: this.script.scriptId, stageName: this.script.stageName } },
        data: { metadata: this.metadata },
      });
    }
  }
}
