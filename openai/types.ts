export type GenerativeResponse = {
  completion: string;
  inputTokens: number;
  outputTokens: number;
  executionTime: number;
  estimatedCost?: {
    inputTokenPrice: number;
    outputTokenPrice: number;
    inputCost: number;
    outputCost: number;
    totalCost: number;
    currency: string;
  };
};
