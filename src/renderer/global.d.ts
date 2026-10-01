import type { RecordingDocument } from '../shared/types/recording';
import type { TestRunProgress, TestRunResult } from '../shared/types/test-run';
import type { SpecFileSelection, SpecTestProgress, SpecTestResult } from '../shared/types/spec-test';
import type { SecurityAnalysisResult } from '../shared/types/security';

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
      runTest: (startUrl: string | undefined, actions: RecordingDocument['actions']) => Promise<TestRunResult>;
      stopTest: () => Promise<boolean>;
      onTestProgress: (callback: (progress: TestRunProgress) => void) => () => void;
      loadSpecTest: () => Promise<SpecFileSelection | null>;
      runSpecTest: () => Promise<SpecTestResult>;
      stopSpecTest: () => Promise<boolean>;
      onSpecTestProgress: (callback: (progress: SpecTestProgress) => void) => () => void;
      analyzeSecurityHeaders: (url: string) => Promise<SecurityAnalysisResult>;
    };
  }
}
