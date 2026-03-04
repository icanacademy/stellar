const { app, BrowserWindow, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let mainWindow;
let serverProcess;

function createWindow() {
    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false
        },
        icon: path.join(__dirname, 'assets/icon.png'), // Add icon if you have one
        title: 'ICAN STELLAR DAILY REPORT',
        show: false // Don't show until ready
    });

    // Start the Express server
    serverProcess = spawn('node', ['api.js'], {
        cwd: __dirname,
        stdio: 'inherit'
    });

    // Wait a bit for server to start, then load the app
    setTimeout(() => {
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.show();
    }, 3000);

    // Open DevTools in development
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    // Handle window closed
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
    // Kill the server process
    if (serverProcess) {
        serverProcess.kill();
    }
    
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Create application menu
const template = [
    {
        label: 'File',
        submenu: [
            {
                label: 'New Report',
                accelerator: 'CmdOrCtrl+N',
                click: () => {
                    if (mainWindow) {
                        mainWindow.reload();
                    }
                }
            },

            {
                label: 'Quit',
                accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                click: () => {
                    app.quit();
                }
            }
        ]
    },
    {
        label: 'Edit',
        submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' }
        ]
    },
    {
        label: 'View',
        submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
        ]
    },
    {
        label: 'Help',
        submenu: [
            {
                label: 'About ICAN STELLAR DAILY REPORT',
                click: () => {
                    const { dialog } = require('electron');
                    dialog.showMessageBox(mainWindow, {
                        type: 'info',
                        title: 'About',
                        message: 'ICAN STELLAR DAILY REPORT',
                        detail: 'Version 1.0.0\nDaily monitoring report generator with AI-powered narrative generation.'
                    });
                }
            }
        ]
    }
];

// Set application menu
Menu.setApplicationMenu(Menu.buildFromTemplate(template));

// Handle app errors
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});