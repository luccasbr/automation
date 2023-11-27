import removeAccents from 'remove-accents';
import * as prettier from 'prettier';
import * as esbuild from 'esbuild';
import vm from 'vm';
import { StartupScript } from './preScript/types';
import { ScriptPermission, ScriptPermissionLevel } from '@prisma/client';
import { prisma } from '../database/prisma';

import { default as vmDeps } from './index';

export abstract class ScriptUtils {
  public static levelMap = {
    [ScriptPermissionLevel.EXECUTION]: 0,
    [ScriptPermissionLevel.VIEW_FLOW]: 1,
    [ScriptPermissionLevel.EDIT_FLOW]: 2,
    [ScriptPermissionLevel.EDIT_CODE]: 3,
  };

  public static getStartupId(startupScript: StartupScript): string {
    return startupScript.scriptId ? startupScript.scriptId : startupScript.scriptName;
  }

  public static isDefaultStartupScript(startupScript: StartupScript): boolean {
    return startupScript.scriptId === '_default';
  }

  public static formatClassName(name: string): string {
    // Remove acentos
    const nameWithoutAccents = removeAccents(name);

    // Quebra a string em palavras
    const words = nameWithoutAccents.split(' ');

    // Capitaliza a primeira letra de cada palavra e remove espaços
    const formattedName = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('');

    return formattedName;
  }

  public static isFirstExec(args: IArguments): boolean {
    return args[args.length - 1] === true;
  }

  public static getScriptPermissionLevelIndex(level: ScriptPermissionLevel): number {
    return this.levelMap[level];
  }

  public static hasUserScriptPermissionLevel(permission: ScriptPermission, level: ScriptPermissionLevel): boolean {
    return (
      permission &&
      level &&
      this.getScriptPermissionLevelIndex(permission.level) >= this.getScriptPermissionLevelIndex(level)
    );
  }

  public static async canUserExecuteScript(
    scriptLink: {
      sourceScriptId: string;
      sourceScript: { private: boolean; originalScriptId: string; originalScript: { private: boolean } };
    },
    userId: string,
  ): Promise<boolean> {
    if (
      scriptLink.sourceScript.originalScript
        ? !scriptLink.sourceScript.originalScript.private
        : !scriptLink.sourceScript.private
    ) {
      return true;
    }

    const permission = await prisma.scriptPermission.findUnique({
      where: {
        scriptId_userId: {
          scriptId: scriptLink.sourceScript.originalScriptId || scriptLink.sourceScriptId,
          userId: userId,
        },
      },
    });

    return ScriptUtils.hasUserScriptPermissionLevel(permission, 'EXECUTION');
  }
}

export function compactCode(code: string) {
  return code.replace(/\s{2}/g, '');
}

export function formatTsCode(code: string) {
  return prettier.format(code, { parser: 'typescript', semi: true, singleQuote: true, tabWidth: 500 });
}

export async function createClassInstanceByTsContent(classContent: string, ...args: any[]) {
  const formatedCode = await formatTsCode(classContent);
  const code = await bundleScript(formatedCode.replace(/import.+/g, '').replace(/export default /, ''));
  return createClassInstanceByJsContent(code, args);
}

export async function createClassInstanceByJsContent(classContent: string, ...args: any[]) {
  const context = vm.createContext(vmDeps);
  vm.runInContext(classContent, context);

  const className = classContent.match(/var (\w+) = class/)?.[1];

  if (!className) {
    throw new Error('[createClassInstanceByJsContent] - Nome da classe não encontrado ao criar instância');
  }

  const instance = new context[className](args);

  return instance;
}

export async function bundleScript(classTsContent: string) {
  //await fs.remove('./dist/funnel/classes');

  let compiledContent = '';

  try {
    const build = await esbuild.build({
      write: false,
      stdin: {
        contents: classTsContent,
        loader: 'ts',
      },
      tsconfig: './tsconfig.json',
    });

    if (build.outputFiles?.length > 0) {
      compiledContent = build.outputFiles[0].text.replace('let', 'var');
      //await fs.outputFile(`./dist/funnel/classes/${uuid()}.js`, compiledContent);
    } else {
      throw new Error('Erro ao compilar classe. Nenhum conteúdo de saída encontrado.');
    }
  } catch (error) {
    console.log(`Erro ao compilar classe: ${error}`);
  }

  return compiledContent;
}
