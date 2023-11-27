export function Extension() {
  return function (target: Function) {
    Reflect.defineMetadata('isScriptExtension', true, target.prototype);
  };
}
