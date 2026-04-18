/**
 * GHOST PROTOCOL — Electron Builder Configuration
 */
module.exports = {
  appId: 'com.moner.ghost-protocol',
  productName: 'GHOST PROTOCOL',
  copyright: 'Copyright (c) 2026 MONER INTELLIGENCE SYSTEMS',

  directories: {
    output: 'release',
    buildResources: 'build',
  },

  files: [
    'dist/**/*',
    'electron/**/*',
    'package.json',
  ],

  // Include tray icon in the build
  extraResources: [
    {
      from: 'src/assets/sea-wave-monster.png',
      to: 'assets/tray-icon.png',
    },
  ],

  extraMetadata: {
    main: 'electron/main.cjs',
  },

  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    artifactName: '${productName}-${version}-Setup.${ext}',
    icon: 'src/assets/sea-wave-monster.ico',
    signAndEditExecutable: false,
  },

  // Disable code signing entirely (no certificate)
  forceCodeSigning: false,

  nsis: {
    oneClick: false,
    perMachine: true,
    allowToChangeInstallationDirectory: true,
    installerIcon: 'src/assets/sea-wave-monster.ico',
    uninstallerIcon: 'src/assets/sea-wave-monster.ico',
    installerHeaderIcon: 'src/assets/sea-wave-monster.ico',
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'GHOST PROTOCOL',
  },

  // For better-sqlite3 native module
  electronDownload: {
    cache: './cache',
  },

  // Rebuild native modules for Electron
  npmRebuild: true,

  // Additional build configuration
  asar: true,
  compression: 'maximum',
};
