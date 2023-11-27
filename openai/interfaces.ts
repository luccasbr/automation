import { GenerativeResponse } from './types';

export interface GenerativeModel {
  sendMessage(message: string): Promise<GenerativeResponse>;
}
