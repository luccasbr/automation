import { InputMessage } from '../../whatsapp/types/inputMessage';
import {
  OutputAudioContent,
  OutputContactContent,
  OutputFileContent,
  OutputImageContent,
  OutputLocationContent,
  OutputPollContent,
  RetryOutputMessage,
  OutputTextContent,
  OutputVideoContent,
} from '../../whatsapp/types/outputMessage';
import { MsgUtils } from '../../whatsapp/utils';
import { FunnelScriptUtils } from '../funnel/utils';
import { ScriptUtils } from '../utils';

function File<T>(type: T, assetName: string, caption?: string): OutputFileContent<T> {
  return {
    type,
    assetName,
    caption,
  };
}

export function TEXT(content: string): OutputTextContent {
  return {
    type: 'TEXT',
    content,
  };
}

export function IMAGE(assetName: string, caption?: string): OutputImageContent {
  return File('IMAGE', assetName, caption);
}

export function VIDEO(assetName: string, caption?: string): OutputVideoContent {
  return File('VIDEO', assetName, caption);
}

export function AUDIO(assetName: string): OutputAudioContent<'AUDIO'> {
  return File('AUDIO', assetName);
}

export function VOICE(assetName: string): OutputAudioContent<'VOICE'> {
  return File('VOICE', assetName);
}

export function DOCUMENT(assetName: string, caption?: string): OutputFileContent<'DOCUMENT'> {
  return File('DOCUMENT', assetName, caption);
}

export function LOCATION(location: { latitude: number; longitude: number }): OutputLocationContent {
  return {
    type: 'LOCATION',
    ...location,
  };
}

export function CONTACT(contact: { name: string; phone: string }): OutputContactContent {
  return {
    type: 'CONTACT',
    ...contact,
  };
}

export function POLL(question: string, options: string[], allowMultipleAnswers = false): OutputPollContent {
  return {
    type: 'POLL',
    question,
    options,
    allowMultipleAnswers,
  };
}

export function RETRY(
  content: RetryOutputMessage,
  options?: { tag?: string; newTimeoutSeconds?: number },
): RetryOutputMessage {
  options = options || {};

  return {
    ...options,
    ...content,
  };
}

// TODO: talvez migrar para dentro do BaseFunnelScript
export async function GET_QUOTE(message: InputMessage): Promise<InputMessage> | undefined {
  if (message.quoteId && message.funnelId) {
    return FunnelScriptUtils.getMessageFromId(message.quoteId, message.funnelId);
  }
}
