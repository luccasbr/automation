import { z } from 'zod';
import ApiRestPromptModule from './modules/api-rest/ApiRestPromptModule';
import { IApiRestPromptModule } from './modules/api-rest/IApiRestPromptModule';

export type MessageClassificationArgs = {
  productName: string;
  productDescription: string;
};

export type MessageClassificationTag = {
  name: string;
  description: string;
};

export type MessageClassificationInput = {
  messages: {
    id: string;
    quotedContent?: string;
    content: string;
  }[];
};

export type MessageClassificationExampleInput = {
  chatContext: string;
  availableTags: MessageClassificationTag[];
} & MessageClassificationInput;

export type MessageClassificationOutput = {
  messages: {
    id: string;
    tag: string;
  }[];
};

export default class MessageClassificationPromptTemplate implements IApiRestPromptModule {
  private apiRestPromptTemplate: ApiRestPromptModule;
  private chatContext: string;
  private availableTags: MessageClassificationTag[] = [];

  constructor(args: MessageClassificationArgs) {
    this.chatContext = `A conversa é sobre a venda de um produto chamado "${args.productName}". ${args.productDescription}`;

    this.apiRestPromptTemplate = new ApiRestPromptModule({
      tasks: [
        'Você deve atribuir para cada mensagem as tags disponíveis fornecidas em "availableTags" na requisição',
        'Você deve avaliar "chatContext" fornecido na requisição, para entender o contexto geral da conversa e atribuir as tags',
        'Você deve avaliar "quotedContent", se fornecido, para entender melhor o contexto da mensagem',
        'Mensagens que contém apenas emojis devem ser ignoradas e não podem ser retornadas',
        'As mensagens devem ser retornadas na mesma ordem que foram recebidas',
      ],
      inputModel: z.object({
        chatContext: z.string().describe('O contexto da conversa'),
        availableTags: z
          .array(
            z.object({
              name: z.string().describe('O nome da tag'),
              description: z.string().describe('A descrição da tag'),
            }),
          )
          .describe('As tags disponíveis para serem atribuídas as mensagens'),
        messages: z
          .array(
            z.object({
              id: z.string().describe('O id da mensagem'),
              quotedContent: z
                .string()
                .optional()
                .describe(
                  'O conteúdo da mensagem citada, se houver, pode ser considerado para entender melhor o contexto da mensagem',
                ),
              content: z.string().describe('O conteúdo da mensagem'),
            }),
          )
          .describe('As mensagens recebidas para serem classificadas'),
      }),
      outputModel: z.object({
        messages: z
          .array(
            z.object({
              id: z.string().describe('O id da mensagem classificada'),
              tag: z.string().describe('A tag atribuída a mensagem classificada'),
            }),
          )
          .describe('As mensagens classificadas com suas respectivas tags'),
      }),
    });
  }

  addTag(tag: MessageClassificationTag) {
    this.availableTags.push(tag);
  }

  getTags() {
    return this.availableTags;
  }

