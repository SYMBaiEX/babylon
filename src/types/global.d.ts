declare global {
  interface Window {
    __privyAccessToken: string | null;
  }
}

export {};