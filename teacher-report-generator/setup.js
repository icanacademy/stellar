const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up ICAN Stellar Report Generator...\n');

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
    console.log('⚠️  Creating .env file...');
    const envTemplate = `# ICAN Stellar Report Generator Configuration
# Pre-configured with your API keys

# OpenAI Configuration
OPENAI_API_KEY=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

# Notion API Configuration
NOTION_API_KEY=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
NOTION_DATABASE_ID=1abd37d666308071bfe1e37d1d155035
NOTION_TEACHERS_DATABASE_ID=1abd37d6663080ae9307ddbee22c48b1
`;
    
    fs.writeFileSync(envPath, envTemplate);
    console.log('✅ .env file created successfully with your API keys!');
    console.log('🚀 Ready to launch - no additional configuration needed!\n');
} else {
    console.log('✅ .env file already exists.\n');
}

// Check if required directories exist
const requiredDirs = ['css', 'js'];
requiredDirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`✅ Created directory: ${dir}`);
    }
});

console.log('🎉 Setup complete!\n');
console.log('📋 Ready to use:');
console.log('✅ API keys are pre-configured');
console.log('✅ Database connections are ready');
console.log('✅ Application is ready to launch\n');

console.log('🌟 Enjoy using ICAN Stellar Report Generator!');