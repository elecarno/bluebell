const { app, shell, BrowserWindow, ipcMain, dialog } = require('electron')
const { join } = require('path')
const { electronApp, optimizer, is } = require('@electron-toolkit/utils')
const fs = require('fs')
const path = require('path')
import icon from '../../resources/icon.png?asset' // This may also need to be adjusted depending on your build setup
const Store = require('electron-store')

const store = new Store()
let designatedFolder = store.get('dataFolder') || ''

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1800,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})


// --- Folder IPC ---
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (!result.canceled && result.filePaths.length > 0) {
    designatedFolder = result.filePaths[0]
    store.set('dataFolder', designatedFolder)
    return designatedFolder
  }
  return null
})

ipcMain.handle('get-folder-path', () => {
  return designatedFolder || null
})

ipcMain.handle('read-json', async (_e, filename) => {
  if (!designatedFolder) throw new Error('Folder not set')
  const filePath = path.join(designatedFolder, filename)
  if (!fs.existsSync(filePath)) return null
  const data = fs.readFileSync(filePath, 'utf-8')
  return data  // Return raw JSON string, so renderer can parse
})

ipcMain.handle('write-json', async (_e, filename, jsonData) => {
  if (!designatedFolder) throw new Error('Folder not set')
  const filePath = path.join(designatedFolder, filename)
  fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf-8')
  return true
})