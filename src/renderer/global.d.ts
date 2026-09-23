export {};

declare global {
  interface Window {
    webTestFlow: {
      launch: () => Promise<void>;
      openUrl: (url: string) => Promise<string>;
      close: () => Promise<void>;
      goBack: () => Promise<void>;
      goForward: () => Promise<void>;
      reload: () => Promise<void>;
      click: (selector: string) => Promise<void>;
      fill: (selector: string, value: string) => Promise<void>;
    };
  }
}
