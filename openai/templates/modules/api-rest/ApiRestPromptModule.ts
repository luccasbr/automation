import { z } from "zod";
import fs from "fs-extra";
import { zodToJsonSchema } from "zod-to-json-schema";

type ApiRestExampleModuleInput = {
  prefix?: string;
  input: any;
  output: any;
};

type ApiRestPromptModuleOptions = {
  tasks: string[];
  inputModel: z.ZodType<any, z.ZodTypeDef, any>;
  outputModel: z.ZodType<any, z.ZodTypeDef, any>;
};

export default class ApiRestPromptModule {
  public static instructionTemplate: string;
  public static exampleTemplate: string;
  public static requestTemplate: string;

  private tasks: string[];
  private inputModel: z.ZodType<any, z.ZodTypeDef, any>;
  private outputModel: z.ZodType<any, z.ZodTypeDef, any>;
  private examples: ApiRestExampleModuleInput[] = [];

  constructor(args: ApiRestPromptModuleOptions) {
    this.tasks = args.tasks;
    this.inputModel = args.inputModel;
    this.outputModel = args.outputModel;
  }

  public addExample(example: ApiRestExampleModuleInput) {
    this.examples.push(example);
  }

  public async formatPrompt(input?: any) {
    if (!ApiRestPromptModule.instructionTemplate) {
      ApiRestPromptModule.instructionTemplate = await fs.readFile(
        `${__dirname}/prompts/instruction.txt`,
        "utf-8"
      );
    }

    if (!ApiRestPromptModule.exampleTemplate) {
      ApiRestPromptModule.exampleTemplate = await fs.readFile(
        `${__dirname}/prompts/example.txt`,
        "utf-8"
      );
    }

    if (!ApiRestPromptModule.requestTemplate) {
      ApiRestPromptModule.requestTemplate = await fs.readFile(
        `${__dirname}/prompts/request.txt`,
        "utf-8"
      );
    }

    const inModel = JSON.stringify(zodToJsonSchema(this.inputModel));
    const outModel = JSON.stringify(zodToJsonSchema(this.outputModel));
    const request = input
      ? ApiRestPromptModule.requestTemplate
          .replace("{{additional_instructions}}", "")
          .replace("{{input}}", JSON.stringify(input))
      : undefined;
    const examples = this.examples
      .map((example, index) => {
        return ApiRestPromptModule.exampleTemplate
          .replace("{{prefix}}", example.prefix ? ` ${example.prefix}` : "")
          .replace("{{number}}", `${index + 1}`)
          .replace("{{input}}", JSON.stringify(example.input))
          .replace("{{output}}", JSON.stringify(example.output));
      })
      .join("\n\n");

    return `${ApiRestPromptModule.instructionTemplate
      .replace("{{taks}}", this.tasks.map((task) => `* ${task}`).join("\n"))
      .replace("{{inputModel}}", inModel)
      .replace("{{outputModel}}", outModel)}${
      examples ? `\n\n${examples}` : ""
    }${request ? `\n\n${request}` : ""}`;
  }

  public async formatRequestPrompt(
    input: any,
    additionalInstructions?: string[]
  ) {
    if (!ApiRestPromptModule.requestTemplate) {
      ApiRestPromptModule.requestTemplate = await fs.readFile(
        `${__dirname}/prompts/request.txt`,
        "utf-8"
      );
    }

    let template = ApiRestPromptModule.requestTemplate;

    if (!additionalInstructions) {
      template = template.replace("{{additional_instructions}}", "");
    } else {
      let formattedInstructions = "\n## Additional instructions:\n";
      formattedInstructions += additionalInstructions
        .map((instruction) => `* ${instruction}`)
        .join("\n");
      template = template.replace(
        "{{additional_instructions}}",
        `${formattedInstructions}\n`
      );
    }

    return template.replace("{{request_input}}", JSON.stringify(input));
  }

  public parseResponse(response: string) {
    const json = response.match(/{(.+)}/s)?.[1] || response;

    try {
      return JSON.parse(`{${json}}`);
    } catch (error) {
      throw new Error(
        `Response does not contain a valid JSON object: ${response}.\nError: ${error}`
      );
    }
  }

  public parseAndValidateResponse(response: string) {
    return this.outputModel.parse(this.parseResponse(response));
  }
}
