import { z } from 'zod';
import ApiRestPromptModule from './modules/api-rest/ApiRestPromptModule';
import { IApiRestPromptModule } from './modules/api-rest/IApiRestPromptModule';

export type PersonGender = 'male' | 'female' | 'unknown';

export type PersonNameValidatorOutput = {
  isValid: boolean;
  name: string;
  gender: PersonGender;
};

export default class PersonNameValidatorPromptTemplate implements IApiRestPromptModule {
  private apiRestPromptTemplate: ApiRestPromptModule;

  constructor() {
    this.apiRestPromptTemplate = new ApiRestPromptModule({
      tasks: [
        'Você deve validar se o nome fornecido é um nome de pessoa válido ou não e formatá-lo',
        'Você deve tentar identificar o gênero do nome identificado, as opções são "male", "female" e "unknown"',
        'Se você não tiver 100% de certeza do gênero, você deve considerar o gênero como "unknown"',
        'Nomes unisex devem ser considerados como "unknown"',
        'Você deve desconsiderar caracteres que não façam sentido, foque no nome.',
        'Desde que haja um nome válido de pessoa no texto, você deve considera-lo válido.',
        'Apelidos não são nomes válidos de pessoa, se você conseguir extrair o nome de pessoa de um apelido, considere-o válido.',
      ],
      inputModel: z.object({
        name: z.string().describe('O nome de pessoa a ser validado'),
      }),
      outputModel: z.object({
        isValid: z.boolean().describe('Se é um nome de pessoa válido ou não'),
        name: z.string().describe('O nome de pessoa formatado'),
        gender: z
          .string()
          .describe('O gênero identificado pelo nome da pessoa, pode ser "male", "female" ou "unknown"'),
      }),
    });
  }

  static withBaseExamples(): PersonNameValidatorPromptTemplate {
    const template = new PersonNameValidatorPromptTemplate();

    template.addValidExample('Joaoo da Silva', 'João', 'male');
    template.addValidExample('muriel', 'Muriel', 'unknown');
    template.addValidExample('pedrão zezinho', 'Pedro', 'male');
    template.addValidExample('Cris', 'Cris', 'unknown');
    template.addValidExample('ana MAria Braga', 'Ana', 'female');
    template.addValidExample('feLIPEe 💀', 'Felipe', 'male');
    template.addValidExample('Fernanda', 'Fernanda', 'female');
    template.addValidExample('Gabi', 'Gabi', 'unknown');
    template.addValidExample('jose 💖', 'José', 'male');
    template.addValidExample('Duda', 'Duda', 'unknown');

    template.addInvalidExample('bochecha');
    template.addInvalidExample('rei do pão');
    template.addInvalidExample('mestre do marketing');
    template.addInvalidExample('hamonia doméstica');
    template.addInvalidExample('pirula');
    template.addInvalidExample('🕶️');
    template.addInvalidExample('~');
    template.addInvalidExample('.');
    template.addInvalidExample('x');

    return template;
  }

  addValidExample(name: string, outName: string, gender: PersonGender): void {
    this.addExample({
      name,
      output: {
        isValid: true,
        name: outName,
        gender,
      },
    });
  }

  addInvalidExample(name: string): void {
    this.addExample({
      name,
      output: {
        isValid: false,
        name: '',
        gender: 'unknown',
      },
    });
  }

  addExample({ name, output }: { name: string; output: PersonNameValidatorOutput }): void {
    this.apiRestPromptTemplate.addExample({
      input: {
        name,
      },
      output,
    });
  }

  parseResponse(response: string): Promise<PersonNameValidatorOutput> {
    return this.apiRestPromptTemplate.parseResponse(response);
  }

  parseAndValidateResponse(response: string): Promise<PersonNameValidatorOutput> {
    return this.apiRestPromptTemplate.parseAndValidateResponse(response);
  }

  formatPrompt(name: string): Promise<string> {
    return this.apiRestPromptTemplate.formatPrompt({ name });
  }

  formatRequestPrompt(name: string): Promise<string> {
    return this.apiRestPromptTemplate.formatRequestPrompt({ name });
  }
}
