import 'reflect-metadata';

import { prisma } from '../../database/prisma';
import LocalDb from '../../database/localdb';
import SerAny from 'serialize-anything';
import fs from 'fs-extra';
import { MsgUtils, calculateHash } from '../../whatsapp/utils';
import path from 'path';
import { formatTsCode } from '../utils';
import { Funnel, MessageAgent, MessageType } from '@prisma/client';
import { ScriptParam } from './types';
import { InputMessage } from '../../whatsapp/types/inputMessage';

export abstract class FunnelScriptUtils {
  static async saveNewMessages(funnel: Funnel, agent: { id: string; type: MessageAgent }, newMessages: InputMessage[]) {
    await prisma.message.createMany({
      data: newMessages.map((message) => {
        return {
          id: message.id,
          agentType: agent.type,
          agentId: agent.id,
          type: message.type as MessageType,
          quoteId: message.quoteId,
          processed: message.processed,
          content: MsgUtils.isUnsupported(message)
            ? {}
            : this.removeObjectKeysFromKeysInType(message, [
                // TODO: achar uma forma melhor de remover as props do conteudo
                'id',
                'funnelId',
                'date',
                'processed',
                'quoteId',
                'type',
              ]),
          date: message.date,
          stageName: funnel.currentStage,
          funnelId: funnel.id,
        };
      }),
      skipDuplicates: true,
    });
  }

  private static removeObjectKeysFromKeysInType<T extends Record<string, any>, K extends keyof T>(
    object: T,
    keys: K[],
  ): Omit<T, K> {
    const newObject = { ...object };

    for (const key of keys) {
      delete newObject[key];
    }

    return newObject;
  }

  static async getMessagesFromIds(messageIds: string[], funnelId?: string): Promise<InputMessage[]> {
    const messages = await prisma.message.findMany({
      where: funnelId ? { id: { in: messageIds }, funnelId } : { id: { in: messageIds } },
    });
    return MsgUtils.parseDatabaseMessages(messages);
  }

  static async getMessageFromId(messageId: string, funnelId?: string): Promise<InputMessage> {
    const message = await prisma.message.findUnique({
      where: funnelId ? { id: messageId, funnelId } : { id: messageId },
    });
    return MsgUtils.parseDatabaseMessage(message);
  }

  static getScriptParamsFromScriptContent(scriptContent: string): ScriptParam[] {
    try {
      const extractedSchema = scriptContent.match(/getParamSchema.+return.+?(\[.+])/s)[1];
      return eval(extractedSchema);
    } catch (error) {
      throw new Error(`Erro ao extrair schema de parâmetros do script: ${error.message}`);
    }
  }
}

type CreateClassOptions = {
  createLocalFile?: boolean;
  automationPhone?: string;
};