  static withBaseExamples(args: MessageClassificationArgs): MessageClassificationPromptTemplate {
    const template = new MessageClassificationPromptTemplate(args);

    template.addTag({
      name: 'delivery_question',
      description: 'Quando a mensagem for uma pergunta sobre a entrega, taxa de entrega, prazo, etc...',
    });

    template.addTag({
      name: 'payment_question',
      description: 'Quando a mensagem for uma pergunta sobre o pagamento, formas de pagamento, juros, etc...',
    });

    template.addTag({
      name: 'greeting',
      description:
        'Quando a mensagem for uma saudação, como "Oi", "Olá", "Tudo bem", "Opa", "Boa noite", "Boa tarde", "Bom dia", etc...',
    });

    template.addTag({
      name: 'neutral_message',
      description: 'Quando a mensagem for uma mensagem neutra, como "Entedi", "Ok", "Tá bom", "Obrigado", etc...',
    });

    template.addTag({
      name: 'out_of_context',
      description:
        'Quando a mensagem não estiver dentro do contexto da conversa, perguntas sem sentido ou qualquer mensagem que não faz sentido para esse produto.',
    });

    /*
    template.addTag({
      name: 'explicit_purchase_intent',
      description:
        'Quando a mensagem for uma intenção explícita de compra do produto, como "quero comprar", "vou querer", "quero a opção 1..2..3", etc...',
    });

    template.addTag({
      name: 'product_price_question',
      description:
        'Quando a mensagem for uma pergunta sobre o preço do produto, como "quanto custa", "qual o preço", "qual o valor" etc... Considere apenas perguntas, não afirmações.',
    });
    */

    template.addExample({
      input: {
        chatContext:
          'A conversa é sobre a venda de um produto chamado "Escova Alisadora 3 em 1". Com a Escova Alisadora 5 em 1, você terá um tratamento completo e eficiente para seus cabelos em um único aparelho. Alise, seque, hidrate, modele e acabe com o frizz em poucos minutos, tudo isso com a facilidade de uma escova.',
        availableTags: template.getTags(),
        messages: [
          {
            id: '7cbede11-16b8-4b27-ae12-8d44bb968450',
            quotedContent: '',
            content: 'Olá',
          },
          {
            id: 'd5c75242-bbe3-4c9f-acd4-6ed7f2ee3df8',
            quotedContent: '',
            content: 'Tudo bem?',
          },
          {
            id: '9751e9dc-6e49-406c-8057-72df4674ea93',
            quotedContent: '',
            content: 'Como funciona ela?',
          },
          {
            id: '146671bc-7b0b-4500-b4be-a1c19656640b',
            quotedContent: '',
            content: 'Quem é o presidente do Brasil?',
          },
          {
            id: '91518e7d-db6f-41d2-9616-38a48ac40708',
            quotedContent: '',
            content: 'showw',
          },
          {
            id: '5c3a58a1-37a9-45fb-b580-4bbb527f0180',
            quotedContent: 'Para a segurança dos nossos clientes, o pagamento é feito só no ato da entrega.',
            content: 'A entrega é mesmo em 24 horas?',
          },
          {
            id: '575531e0-d3b2-40f5-9cc8-165807576f30',
            quotedContent: '',
            content: 'Serve pra cabelo crespo?',
          },
          {
            id: '9c928928-f170-4d1d-abcb-bffded1c17cf',
            quotedContent:
              'No momento não é possível escolher a cor, mas você vai amar a cor que receber, são todas cores neutras.',
            content: 'Meu pintinho amarelinho, cabe aqui na minha mão.',
          },
        ],
      },
      output: {
        messages: [
          {
            id: '7cbede11-16b8-4b27-ae12-8d44bb968450',
            tag: 'greeting',
          },
          {
            id: 'd5c75242-bbe3-4c9f-acd4-6ed7f2ee3df8',
            tag: 'greeting',
          },
          {
            id: '9751e9dc-6e49-406c-8057-72df4674ea93',
            tag: 'product_question',
          },
          {
            id: '146671bc-7b0b-4500-b4be-a1c19656640b',
            tag: 'out_of_context',
          },
          {
            id: '91518e7d-db6f-41d2-9616-38a48ac40708',
            tag: 'neutral_message',
          },
          {
            id: '5c3a58a1-37a9-45fb-b580-4bbb527f0180',
            tag: 'delivery_question',
          },
          {
            id: '575531e0-d3b2-40f5-9cc8-165807576f30',
            tag: 'product_question',
          },
          {
            id: '9c928928-f170-4d1d-abcb-bffded1c17cf',
            tag: 'out_of_context',
          },
        ],
      },
    });

    return template;
  }

  addExample({
    input,
    output,
  }: {
    input: MessageClassificationExampleInput;
    output: MessageClassificationOutput;
  }): void {
    this.apiRestPromptTemplate.addExample({ input, output });
  }

  formatPrompt(input: MessageClassificationInput): Promise<string> {
    return this.apiRestPromptTemplate.formatPrompt({
      chatContext: this.chatContext,
      availableTags: this.availableTags,
      messages: input.messages,
    });
  }

  formatRequestPrompt(input: MessageClassificationInput): Promise<string> {
    return this.apiRestPromptTemplate.formatRequestPrompt({
      chatContext: this.chatContext,
      availableTags: this.availableTags,
      messages: input.messages,
    });
  }

  parseResponse(response: string): Promise<MessageClassificationOutput> {
    return this.apiRestPromptTemplate.parseResponse(response);
  }

  parseAndValidateResponse(response: string): Promise<MessageClassificationOutput> {
    return this.apiRestPromptTemplate.parseAndValidateResponse(response);
  }
}
