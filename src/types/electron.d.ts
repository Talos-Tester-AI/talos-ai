export interface ElectronAPI {
    ipcRenderer: {
        send: (channel: string, args: any[]) => void;
        on: (channel: string, func: (...args: any[]) => void) => () => void;
        invoke: (channel: string, ...args: any[]) => Promise<any>;
    };
}

declare global {
    interface Window {
        electron: ElectronAPI;
    }
}
