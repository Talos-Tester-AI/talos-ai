import { contextBridge, ipcRenderer } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('electron', {
    ipcRenderer: {
        send: (channel: string, args: any[]) => ipcRenderer.send(channel, args),
        on: (channel: string, func: (...args: any[]) => void) => {
            const subscription = (_event: any, ...args: any[]) => func(...args)
            ipcRenderer.on(channel, subscription)
            return () => {
                ipcRenderer.removeListener(channel, subscription)
            }
        },
        invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
    },
})
