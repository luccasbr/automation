export interface IScriptRepository {
  getScriptVersion(options: { authorId: string; fileName: string; releaseHash: string }): Promise<string>;
}
