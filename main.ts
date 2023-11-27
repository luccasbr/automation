import 'dotenv/config';
import LocalDb from './database/localdb';
import { prisma } from './database/prisma';
import GithubApi from './git/GithubApi';
import { IScriptRepository } from './git/IScriptRepository';
import FunnelScript from './scripting/funnel/FunnelScript';
import { ScriptArg, ScriptParam } from './scripting/funnel/types';
import { FunnelScriptUtils } from './scripting/funnel/utils';
import PreScript, { PreScriptConstructorArgs } from './scripting/preScript/PreScript';
import { StartupScript } from './scripting/preScript/types';
import { createClassInstanceByTsContent, ScriptUtils } from './scripting/utils';
import { WhatsappApi } from './whatsapp/WhatsappApi';
import { nanoid } from 'nanoid';
import 'reflect-metadata';
import moment from 'moment';
import AccountScript from './scripting/accountScript/AccountScript';
import ScriptInstanceManager from './scripting/ScriptInstanceManager';
import DefaultAccountScript from './scripting/accountScript/DefaultAccountScript';

// prevent stop app when throw error
process.on('uncaughtException', (err) => {
  console.log(err);
});

const log = console.log;

if (process.env.LOCAL_LOGS_ENABLED === 'true') {
  console.log = (...args) => {
    log(
      `[${moment().format('DD/MM/YYYY HH:mm:ss')}]`,
      ...args.map((arg) => (typeof arg === 'string' ? arg.replace(/\n/g, `\n${Array(21).fill(' ').join('')} `) : arg)),
    );
  };
  console['logEmptyLine'] = () => {
    log('');
  };
} else {
  console.log = () => {};
}

