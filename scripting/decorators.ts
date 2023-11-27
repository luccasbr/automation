import { calculateHash } from '../whatsapp/utils';
import SerAny from 'serialize-anything';
import LocalDb from '../database/localdb';
import ScriptExtension from './extension/ScriptExtension';

const localdb = LocalDb.getInstance();

export function CatchScriptError(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  return wrapScriptFunction(target, descriptor, ({ scriptInstance, args, execute }) => {
    let result: any;
    let endMs: number;
    let startMs = Date.now();

    try {
      result = execute.apply(scriptInstance, args);
      endMs = Date.now();
    } catch (error) {
      endMs = Date.now();
      // Registra o erro
      localdb.createScriptExecution({
        scriptId: scriptInstance.scriptId,
        automationId: process.env.AUTOMATION_ID,
        execSequence: scriptInstance.execSequence,
        stageName: scriptInstance.stageName,
        args: JSON.stringify(args),
        error: error.message,
        execTime: endMs - startMs,
        funcName: propertyKey,
      });
      throw error;
    }

    return result;
  });
}

export function ScriptFunction() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    return CatchScriptError(target, propertyKey, descriptor);
  };
}

export function CachedScriptProperty(target: any, propertyKey: string) {
  wrapScriptProperty(target, propertyKey, {
    get({ scriptInstance, execute }) {
      const execHash = localdb.findScriptExecution({
        scriptId: scriptInstance.scriptId,
        automationId: process.env.AUTOMATION_ID,
        execSequence: scriptInstance.isInternalExecution
          ? scriptInstance.internalExecSequence
          : scriptInstance.execSequence,
        internal: scriptInstance.isInternalExecution,
      });

      if (execHash) {
        const chachedResult = execHash.cachedResult ? SerAny.deserialize(JSON.parse(execHash.cachedResult)) : undefined;

        if (chachedResult) {
          throw new Error(`Erro ao obter propriedade em cache ${propertyKey}: resultado em cache não encontrado.`);
        }

        return chachedResult;
      }

      let result: any;

      try {
        result = execute.call(scriptInstance);
      } catch (error) {
        localdb.createScriptExecution({
          scriptId: scriptInstance.scriptId,
          automationId: process.env.AUTOMATION_ID,
          execSequence: scriptInstance.isInternalExecution
            ? scriptInstance.internalExecSequence
            : scriptInstance.execSequence,
          args: JSON.stringify(['get']),
          execTime: 0,
          stageName: scriptInstance.stageName,
          funcName: `get_${propertyKey}`,
          error: error.message,
          internal: scriptInstance.isInternalExecution,
        });
        throw error;
      }

      const prevSequence = scriptInstance.isInternalExecution
        ? scriptInstance.internalExecSequence
        : scriptInstance.execSequence;
      if (scriptInstance.isInternalExecution) scriptInstance.internalExecSequence++;
      else scriptInstance.execSequence++;

      try {
        localdb.createScriptExecution({
          scriptId: scriptInstance.scriptId,
          automationId: process.env.AUTOMATION_ID,
          execSequence: prevSequence,
          args: JSON.stringify(['get']),
          cachedResult: result ? JSON.stringify(SerAny.serialize(result)) : null,
          execTime: 0,
          stageName: scriptInstance.stageName,
          funcName: `get_${propertyKey}`,
          internal: scriptInstance.isInternalExecution,
        });
      } catch (error) {
        console.log(
          `Erro ao salvar hash de execução para chamada get ${target.constructor.name}.${propertyKey}`,
          error,
        );
      }

      return result;
    },
  });
}

function wrapScriptFunction(
  target: any,
  descriptor: PropertyDescriptor,
  wrapper: (context: { scriptInstance: any; args: any[]; execute: any }) => Promise<any> | any,
): any {
  const originalMethod = descriptor.value;

  descriptor.value = function (...args: any[]) {
    let instance = this;

    const isExtension = target instanceof ScriptExtension;

    if (isExtension) {
      const scriptInstance = Reflect.get(this, 'script');

      if (!scriptInstance) {
        throw new Error(
          `Erro ao executar extensão de script ${target.constructor.name}.${descriptor.value.name}(${args}): instância do script base não encontrada.`,
        );
      }

      instance = scriptInstance;
    }

    if (!instance.scriptId) {
      throw new Error(
        `Erro ao executar ${isExtension ? 'extensão de script' : 'função de script'} ${target.constructor.name}.${
          descriptor.value.name
        }(${args}): id do script não encontrado.`,
      );
    }

    return wrapper({ args, scriptInstance: instance, execute: originalMethod });
  };

  return originalMethod;
}

