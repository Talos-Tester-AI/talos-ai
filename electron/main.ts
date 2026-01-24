import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setupHandlers } from './handlers'
import { startAgentServer } from './server'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Fix D-Bus/systemd errors AND blank screen on Linux
if (process.platform === 'linux') {
    // Disable GPU acceleration which causes blank screen on some Linux systems
    app.disableHardwareAcceleration()
    
    // Disable features that cause D-Bus/systemd errors
    app.commandLine.appendSwitch('disable-features', 'MediaSessionService')
    
    // Use software rendering instead of GPU
    app.commandLine.appendSwitch('disable-gpu')
    app.commandLine.appendSwitch('disable-gpu-compositing')
    app.commandLine.appendSwitch('disable-software-rasterizer')
    app.commandLine.appendSwitch('--no-sandbox')
    app.commandLine.appendSwitch('--disable-gpu-sandbox')
    app.commandLine.appendSwitch('--disable-dev-shm-usage')
    
    // Ignore GPU blocklist
    app.commandLine.appendSwitch('ignore-gpu-blocklist')
}

// Ensure single instance to prevent D-Bus conflicts
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
    console.log('Another instance is already running. Exiting.')
    app.quit()
}

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

// Handle second instance - focus existing window
app.on('second-instance', () => {
    if (win) {
        if (win.isMinimized()) win.restore()
        win.focus()
    }
})

function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(process.env.VITE_PUBLIC || '', 'electron-vite.svg'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'),
            nodeIntegration: false,
            contextIsolation: false, // Disabled for Linux compatibility
            webSecurity: false,
        },
    })

    setupHandlers(win)
    startAgentServer(3000, win)

    // Test active push message to Electron-Renderer.
    win.webContents.on('did-finish-load', () => {
        win?.webContents.send('main-process-message', (new Date).toLocaleString())
    })

    // Open DevTools in development
    win.webContents.openDevTools()

    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL)
    } else {
        win.loadFile(path.join(process.env.DIST || '', 'index.html'))
    }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
    win = null
})

// Proper cleanup on quit
app.on('before-quit', () => {
    if (win) {
        win.removeAllListeners()
    }
})

app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

app.whenReady().then(createWindow)
