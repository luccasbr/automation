export type ScriptExecution = {
  scriptId: string;
  automationId: string;
  stageName?: string;
  funcName?: string;
  execSequence: number;
  args: string;
  cachedResult?: string;
  internal: boolean;
  error?: string;
  execTime: number;
  executedAt: number;
};

export type ScriptExecutionCreateDto = Optional<Omit<ScriptExecution, 'executedAt'>, 'internal'>;
