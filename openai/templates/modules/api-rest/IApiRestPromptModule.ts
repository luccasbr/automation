export interface IApiRestPromptModule {
  addExample(example: any): void;
  formatPrompt(input: any): Promise<string>;
  formatRequestPrompt(input: any): Promise<string>;
  parseResponse(response: string): Promise<any>;
  parseAndValidateResponse(response: string): Promise<any>;
}