(async () => {
  const USER_ID = process.env.USER_ID;
  const AUTOMATION_ID = process.env.AUTOMATION_ID;

  if (!AUTOMATION_ID) {
    throw new Error('AUTOMATION_ID não definido no ambiente');
  }

  if (!USER_ID) {
    throw new Error('USER_ID não definido no ambiente');
  }

  try {
    const instance = await ScriptInstanceManager.getInstance().getAccountInstance(USER_ID);
    instance.onInitialize();
  } catch (error) {
    console.log(`Erro ao inicializar script da conta. Detalhes: ${error.message}`);
  }

  const automation = await prisma.automation.findUnique({
    where: { id: AUTOMATION_ID },
  });

  if (!automation) {
    throw new Error(`Automação ${AUTOMATION_ID} não encontrada.`);
  }

  if ((await prisma.user.count({ where: { id: USER_ID } })) === 0) {
    throw new Error(`Usuário ${USER_ID} não encontrado.`);
  }

  const scriptRepository: IScriptRepository = GithubApi.getInstance();

  // Inicializa o banco de dados local
  const localdb = LocalDb.getInstance();
  localdb.initialize();

  const api = WhatsappApi.getInstance();
  await api.connect();

  api.onChatUpsert(async (chat) => {
    if (process.env.AUTOMATION_ENABLED === 'true') {
      console.log(`\nSalvando novo cliente: ${chat.phone} - ${chat.pushName}`);
      // salva o cliente se não existir
      await prisma.lead.upsert({
        where: { phone: chat.phone },
        update: {},
        create: {
          phone: chat.phone,
          name: chat.pushName,
          userId: USER_ID,
        },
      });
    }
  });

  api.onChatUpdate(async (chatUpdate) => {
    // Garante que o cliente existe (pode já ter sido criado pelo onChatUpsert)
    const lead = await prisma.lead.upsert({
      where: { phone: chatUpdate.phone },
      update: {},
      create: {
        phone: chatUpdate.phone,
        name: chatUpdate.pushName,
        userId: USER_ID,
      },
    });

    // cria o funil ou restaura o funil
    let funnel = await prisma.funnel.findFirst({
      where: {
        lead: { phone: chatUpdate.phone },
        status: {
          notIn: ['CANCELED', 'COMPLETED'],
        },
      },
      include: {
        tags: { select: { name: true, id: true } },
        lead: { select: { phone: true, name: true, city: true, state: true, createdAt: true, genre: true } },
      },
    });

    if (process.env.AUTOMATION_ENABLED === 'false') {
      return;
    }

    const isTester = (await prisma.tester.count({ where: { phone: lead.phone, automationId: AUTOMATION_ID } })) > 0;

    let scriptContent: string;
    let draftParamSchema: ScriptParam[];
    let scriptName: string;

    if (!funnel) {
      // Cliente não possui funil ativo

      const preScriptArgs: PreScriptConstructorArgs = {
        id: nanoid(11),
        initiator: {
          name: lead.name,
          phone: lead.phone,
        },
        runningInTestMode: isTester,
      };

      let startupScript: StartupScript;
      let preScriptErrorMessage: string;
      let preScriptExecStartMs: number;
      let preScriptExecEndMs: number;
      let runningInTestMode = false;
      let scriptVersion: number;
      let scriptHash: string;
      let startupScriptFound = true;
      let sourceScriptId: string;
      let scriptArgs: ScriptArg[];

      try {
        const { preScript } = await prisma.automation.findUnique({
          where: { id: AUTOMATION_ID },
          select: { preScript: true },
        });

        if (!preScript) {
          throw new Error(
            `Automação ${automation.phone} - ${automation.name} não possui pré-script vinculado. Contatar o suporte.`,
          );
        }

        preScriptExecStartMs = Date.now();

        const preScriptInstance = (await createClassInstanceByTsContent(preScript, preScriptArgs)) as PreScript;

        startupScript = await preScriptInstance[isTester ? 'onTesterInteract' : 'onLeadInteract'](
          chatUpdate.newMessages,
        );

        preScriptExecEndMs = Date.now();

        if (!startupScript || (!startupScript.scriptId && !startupScript.scriptName)) {
          startupScriptFound = false;
          localdb.createScriptLog({
            scriptId: preScriptArgs.id,
            automationId: AUTOMATION_ID,
            level: 'warn',
            text: `Nenhum script de funil encontrado para a inicialização.`,
          });
        }

        if (startupScript.scriptId && startupScript.scriptName) {
          throw new Error(`O tipo de identificação do script retornado pelo pré-script é ambíguo. Contatar o suporte.`);
        }

        const initType = startupScript.scriptId ? 'id' : 'name';

        if (startupScriptFound) {
          runningInTestMode = !ScriptUtils.isDefaultStartupScript(startupScript) && isTester;

          const scriptLink = await prisma.scriptLink.findUnique({
            where: {
              sourceScriptId_automationId:
                initType === 'id' ? { sourceScriptId: startupScript.scriptId, automationId: AUTOMATION_ID } : undefined,
              automationId_name:
                initType === 'name' ? { automationId: AUTOMATION_ID, name: startupScript.scriptName } : undefined,
              deletedAt: null,
              sourceScript: runningInTestMode
                ? {
                    authorId: USER_ID,
                  }
                : undefined,
            },
            include: {
              releases: {
                where: startupScript.version ? { version: startupScript.version } : undefined,
                orderBy: !startupScript.version ? { version: 'desc' } : undefined,
                take: !startupScript.version ? 1 : undefined,
                select: { version: true, update: true },
                include: {
                  scriptUpdate: {
                    select: { scriptHash: true },
                    include: {
                      scriptVersion: {
                        select: {
                          draftContent: runningInTestMode,
                          draftParamSchema: runningInTestMode,
                          deprecatedWarning: true,
                        },
                      },
                    },
                  },
                },
              },
              sourceScript: {
                select: {
                  name: true,
                  repoFileName: true,
                  authorId: true,
                  private: true,
                  originalScriptId: true,
                  originalScript: { select: { private: true } },
                },
              },
            },
          });

          if (!scriptLink) {
            throw new Error(
              runningInTestMode
                ? `Não foi possível executar o script ${ScriptUtils.getStartupId(
                    startupScript,
                  )}. Apenas scripts criados por você podem ser executados em modo de teste.`
                : `Script ${ScriptUtils.getStartupId(startupScript)} não encontrado na automação ${
                    automation.phone
                  } - ${automation.name}.`,
            );
          }

          const scriptRelease = scriptLink.releases ? scriptLink.releases[0] : undefined;

          if (!scriptRelease) {
            throw new Error(
              `Script ${scriptLink.name} não possui a versão ${startupScript.version} vinculada à automação.`,
            );
          }

          if (runningInTestMode) {
            scriptContent = scriptLink.releases[0].scriptUpdate.scriptVersion.draftContent;
            try {
              draftParamSchema = scriptRelease.scriptUpdate.scriptVersion.draftParamSchema as ScriptParam[];
            } catch (error) {
              throw new Error(`Erro ao converter schema do script ${scriptLink.name}. Detalhes: ${error.message}.`);
            }
          } else {
            // Verifica se o usuário possui permissão para executar o script
            if (!(await ScriptUtils.canUserExecuteScript(scriptLink, USER_ID))) {
              throw new Error(
                `Você não possui permissão para executar o script ${scriptLink.name}. Contate o autor do script para solicitar acesso.`,
              );
            }

            // Se não for tester ou o script não for do usuário da atual automação, busca a versão publicada
            if (scriptLink.autoUpdate) {
              // Busca a última atualização do script e atualiza a versão do script se necessário
              const latestSourceScriptUpdate = await prisma.scriptUpdate.findFirst({
                where: {
                  scriptId: scriptLink.sourceScriptId,
                  version: scriptRelease.version,
                },
                orderBy: { update: 'desc' },
              });

              if (latestSourceScriptUpdate && latestSourceScriptUpdate.update > scriptRelease.update) {
                const repoScriptContent = await scriptRepository.getScriptVersion({
                  authorId: scriptLink.sourceScript.authorId,
                  fileName: scriptLink.sourceScript.repoFileName,
                  releaseHash: latestSourceScriptUpdate.scriptHash,
                });

                // Verifica se os parâmetros do script estão válidos de acordo com o schema, se não, não faz o update
                const schema = FunnelScriptUtils.getScriptParamsFromScriptContent(repoScriptContent);
                const args = startupScript.params as ScriptArg[];
                if (
                  schema &&
                  schema.length > 0 &&
                  (!args || !schema.every((schema) => args.some((arg) => arg.key === schema.key)))
                ) {
                  // Os parametros diferem, não faz o update usa a versão atual
                  scriptHash = scriptRelease.scriptUpdate.scriptHash;
                } else {
                  // Atualiza a versão do script
                  try {
                    await prisma.scriptRelease.update({
                      where: {
                        scriptId_automationId_version: {
                          scriptId: scriptLink.sourceScriptId,
                          automationId: scriptLink.automationId,
                          version: scriptRelease.version,
                        },
                      },
                      data: { update: latestSourceScriptUpdate.update },
                    });
                    scriptHash = scriptRelease.scriptUpdate.scriptHash;
                    scriptContent = repoScriptContent;
                  } catch (error) {
                    throw new Error(
                      `Erro ao atualizar o script ${scriptLink.name} para a atualização da versão ${scriptRelease.version} mais recente. Contate o suporte ou desative a opção de auto-atualização do script vinculado.`,
                    );
                  }
                }
              } else {
                // Script tá na versão mais recente, usa a versão atual
                scriptHash = scriptRelease.scriptUpdate.scriptHash;
              }
            } else {
              // Script não possui auto-update, usa a versão atual
              scriptHash = scriptRelease.scriptUpdate.scriptHash;
            }

            if (!scriptHash) {
              throw new Error(
                `Script ${scriptName} na versão ${scriptVersion} ainda não publicado na origem. Apenas contatos cadastrados para teste nas automações do author do script podem executa-lo antes da publicação.`,
              );
            }
          }

          // Verifica se o script já possui conteúdo, se possuir é porque já foi atribuido no autoUpdate
          if (!scriptContent) {
            scriptContent = await scriptRepository.getScriptVersion({
              authorId: scriptLink.sourceScript.authorId,
              fileName: scriptLink.sourceScript.repoFileName,
              releaseHash: scriptHash,
            });
          }

          if (!scriptContent) {
            scriptHash = null;
            throw new Error(
              `Conteúdo do script ${scriptName} na versão de hash ${scriptHash} não encontrado no repositório. Contatar o suporte.`,
            );
          }

          // Verifica se os parâmetros do script estão válidos de acordo com o schema
          const schema = draftParamSchema
            ? draftParamSchema
            : FunnelScriptUtils.getScriptParamsFromScriptContent(scriptContent);
          if (schema && schema.length > 0) {
            const args = startupScript.params as ScriptArg[];
            if (!args || !schema.every((schema) => args.some((arg) => arg.key === schema.key))) {
              throw new Error(
                `Erro ao inicializar o script ${scriptLink.name}. Parâmetros do script na versão ${scriptRelease.version} estão inválidos, verifique a configuração de parâmetros do script.`,
              );
            }
          }

          scriptVersion = scriptRelease.version;
          scriptName = scriptLink.name;
          sourceScriptId = scriptLink.sourceScriptId;
          scriptArgs = startupScript.params as ScriptArg[];

          if (scriptRelease.scriptUpdate.scriptVersion.deprecatedWarning) {
            localdb.createScriptLog({
              scriptId: preScriptArgs.id,
              automationId: AUTOMATION_ID,
              level: 'warn',
              text: `Script ${scriptLink.name} na versão ${scriptRelease.version} está marcado como obsoleto.`,
            });
          }
        }
      } catch (error) {
        preScriptErrorMessage = error.message;
      }

      try {
        // Cria o funil
        funnel = await prisma.funnel.create({
          data: {
            automationId: AUTOMATION_ID,
            leadPhone: lead.phone,
            currentStage: '_start',
            scriptId: sourceScriptId,
            scriptHash,
            scriptVersion,
            preScriptExecId: preScriptArgs.id,
            scriptArgs,
            leadPath: {
              create: {
                stageName: '_start',
              },
            },
            test: runningInTestMode,
            status: preScriptErrorMessage ? 'BROKEN' : 'CREATED',
          },
          include: {
            tags: { select: { name: true, id: true } },
            lead: { select: { phone: true, name: true, city: true, state: true, createdAt: true, genre: true } },
          },
        });
      } catch (error) {
        preScriptErrorMessage = `Erro ao criar funil para o cliente ${lead.phone}${
          lead.name ? ` - ${lead.name}` : ''
        }. Detalhes: ${error.message}`;
      }

      localdb.createScriptExecution({
        scriptId: preScriptArgs.id,
        stageName: '_preScript',
        funcName: isTester ? 'onTesterInteract' : 'onLeadInteract',
        automationId: AUTOMATION_ID,
        execSequence: 0,
        cachedResult: startupScript ? JSON.stringify(startupScript) : null,
        args: JSON.stringify({
          initiator: preScriptArgs.initiator,
          isTester,
          messageIds: chatUpdate.newMessages.map((message) => message.id),
        }),
        execTime: preScriptExecEndMs - preScriptExecStartMs,
        error: preScriptErrorMessage,
      });
    } else if (funnel.status !== 'BROKEN') {
      // Funil já existe e não está quebrado, restaura o script que estava sendo executado

      try {
        if (!funnel.test) {
          if (!funnel.scriptHash) {
            throw new Error(`Hash de script ${funnel.scriptHash} não encontrada. Contatar o suporte.`);
          }

          const scriptUpdate = await prisma.scriptUpdate.findUnique({
            where: { scriptHash: funnel.scriptHash },
            include: {
              scriptVersion: { include: { script: { select: { name: true, repoFileName: true, authorId: true } } } },
            },
          });

          if (!scriptUpdate) {
            throw new Error(`Hash de script ${funnel.scriptHash} não encontrada. Contatar o suporte.`);
          }

          scriptContent = await scriptRepository.getScriptVersion({
            authorId: scriptUpdate.scriptVersion.script.authorId,
            fileName: scriptUpdate.scriptVersion.script.repoFileName,
            releaseHash: funnel.scriptHash,
          });

          scriptName = scriptUpdate.scriptVersion.script.name;
        } else {
          // Funis de teste não podem ser restaurados
          // TODO: Criar novo funil de teste
        }
      } catch (error) {
        localdb.createScriptExecution({
          scriptId: funnel.id,
          stageName: '_scriptRestore',
          automationId: AUTOMATION_ID,
          execSequence: 0,
          cachedResult: null,
          args: JSON.stringify({
            scriptHash: funnel.scriptHash,
            messageIds: chatUpdate.newMessages.map((message) => message.id),
          }),
          execTime: 0,
          error: error.message,
        });
      }
    }

    // Injeta o id do funil na mensagem
    chatUpdate.newMessages.forEach((message) => {
      Reflect.set(message, 'funnelId', funnel.id);
    });

    FunnelScriptUtils.saveNewMessages(funnel, { id: lead.phone, type: 'LEAD' }, chatUpdate.newMessages);

    if (funnel.status === 'BROKEN') {
      // Funil quebrado não executa o script, adiciona o listener para salvar as próximas mensagens do cliente
      api.addMessageListener(funnel.leadPhone, async (messages) => {
        FunnelScriptUtils.saveNewMessages(funnel, { id: lead.phone, type: 'LEAD' }, messages);
      });

      return;
    }

    // Busca as mensagens não processadas pois pode haver mensagens pendentes de outra execução que falhou
    const pendingMessages = await prisma.message.findMany({
      where: {
        funnelId: funnel.id,
        processed: false,
      },
      orderBy: { date: 'asc' },
    });

    try {
      const funnelInstance = (await createClassInstanceByTsContent(scriptContent)) as FunnelScript;
      console.log(
        funnel.status === 'CREATED'
          ? `\nInicializando script de funil ${scriptName}`
          : `Restaurando funil ${funnel.id}`,
      );
      await funnelInstance.initialize({ funnel, newMessages: pendingMessages });
    } catch (error) {
      api.removeMessageListener(funnel.leadPhone);
      localdb.createScriptExecution({
        scriptId: funnel.id,
        stageName: '_scriptExecution',
        automationId: AUTOMATION_ID,
        execSequence: 0,
        cachedResult: null,
        args: JSON.stringify({
          scriptHash: funnel.scriptHash,
          messageIds: chatUpdate.newMessages.map((message) => message.id),
        }),
        execTime: 0,
        error: error.message,
      });
    }
  });
})();
