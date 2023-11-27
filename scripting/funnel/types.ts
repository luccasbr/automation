import { FunnelStatus } from '@prisma/client';

export type ScriptEndStatus = Extract<FunnelStatus, 'COMPLETED' | 'CANCELED'>;

export type NextStage = {
  stageName: string;
  metadata?: Record<string, any>;
  authorization: string;
};

export type ScriptArg = {
  key: string;
  value: string | number | boolean | string[];
};

export type ScriptParam = {
  key: string;
  name: string;
  description?: string;
  required?: boolean;
} & (
  | TextScriptParam
  | TextListScriptParam
  | NumberScriptParam
  | LogicScriptParam
  | WebhookScriptParam
  | VarScriptParam
);

export type TEXT = 'TEXT';
export type TEXT_LIST = 'TEXT_LIST';
export type NUMBER = 'NUMBER';
export type LOGIC = 'LOGIC';
export type WEBHOOK = 'WEBHOOK';
export type VAR = 'VAR';

export type ScriptParamType = TEXT | TEXT_LIST | NUMBER | LOGIC | WEBHOOK;

export type TextScriptParam = {
  type: 'TEXT';
  defaultValue?: string;
};

export type TextListScriptParam = {
  type: 'TEXT_LIST';
  defaultValue?: string[];
};

export type NumberScriptParam = {
  type: 'NUMBER';
  defaultValue?: number;
};

export type LogicScriptParam = {
  type: 'LOGIC';
  defaultValue?: boolean;
};

export type WebhookScriptParam = {
  type: 'WEBHOOK';
  defaultValue?: string;
};

export type VarScriptParam = {
  type: 'VAR';
};
