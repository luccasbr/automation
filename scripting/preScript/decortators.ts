type PreFunnelOptions = {
  automationId: string;
};

export function PreFunnelScript(metadata: PreFunnelOptions) {
  return function (target: Function) {
    Reflect.defineMetadata('metadata', metadata, target.prototype);
  };
}
