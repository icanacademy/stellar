const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🍎 Creating Mac .app bundle...\n');

const createMacApp = () => {
    const appName = 'ICAN Stellar Report Generator';
    const appDir = `${appName}.app`;
    const contentsDir = `${appDir}/Contents`;
    const macosDir = `${contentsDir}/MacOS`;
    const resourcesDir = `${contentsDir}/Resources`;
    
    // Create directory structure
    if (fs.existsSync(appDir)) {
        fs.rmSync(appDir, { recursive: true, force: true });
    }
    
    fs.mkdirSync(appDir);
    fs.mkdirSync(contentsDir);
    fs.mkdirSync(macosDir);
    fs.mkdirSync(resourcesDir);
    
    // Create Info.plist
    const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>${appName}</string>
    <key>CFBundleDisplayName</key>
    <string>${appName}</string>
    <key>CFBundleIdentifier</key>
    <string>com.ican.stellar.report</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleExecutable</key>
    <string>launcher</string>
    <key>CFBundleIconFile</key>
    <string>app-icon</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>`;
    
    fs.writeFileSync(`${contentsDir}/Info.plist`, infoPlist);
    
    // Create launcher script
    const launcher = `#!/bin/bash
# Get the directory containing this script
DIR="$( cd "$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
APP_DIR="$DIR/../../.."

# Change to the app directory
cd "$APP_DIR"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    osascript -e 'display dialog "Node.js is not installed!\\n\\nPlease install Node.js from https://nodejs.org/ and try again." with title "ICAN Stellar Report Generator" buttons {"OK"} default button "OK" with icon caution'
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    osascript -e 'display dialog "Installing dependencies...\\n\\nThis may take a few minutes." with title "ICAN Stellar Report Generator" buttons {"OK"} default button "OK" with icon note' &
    npm install
    if [ $? -ne 0 ]; then
        osascript -e 'display dialog "Failed to install dependencies!\\n\\nPlease check your internet connection and try again." with title "ICAN Stellar Report Generator" buttons {"OK"} default button "OK" with icon caution'
        exit 1
    fi
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    node setup.js
    osascript -e 'display dialog "Configuration file created!\\n\\nPlease edit the .env file with your API keys, then run the app again." with title "ICAN Stellar Report Generator" buttons {"OK"} default button "OK" with icon note'
    open .env
    exit 1
fi

# Start the application
osascript -e 'display dialog "Starting ICAN Stellar Report Generator...\\n\\nThe app will open in your default browser." with title "ICAN Stellar Report Generator" buttons {"OK"} default button "OK" with icon note giving up after 3'

# Open in default browser
sleep 2
open "http://localhost:3000"

# Start the server
npm start`;
    
    fs.writeFileSync(`${macosDir}/launcher`, launcher);
    execSync(`chmod +x "${macosDir}/launcher"`);
    
    // Create a simple icon (text-based)
    const createIcon = () => {
        try {
            // Create a simple text-based icon using Apple's built-in tools
            const iconScript = `#!/bin/bash
# Create a simple app icon
mkdir -p app-icon.iconset
# Create different sizes (simplified - normally you'd use actual image files)
for size in 16 32 64 128 256 512; do
    # This is a placeholder - in a real app you'd use actual PNG files
    touch "app-icon.iconset/icon_\${size}x\${size}.png"
done
# Convert to .icns (this requires actual image files)
# iconutil -c icns app-icon.iconset
`;
            
            // For now, we'll skip the icon creation as it requires actual image files
            console.log('⚠️  Icon creation skipped (requires image files)');
        } catch (error) {
            console.log('⚠️  Could not create icon:', error.message);
        }
    };
    
    createIcon();
    
    console.log(`✅ Mac app bundle created: ${appName}.app`);
    console.log('📝 To use: Double-click the .app file');
    console.log('🔒 If macOS blocks it, right-click and select "Open"');
    
    return appDir;
};

// Create the Mac app
createMacApp();

console.log('\n🎉 Mac .app bundle created successfully!');
console.log('\n📋 Next steps:');
console.log('1. Double-click the .app file to run');
console.log('2. If blocked by macOS, right-click → Open');
console.log('3. Install Node.js if prompted');
console.log('4. Edit .env file with your API keys');
console.log('5. Run the app again');
console.log('\n🌟 The app will then work with a simple double-click!');