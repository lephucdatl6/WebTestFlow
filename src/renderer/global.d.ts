export {};

declare global {
  interface Window {
    webTestFlow: {
      launch: () => Promise<void>;
      openUrl: (url: string) => Promise<string>;
      startRecording: () => Promise<void>;
      stopRecording: () => Promise<Array<{
        type: string;
        selector?: string;
        playwright?: string;
        value?: string;
        url?: string;
        description?: string;
      }>>;
      getRecordingActions: () => Promise<Array<{
        type: string;
        selector?: string;
        playwright?: string;
        value?: string;
        url?: string;
        description?: string;
      }>>;
      isBrowserOpen: () => Promise<boolean>;
      close: () => Promise<void>;
      goBack: () => Promise<void>;
      goForward: () => Promise<void>;
      reload: () => Promise<void>;
      click: (selector: string) => Promise<void>;
      fill: (selector: string, value: string) => Promise<void>;
    };
  }
}