/*export async function updateClass(classTsContent: string) {
  try {
    const compactedCode = (await formatTsCode(classTsContent)).replace(/import.+/g, '').replace(/\s{2}/g, '');

    const classId = classTsContent.match(/@FunnelScript.+id: '(.+?)'/)?.[1];
    const classVersion = classTsContent.match(/@FunnelScript.+version: (\d+)/)?.[1];

    if (!classId) {
      throw new Error('Id da classe não encontrado');
    }

    if (!classVersion) {
      throw new Error('Versão da classe não encontrada');
    }

    const {
      _max: { update: lastUpdate },
    } = await prisma.classVersion.aggregate({
      where: { classId, version: Number(classVersion) },
      _max: { update: true },
    });

    if (!lastUpdate) {
      throw new Error(`Classe com id ${classId} e versão ${classVersion} não encontrada`);
    }

    const currentVersion = await prisma.classVersion.findFirst({
      where: { classId, version: Number(classVersion), update: lastUpdate },
    });

    const newClassHashId = calculateHash(compactedCode);

    if (currentVersion.hashId == newClassHashId) {
      // Classe já está atualizada
      return;
    }

    await prisma.classVersion.create({
      data: {
        hashId: newClassHashId,
        script: compactedCode,
        version: Number(classVersion),
        update: lastUpdate + 1,
        classId,
      },
    });
  } catch (error) {
    console.log(`Erro ao atualizar classe: ${error}`);
  }
}

export async function createClassVersion(classTsContent: string) {
  const compactedCode = (await formatTsCode(classTsContent)).replace(/import.+/g, '').replace(/\s{2}/g, '');

  const classId = classTsContent.match(/@FunnelClass.+id: '(.+?)'/)?.[1];

  if (!classId) {
    throw new Error('Id da classe não encontrado');
  }
}

export async function createClassFromDefaultModel(name: string, options?: CreateClassOptions) {
  let filePath: string;

  try {
    if (!process.env.CLASS_PATH || !process.env.DEFAULT_CLASS_NAME) {
      throw new Error(
        'Caminho da classe padrão não encontrado, verifique aS variáveis de ambiente CLASS_PATH e DEFAULT_CLASS_NAME.',
      );
    }

    let classTsContent = await fs.readFile(path.join(process.env.CLASS_PATH, process.env.DEFAULT_CLASS_NAME), 'utf-8');

    const funnelInstance = await createClassInstanceByTsContent(classTsContent);

    const metadata = Reflect.getMetadata('metadata', funnelInstance);

    if (!metadata) {
      throw new Error('Metadados da classe padrão não encontrados');
    }

    const stageKeys = (Reflect.getMetadataKeys(funnelInstance) || []).filter((key) => key.startsWith('stage:'));

    await prisma.$transaction(async (tx) => {
      let stageIds: { id: string }[] = [];

      // Cria as etapas
      for (const key of stageKeys) {
        const { name } = Reflect.getMetadata(key, funnelInstance);
        const id = await tx.stage.create({ data: { name }, select: { id: true } });
        stageIds.push(id);
      }

      // Cria a classe
      const { id: classId } = await tx.class.create({
        data: {
          name: name,
          stage: {
            connect: stageIds,
            connectOrCreate: [
              {
                where: { id: '_start' },
                create: {
                  id: '_start',
                  name: 'Início',
                },
              },
              {
                where: { id: '_end' },
                create: {
                  id: '_end',
                  name: 'Fim',
                },
              },
            ],
          },
        },
        select: { id: true },
      });

      // Altera o id e o nome da classe para o id e nome fornecidos no decorator
      classTsContent = classTsContent.replace(/@FunnelClass.+?\)/s, (match: string) => {
        return match
          .replace(/id: '(.+?)'/, `id: '${classId}'`)
          .replace(/name: '(.+?)'/, `name: '${name}'`)
          .replace(/version: (\d+)/, `version: 1`);
      });

      // Altera o nome da classe para o nome formatado (sem acentos e espaços)
      const className = formatClassName(name);

      // Altera o nome da classe para o nome fornecido
      classTsContent = classTsContent.replace(
        /class (.+) extends BaseFunnel/,
        `class ${className}V1 extends BaseFunnel`,
      );

      const compactedCode = (await formatTsCode(classTsContent)).replace(/import.+/g, '').replace(/\s{2}/g, '');

      // Cria a versão da classe
      await tx.classVersion.create({
        data: {
          hashId: calculateHash(compactedCode),
          script: compactedCode,
          version: 1,
          classId,
        },
      });

      if (options.createLocalFile) {
        // Altera o id da classe para o id auto gerado pelo banco de dados
        let fileIndex = 0;

        while (
          await fs.pathExists(
            path.join(process.env.CLASS_PATH, `${className}${fileIndex > 0 ? `_${fileIndex}` : ''}V1.ts`),
          )
        ) {
          fileIndex++;
        }

        if (fileIndex > 0) {
          classTsContent = classTsContent.replace(
            /class (.+) extends BaseFunnel/,
            `class ${className}_${fileIndex} extends BaseFunnel`,
          );
        }

        filePath = path.join(process.env.CLASS_PATH, `${className}${fileIndex > 0 ? `_${fileIndex}` : ''}.ts`);

        await fs.outputFile(filePath, classTsContent);
      }

      if (options.automationPhone || process.env.AUTOMATION_PHONE) {
        // Vincula a classe à automação
        await prisma.automation.update({
          where: { phone: options.automationPhone || process.env.AUTOMATION_PHONE },
          data: {
            class: {
              connect: { id: classId },
            },
          },
        });
      }

      console.log(`Classe '${name}' registrada com sucesso`);
      if (filePath) console.log(`Classe '${name}' salva em ${filePath}`);
    });
  } catch (error) {
    if (filePath) await fs.remove(filePath);
    console.log(`Erro ao registrar classe '${name}'`, error);
  }
}

export function runInCache<R>(funnelId: string, hash: string, onExec: () => R): R {
  if (!funnelId) {
    throw new Error(`Erro: runInCache - id do funil não encontrado`);
  }

  const localdb = LocalDb.getInstance();
  const execHash = localdb.findScriptExecution({ funnelId, hash });

  if (execHash) {
    const chachedResult = execHash.cachedResult ? SerAny.deserialize(JSON.parse(execHash.cachedResult)) : undefined;

    console.log(
      `\nIgnorando execução existente ${hash}\n-> funil: ${funnelId}${
        chachedResult ? `\n-> resultado em cache: ${JSON.stringify(chachedResult)}` : ''
      }`,
    );

    return chachedResult;
  }

  // Caso contrário, chama a função original
  const result = onExec();

  try {
    // Salva o hash da função
    localdb.createScriptExecution({
      funnelId,
      hash,
      cachedResult: result ? JSON.stringify(SerAny.serialize(result)) : null,
    });
  } catch (error) {
    console.log(
      `Erro: runInCache - erro ao salvar execução em cache\n-> funil: ${funnelId}\n-> hash: ${hash}${
        result ? `\n-> resultado em cache: ${JSON.stringify(result)}` : ''
      }`,
      error,
    );
  }

  return result;
}*/