function wrapScriptProperty(
  target: any,
  propertyKey: string,
  wrapper: {
    get?: (context: { scriptInstance: any; execute: any }) => any;
    set?: (context: { scriptInstance: any; value: any; execute: any }) => void;
  },
) {
  const originalGetter = Object.getOwnPropertyDescriptor(target, propertyKey)?.get;
  let newGetter: any;

  if (wrapper?.get) {
    newGetter = function () {
      if (originalGetter) {
        let instance = this;

        const isExtension = target instanceof ScriptExtension;

        if (isExtension) {
          const scriptInstance = Reflect.get(this, 'script');

          if (!scriptInstance) {
            throw new Error(
              `Erro ao obter propriedade '${propertyKey}' da extensão de script ${target.constructor.name}: instância do script base não encontrada.`,
            );
          }

          instance = scriptInstance;
        }

        if (!instance.scriptId) {
          throw new Error(
            `Erro ao obter propriedade '${propertyKey}' ${isExtension ? 'da extensão de script' : 'do script'} ${
              target.constructor.name
            }: id do script não encontrado.`,
          );
        }

        return wrapper.get({ scriptInstance: instance, execute: originalGetter });
      } else {
        throw new Error(`Getter da propriedade ${propertyKey} não encontrado no script ${target.constructor.name}`);
      }
    };
  }

  const originalSetter = Object.getOwnPropertyDescriptor(target, propertyKey)?.set;
  let newSetter: any;

  if (wrapper?.set) {
    newSetter = function (value: any) {
      if (originalSetter) {
        let instance = this;

        const isExtension = target instanceof ScriptExtension;

        if (isExtension) {
          const scriptInstance = Reflect.get(this, 'script');

          if (!scriptInstance) {
            throw new Error(
              `Erro ao definir propriedade '${propertyKey}' da extensão de script ${target.constructor.name}: instância do script base não encontrada.`,
            );
          }

          instance = scriptInstance;
        }

        if (!instance.scriptId) {
          throw new Error(
            `Erro ao definir propriedade '${propertyKey}' ${isExtension ? 'da extensão de script' : 'do script'} ${
              target.constructor.name
            }: id do script não encontrado.`,
          );
        }

        wrapper.set({ scriptInstance: instance, value, execute: originalSetter });
      } else {
        throw new Error(`Setter da propriedade ${propertyKey} não encontrado no script ${target.constructor.name}`);
      }
    };
  }

  if (newGetter || newSetter) {
    Object.defineProperty(target, propertyKey, {
      get: newGetter || originalGetter,
      set: newSetter || originalSetter,
      enumerable: true,
      configurable: true,
    });
  }
}

