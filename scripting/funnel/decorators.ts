import { CatchScriptError } from '../decorators';

type FunnelOptions = {
  name: string;
  id: string;
  version: number;
};

export function Funnel(metadata: FunnelOptions) {
  return function (target: Function) {
    Reflect.defineMetadata('metadata', metadata, target.prototype);
  };
}

type StageOptions = {
  name: string;
};

export function Stage(metadata: StageOptions) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const stageKeys = (Reflect.getMetadataKeys(target) || []).filter((key) => key.startsWith('stage:'));

    if (stageKeys.includes(`stage:${metadata.name}`)) {
      throw new Error(`Etapa '${metadata.name}' já existe no script '${target.name}'`);
    }

    Reflect.defineMetadata(`stage:${metadata.name}`, { ...metadata, funcName: propertyKey }, target);

    return CatchScriptError(target, propertyKey, descriptor);
  };
}
