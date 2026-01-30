import electron from 'electron'
const { contextBridge, ipcRenderer } = electron

// --------- Expose some API to the Renderer process ---------
// Try contextBridge first, fallback to window if contextIsolation is disabled
try {
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
} catch (error) {
    // If contextIsolation is disabled, attach directly to window (Linux workaround)
    ; (window as any).electron = {
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
    }
}
