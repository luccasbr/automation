import { GenerativeModel } from './interfaces';
import { GenerativeResponse } from './types';
import OpenAI from 'openai';

export default class GPTChatClient implements GenerativeModel {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async sendMessage(message: string): Promise<GenerativeResponse> {
    const startMs = Date.now();

    const chatCompletion = await this.openai.chat.completions.create({
      messages: [{ role: 'user', content: message }],
      model: 'gpt-3.5-turbo',
    });

    const endMs = Date.now();

    const inputTokens = chatCompletion.usage?.prompt_tokens || 0;
    const outputTokens = chatCompletion.usage?.completion_tokens || 0;

    const inputCost = Number(process.env.GPT3_TURBO_INPUT_TOKEN_PRICE) * (inputTokens / 1000);
    const outputCost = Number(process.env.GPT3_TURBO_OUTPUT_TOKEN_PRICE) * (outputTokens / 1000);
    const totalCost = inputCost + outputCost;

    const brlCost = process.env.OPENAI_COST_BRL === 'true' || false;

    return {
      completion: chatCompletion.choices[0]?.message?.content || '',
      executionTime: endMs - startMs,
      inputTokens,
      outputTokens,
      estimatedCost: {
        inputTokenPrice: Number(process.env.GPT3_TURBO_INPUT_TOKEN_PRICE),
        outputTokenPrice: Number(process.env.GPT3_TURBO_OUTPUT_TOKEN_PRICE),
        inputCost: inputCost * (brlCost ? 5 : 1),
        outputCost: outputCost * (brlCost ? 5 : 1),
        totalCost: totalCost * (brlCost ? 5 : 1),
        currency: brlCost ? 'BRL' : 'USD',
      },
    };
  }
}
