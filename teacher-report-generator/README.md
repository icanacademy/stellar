# 🌟 ICAN STELLAR DAILY REPORT

A modern, AI-powered daily monitoring report generator for teachers with a beautiful space-themed interface.

## ✨ Features

- 🚀 **Modern Space Theme**: Beautiful cosmic design with interactive golden stars
- 🤖 **AI-Powered Narratives**: OpenAI GPT-4o-mini generates comprehensive reports
- 📊 **Notion Integration**: Auto-populate students and teachers from Notion databases
- 🎯 **Interactive Star Ratings**: Click to rate student performance (1-5 stars)
- 📱 **Responsive Design**: Works on desktop, tablet, and mobile
- 🖨️ **Print-Ready**: Professional print formatting
- 📸 **Download as Image**: Save reports as high-quality PNG images
- 🔍 **Searchable Dropdowns**: Find students and teachers quickly

## 🚀 Quick Start

### Option 1: Web Version (Recommended)
```bash
# 1. Clone or download this folder
# 2. Install dependencies
npm install

# 3. Set up environment variables
node setup.js

# 4. Edit .env file with your API keys
# 5. Start the application
npm start

# 6. Open browser to http://localhost:3000
```

### Option 2: Desktop App
```bash
# 1-4. Same as above
# 5. Install Electron dependencies
npm install

# 6. Run as desktop app
npm run electron

# 7. Build installers for all platforms
npm run build-all
```

## 🔧 Configuration

### Required API Keys
1. **OpenAI API Key**: Get from https://platform.openai.com/api-keys
2. **Notion API Key**: Get from https://www.notion.so/my-integrations
3. **Notion Database IDs**: From your student and teacher databases

### Setting Up Notion
1. Create a Notion integration at https://www.notion.so/my-integrations
2. Share your databases with the integration
3. Copy the database IDs from the URLs
4. Make sure your databases have the required columns:
   - **Students**: "Full Name", "Student ID" (or similar)
   - **Teachers**: "Full Name", "ID" (or similar)

## 📋 Environment Variables

Create a `.env` file with:
```env
OPENAI_API_KEY=your_openai_api_key_here
NOTION_API_KEY=your_notion_api_key_here
NOTION_DATABASE_ID=your_student_database_id_here
NOTION_TEACHERS_DATABASE_ID=your_teachers_database_id_here
```

## 🎯 Usage

1. **Select Student**: Type to search or click dropdown arrow
2. **Select Teacher**: Same searchable interface
3. **Choose Class**: 35+ predefined classes or custom option
4. **Rate Performance**: Click stars to rate (1-5) in 6 categories
5. **Add Notes**: Write observations (optional - AI will enhance)
6. **Generate Report**: Click to create professional report
7. **Download/Print**: Save as image or print directly

## 🏗️ Deployment Options

### 1. Web Hosting (Easiest)
- **Netlify**: Drag & drop deployment
- **Vercel**: Connect to GitHub
- **Railway**: Full-stack deployment
- **Heroku**: Cloud hosting

### 2. Desktop Application
- **Windows**: `.exe` installer
- **macOS**: `.dmg` installer  
- **Linux**: `.AppImage` file

### 3. Local Network
- Run on one computer, access from others via IP address
- Perfect for school networks

## 🛠️ Build Commands

```bash
# Development
npm run dev          # Start with auto-reload
npm run electron-dev # Electron with auto-reload

# Production
npm start           # Web version
npm run electron    # Desktop app

# Build Installers
npm run build-win   # Windows installer
npm run build-mac   # macOS installer
npm run build-linux # Linux installer
npm run build-all   # All platforms
```

## 🔒 Security

- API keys stored in environment variables
- No sensitive data in code
- HTTPS ready for production
- CORS configured for security

## 📱 Responsive Design

- **Desktop**: Full-featured interface
- **Tablet**: Optimized layout
- **Mobile**: Touch-friendly controls

## 🎨 Customization

- **Colors**: Edit `css/styles.css`
- **Classes**: Update class list in `index.html`
- **AI Prompts**: Modify prompts in `api.js`
- **Branding**: Change title and styling

## 📞 Support

For issues or questions:
1. Check the console for error messages
2. Verify API keys are correct
3. Ensure Notion databases are shared
4. Check network connectivity

## 🌟 Credits

Built with:
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Express
- **AI**: OpenAI GPT-4o-mini
- **Database**: Notion API
- **Desktop**: Electron
- **Design**: Custom space theme

---

**Made with ❤️ for ICAN Stellar**