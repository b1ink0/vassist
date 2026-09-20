declare module "../gpt-sovits/bootstrap.js" {
  export default class PythonBootstrap {
    constructor(
      logCallback?: (message: string) => void,
      options?: { torchBackend?: string },
    );
    run(): Promise<void>;
  }
}
