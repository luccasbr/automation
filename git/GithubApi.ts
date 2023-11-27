import { IScriptRepository } from './IScriptRepository';
import libaxios from 'axios';
import { ScriptParam } from '../scripting/funnel/types';

export default class GithubApi implements IScriptRepository {
  private static instance: GithubApi;
  private axios = libaxios.create({
    headers: {
      Authorization: `Bearer ${process.env.GIT_ACCESS_TOKEN}`,
    },
    baseURL: `https://api.github.com/repos/${process.env.GIT_OWNER}/${process.env.GIT_REPO}`,
  });

  public static getInstance(): GithubApi {
    if (!GithubApi.instance) {
      GithubApi.instance = new GithubApi();
    }
    return GithubApi.instance;
  }

  async getScriptVersion(options: { authorId: string; fileName: string; releaseHash: string }): Promise<string> {
    const filePath = `scripts/${options.authorId}/${options.fileName}`;

    try {
      const script = await this.axios.get(`/contents/${filePath}/script.ts?ref=${options.releaseHash}`);

      if (script.status === 200) {
        let schema: ScriptParam[] = [];

        return Buffer.from(script.data.content, 'base64').toString('utf-8');
      } else {
        throw new Error(`Status inválido ${script.status}.`);
      }
    } catch (error) {
      throw new Error(
        `Erro ao buscar conteúdo do script ${filePath} na versão ${options.releaseHash}. Detalhes: ${error.message}`,
      );
    }
  }
}
