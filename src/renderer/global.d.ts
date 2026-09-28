import type { RecordingDocument } from '../shared/types/recording';

export {};

declare global {
  interface Window {
    webTestFlow: {
      launch: () => Promise<void>;
      openUrl: (url: string) => Promise<string>;
      startRecording: () => Promise<string | undefined>;
      stopRecording: () => Promise<RecordingDocument['actions']>;
      getRecordingActions: () => Promise<RecordingDocument['actions']>;
      isBrowserOpen: () => Promise<boolean>;
      close: () => Promise<void>;
      goBack: () => Promise<void>;
      goForward: () => Promise<void>;
      reload: () => Promise<void>;
      click: (selector: string) => Promise<void>;
      fill: (selector: string, value: string) => Promise<void>;
      saveRecording: (document: RecordingDocument) => Promise<boolean>;
      loadRecording: () => Promise<RecordingDocument | null>;
      generatePlaywrightTest: (name: string, startUrl: string | undefined, actions: RecordingDocument['actions']) => Promise<string>;
    };
  }
}
