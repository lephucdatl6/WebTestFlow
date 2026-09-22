export {};

declare global {
  interface Window {
    webTestFlow: {
      openUrl: (url: string) => Promise<string>;
      goBack: () => Promise<void>;
      goForward: () => Promise<void>;
      reload: () => Promise<void>;
    };
  }
}