export function CachedScriptFunction(options?: {
  transformArgs?: (instance: any, args: any[]) => Promise<any[]> | any[];
  transformResult?: (instance: any, result: any, operation: 'get' | 'set') => Promise<any> | any;
  onCache?: (instance: any, args: any[], result: any) => Promise<void> | void;
  keepCachedVars?: boolean;
  cacheResult?: boolean;
}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const returnType = Reflect.getMetadata('design:returntype', target, propertyKey);

    if (returnType === Promise) {
      wrapScriptFunction(target, descriptor, async ({ args, scriptInstance, execute }) => {
        const { transformArgs, transformResult, onCache, cacheResult = true, keepCachedVars = false } = options || {};

        const transformedArg = transformArgs ? await transformArgs(scriptInstance, args) : args;

        if (!scriptInstance.scriptId) {
          throw new Error(`Erro ao executar função em cache ${propertyKey}(${args}): id do script não encontrado`);
        }

        // Verifica se a função já foi chamada antes
        const execHash = localdb.findScriptExecution({
          scriptId: scriptInstance.scriptId,
          automationId: process.env.AUTOMATION_ID,
          execSequence: scriptInstance.isInternalExecution
            ? scriptInstance.internalExecSequence
            : scriptInstance.execSequence,
          internal: scriptInstance.isInternalExecution,
        });

        if (execHash) {
          let chachedResult = execHash.cachedResult ? SerAny.deserialize(JSON.parse(execHash.cachedResult)) : undefined;

          if (transformResult) {
            chachedResult = await transformResult(scriptInstance, chachedResult, 'get');
          }

          if (onCache) {
            await onCache(scriptInstance, args, chachedResult);
          }

          return chachedResult;
        }

        // Caso contrário, chama a função original
        let result: any;
        let endMs: number;
        let startMs = Date.now();

        try {
          const firstExec = localdb.getCachedVar({
            name: '_firstExec',
            scriptId: scriptInstance.scriptId,
            execSequence: scriptInstance.isInternalExecution
              ? scriptInstance.internalExecSequence
              : scriptInstance.execSequence,
            defaultValue: true,
            internal: scriptInstance.isInternalExecution,
          });
          result = await execute.apply(scriptInstance, [...transformedArg, firstExec]);
          if (!keepCachedVars) {
            localdb.clearExecutionCachedVars({
              scriptId: scriptInstance.scriptId,
              execSequence: scriptInstance.isInternalExecution
                ? scriptInstance.internalExecSequence
                : scriptInstance.execSequence,
              internal: scriptInstance.isInternalExecution,
            });
          }
          localdb.clearExecutionTimers({
            scriptId: scriptInstance.scriptId,
            execSequence: scriptInstance.isInternalExecution
              ? scriptInstance.internalExecSequence
              : scriptInstance.execSequence,
            internal: scriptInstance.isInternalExecution,
          });
          endMs = Date.now();
        } catch (error) {
          endMs = Date.now();
          // Registra o erro
          localdb.createScriptExecution({
            scriptId: scriptInstance.scriptId,
            automationId: process.env.AUTOMATION_ID,
            execSequence: scriptInstance.isInternalExecution
              ? scriptInstance.internalExecSequence
              : scriptInstance.execSequence,
            args: JSON.stringify(transformedArg),
            error: error.message,
            execTime: endMs - startMs,
            stageName: scriptInstance.stageName,
            funcName: propertyKey,
            internal: scriptInstance.isInternalExecution,
          });
          throw error;
        } finally {
          localdb.setCachedVar({
            name: '_firstExec',
            scriptId: scriptInstance.scriptId,
            execSequence: scriptInstance.isInternalExecution
              ? scriptInstance.internalExecSequence
              : scriptInstance.execSequence,
            internal: scriptInstance.isInternalExecution,
            value: false,
          });
        }

        const prevSequence = scriptInstance.isInternalExecution
          ? scriptInstance.internalExecSequence
          : scriptInstance.execSequence;
        if (scriptInstance.isInternalExecution) scriptInstance.internalExecSequence++;
        else scriptInstance.execSequence++;

        try {
          // Salva a execução
          localdb.createScriptExecution({
            scriptId: scriptInstance.scriptId,
            automationId: process.env.AUTOMATION_ID,
            execSequence: prevSequence,
            args: JSON.stringify(transformedArg),
            cachedResult:
              result && cacheResult
                ? JSON.stringify(
                    SerAny.serialize(transformResult ? await transformResult(scriptInstance, result, 'set') : result),
                  )
                : null,
            execTime: endMs - startMs,
            stageName: scriptInstance.stageName,
            funcName: propertyKey,
            internal: scriptInstance.isInternalExecution,
          });
        } catch (error) {
          console.log(
            `Erro ao salvar execução para chamada ${target.constructor.name}.${propertyKey}(${transformedArg})`,
            error,
          );
        }

        return result;
      });
    } else {
      wrapScriptFunction(target, descriptor, ({ args, scriptInstance, execute }) => {
        const { transformArgs, transformResult, onCache, cacheResult = true, keepCachedVars = false } = options || {};

        const transformedArgs = transformArgs ? transformArgs(scriptInstance, args) : args;

        if (transformedArgs instanceof Promise) {
          throw new Error(
            `Parâmetro 'transformArgs' do decorator CachedScriptFunction na função '${target.constructor.name}.${propertyKey}' não pode ser assíncrono pois o retorno da função não é uma Promise.`,
          );
        }

        if (!scriptInstance.scriptId) {
          throw new Error(`Erro ao executar função em cache ${propertyKey}(${args}): id do script não encontrado`);
        }

        // Verifica se a função já foi chamada antes
        const execHash = localdb.findScriptExecution({
          scriptId: scriptInstance.scriptId,
          automationId: process.env.AUTOMATION_ID,
          execSequence: scriptInstance.isInternalExecution
            ? scriptInstance.internalExecSequence
            : scriptInstance.execSequence,
          internal: scriptInstance.isInternalExecution,
        });

        if (execHash) {
          let chachedResult = execHash.cachedResult ? SerAny.deserialize(JSON.parse(execHash.cachedResult)) : undefined;

          if (transformResult) {
            chachedResult = transformResult(scriptInstance, chachedResult, 'get');

            if (chachedResult instanceof Promise) {
              throw new Error(
                `Parâmetro 'transformResult' do decorator CachedScriptFunction na função '${target.constructor.name}.${propertyKey}' não pode ser assíncrono pois o retorno da função não é uma Promise.`,
              );
            }
          }

          if (onCache && onCache(scriptInstance, args, chachedResult) instanceof Promise) {
            throw new Error(
              `Parâmetro 'onCache' do decorator CachedScriptFunction na função '${target.constructor.name}.${propertyKey}' não pode ser assíncrono pois o retorno da função não é uma Promise.`,
            );
          }

          return chachedResult;
        }

        // Caso contrário, chama a função original
        let result: any;
        let endMs: number;
        let startMs = Date.now();

        const saveExecError = (error: Error) => {
          localdb.createScriptExecution({
            scriptId: scriptInstance.scriptId,
            automationId: process.env.AUTOMATION_ID,
            execSequence: scriptInstance.isInternalExecution
              ? scriptInstance.internalExecSequence
              : scriptInstance.execSequence,
            args: JSON.stringify(transformedArgs),
            error: error.message,
            execTime: endMs - startMs,
            stageName: scriptInstance.stageName,
            funcName: propertyKey,
            internal: scriptInstance.isInternalExecution,
          });
        };

        try {
          const firstExec = localdb.getCachedVar({
            name: '_firstExec',
            scriptId: scriptInstance.scriptId,
            execSequence: scriptInstance.isInternalExecution
              ? scriptInstance.internalExecSequence
              : scriptInstance.execSequence,
            defaultValue: true,
            internal: scriptInstance.isInternalExecution,
          });
          result = execute.apply(scriptInstance, [...(transformedArgs as any[]), firstExec]);
          if (!keepCachedVars) {
            localdb.clearExecutionCachedVars({
              scriptId: scriptInstance.scriptId,
              execSequence: scriptInstance.isInternalExecution
                ? scriptInstance.internalExecSequence
                : scriptInstance.execSequence,
              internal: scriptInstance.isInternalExecution,
            });
          }
          localdb.clearExecutionTimers({
            scriptId: scriptInstance.scriptId,
            execSequence: scriptInstance.isInternalExecution
              ? scriptInstance.internalExecSequence
              : scriptInstance.execSequence,
            internal: scriptInstance.isInternalExecution,
          });
          endMs = Date.now();
        } catch (error) {
          endMs = Date.now();
          // Registra o erro
          saveExecError(error);
          throw error;
        } finally {
          localdb.setCachedVar({
            name: '_firstExec',
            scriptId: scriptInstance.scriptId,
            execSequence: scriptInstance.isInternalExecution
              ? scriptInstance.internalExecSequence
              : scriptInstance.execSequence,
            internal: scriptInstance.isInternalExecution,
            value: false,
          });
        }

        const prevSequence = scriptInstance.isInternalExecution
          ? scriptInstance.internalExecSequence
          : scriptInstance.execSequence;
        if (scriptInstance.isInternalExecution) scriptInstance.internalExecSequence++;
        else scriptInstance.execSequence++;

        try {
          // Salva a execução
          const transformedResult = transformResult ? transformResult(scriptInstance, result, 'set') : result;

          if (transformedResult instanceof Promise) {
            throw new Error(
              `Parâmetro 'transformResult' do decorator CachedScriptFunction na função '${target.constructor.name}.${propertyKey}' não pode ser assíncrono pois o retorno da função não é uma Promise.`,
            );
          }

          localdb.createScriptExecution({
            scriptId: scriptInstance.scriptId,
            automationId: process.env.AUTOMATION_ID,
            execSequence: prevSequence,
            args: JSON.stringify(transformedArgs),
            cachedResult: result && cacheResult ? JSON.stringify(SerAny.serialize(transformedResult)) : null,
            execTime: endMs - startMs,
            stageName: scriptInstance.stageName,
            funcName: propertyKey,
            internal: scriptInstance.isInternalExecution,
          });
        } catch (error) {
          saveExecError(error);
          console.log(
            `Erro ao salvar execução para chamada ${target.constructor.name}.${propertyKey}(${transformedArgs})`,
            error,
          );
        }

        return result;
      });
    }

    return descriptor;
  };
}
