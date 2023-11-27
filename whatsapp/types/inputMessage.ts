export type InputMessage = Readonly<
  InputCommonContent &
    (
      | InputTextContent
      | InputImageContent
      | InputVideoContent
      | InputAudioContent<'AUDIO' | 'VOICE'>
      | InputDocumentContent
      | InputLocationContent
      | InputContactContent
      | InputPollContent
      | InputUnknownContent
    )
>;

export type InputCommonContent = {
  id: string;
  funnelId: string;
  date: Date;
  quoteId?: string;
  processed: boolean;
};

export type InputUnknownContent = {
  type: 'UNKNOWN';
};

export type InputTextContent = {
  type: 'TEXT';
  content: string;
};

export type InputLocationContent = {
  type: 'LOCATION';
  latitude: number;
  longitude: number;
};

export type InputContactContent = {
  type: 'CONTACT';
  name: string;
  phone: string;
};

export type InputPollContent = {
  type: 'POLL';
  question: string;
  options: string[];
};

export type InputVideoContent = InputFileContent<'VIDEO'>;

export type InputImageContent = {
  width: number;
  height: number;
} & InputFileContent<'IMAGE'>;

export type InputAudioContent<T extends 'AUDIO' | 'VOICE'> = {
  duration: number;
} & Omit<InputFileContent<T>, 'caption'>;

export type InputDocumentContent = {
  fileName: string;
} & InputFileContent<'DOCUMENT'>;

export type InputFileContent<T> = {
  type: T;
  fileId: string;
  mimetype: string;
  caption?: string;
  fileSize: number;
};
