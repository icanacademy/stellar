# 🔐 Setting Up Permanent ngrok URLs for Stellar

## Quick Summary
You need 3 static domains to have permanent URLs for your Stellar apps.

---

## ✅ Step-by-Step Process

### **1. Upgrade Your Plan** (Required)
- **Go to:** https://dashboard.ngrok.com/billing/subscription
- **Recommended:** Personal Plan ($8/month) - includes 3 static domains
- **Complete the upgrade**

---

### **2. Reserve Your 3 Static Domains**
- **Go to:** https://dashboard.ngrok.com/domains
- **Click:** "+ New Domain" or "+ Create Domain"
- **Create 3 domains** (suggested names):
  ```
  teacher-report-stellar.ngrok.io
  student-viewer-stellar.ngrok.io
  report-card-stellar.ngrok.io
  ```

  *You can choose any names you want - these are just examples!*

---

### **3. Update Your Configuration**

Once you have your 3 reserved domains:

1. **Edit the DOMAINS.txt file:**
   ```bash
   cd /Users/icanacademy/Stellar
   nano DOMAINS.txt
   ```

2. **Replace the placeholder domains with your actual domains:**
   ```
   TEACHER_DOMAIN=teacher-report-stellar.ngrok.io
   STUDENT_DOMAIN=student-viewer-stellar.ngrok.io
   REPORT_CARD_DOMAIN=report-card-stellar.ngrok.io
   ```
   Save and exit (Ctrl+X, then Y, then Enter)

3. **Run the update script:**
   ```bash
   ./update-ngrok-domains.sh
   ```

---

### **4. Restart with Your New Permanent URLs**

Stop your current ngrok (Ctrl+C), then restart:
```bash
./start-with-ngrok.sh
```

Your apps will now be accessible at your permanent URLs! 🎉

---

## 🌍 What You Get

**Before (Free Plan):**
- ❌ URLs like: `https://abc123.ngrok-free.app`
- ❌ Changes every restart
- ❌ Hard to share

**After (Paid Plan):**
- ✅ URLs like: `https://teacher-report-stellar.ngrok.io`
- ✅ **Never changes** - same URL forever
- ✅ Easy to bookmark and share
- ✅ Professional looking

---

## 💰 Cost Breakdown

| Plan | Price | Static Domains | Best For |
|------|-------|----------------|----------|
| Free | $0 | 0 | Testing only |
| **Personal** | **$8/month** | **3** | **Perfect for you!** ✅ |
| Pro | $20/month | 10 | Multiple projects |
| Business | $45/month | 50+ | Large organizations |

---

## 🆘 Troubleshooting

### "Domain already in use"
- Someone else already reserved that domain name
- Try a different name with your organization name

### "Not authorized to use domains"
- Make sure you've upgraded your plan
- Refresh the domains page after upgrading

### Config not updating?
- Make sure you edited DOMAINS.txt correctly
- Check for typos in domain names
- Run: `ngrok config check` to validate

---

## 📞 Need Help?

1. Check ngrok docs: https://ngrok.com/docs/network-edge/domains-and-tcp-addresses/
2. Check your subscription: https://dashboard.ngrok.com/billing
3. View your domains: https://dashboard.ngrok.com/domains

---

**✨ Once set up, your URLs will be permanent and never change again!**
