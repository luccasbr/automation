import { ScriptArg } from '../funnel/types';

export type Initiator = {
  phone: string;
  name: string;
};

export type StartupScript = { version?: number } & (ScriptWithAnyName | ScriptWithId);

export type ScriptWithId = {
  scriptId: string;
  params?: ScriptArg[];
  scriptName?: never;
};

export type ScriptWithAnyName = {
  scriptName: string;
  params?: ScriptArg[];
  scriptId?: never;
};

// TODO: exemplo para gerar tipagem dinamic conforme o script
/*type ScriptParamTemplate<K, V> = {
  key: K;
  value: V;
};

type ScriptWithNameA = {
  scriptName: 'A';
  params?: AScriptParam[];
};

type AScriptParam = ScriptParamTemplate<'name', string> | ScriptParamTemplate<'age', number>;

const a: ScriptWithNameA = {
  scriptName: 'A',
  params: [
    { key: 'age', value: 12 },
    { key: 'age', value: 18 },
  ],
};*/
