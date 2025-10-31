declare global {
  interface Window {
    __privyAccessToken: string | null;
    toast?: {
      success: (message: string) => void;
      error: (message: string) => void;
      info: (message: string) => void;
      warning: (message: string) => void;
    };
  }
}

export {};