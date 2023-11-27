export type RetryOutputMessage = {
  timeoutIn?: number;
  tag?: string;
} & (OutputMessage | OutputMessage[]);

export type OutputMessage =
  | OutputTextContent
  | OutputImageContent
  | OutputVideoContent
  | OutputAudioContent<'AUDIO' | 'VOICE'>
  | OutputFileContent<'DOCUMENT'>
  | OutputLocationContent
  | OutputContactContent
  | OutputPollContent;

export type OutputTextContent = {
  type: 'TEXT';
  content: string;
};

export type OutputLocationContent = {
  type: 'LOCATION';
  latitude: number;
  longitude: number;
};

export type OutputContactContent = {
  type: 'CONTACT';
  name: string;
  phone: string;
};

export type OutputPollContent = {
  type: 'POLL';
  question: string;
  options: string[];
  allowMultipleAnswers?: boolean;
};

export type OutputVideoContent = OutputFileContent<'VIDEO'>;

export type OutputImageContent = OutputFileContent<'IMAGE'>;

export type OutputAudioContent<T extends 'AUDIO' | 'VOICE'> = Omit<OutputFileContent<T>, 'caption'>;

export type OutputFileContent<T> = {
  type: T;
  assetName: string;
  caption?: string;
};
