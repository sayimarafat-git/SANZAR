# Deployment Guide

## Prerequisites
- GitHub repository (already set up)
- Cloudflare account with Workers and API token
- Node.js, Flutter, and Android SDK installed locally (optional for manual builds)

## Steps to Deploy

1. **Push code to GitHub**
   - Ensure your local `main` branch is up to date.
   - Commit any local changes:
     ```bash
     git add .
     git commit -m "Your commit message"
     git push origin main
     ```

2. **GitHub Actions CI/CD**
   - The workflow in `.github/workflows/ci-cd.yml` runs automatically on each push to `main`.
   - It will:
     - Install Flutter and Android SDK.
     - Build the Flutter mobile APK (`apps/mobile/Build/Apk/release`).
     - Build the Next.js admin app (`apps/admin`).
     - Deploy the Cloudflare Worker API using `wrangler.toml`.

3. **Cloudflare Worker Configuration**
   - Ensure the following variables are set as **GitHub repository secrets** (Settings → Secrets → Actions):
     - `WRANGLER_API_TOKEN` – Cloudflare API token with Workers permissions.
     - `WRANGLER_ACCOUNT_ID` – your Cloudflare account ID.
   - The `wrangler.toml` file (located at `apps/api/wrangler.toml`) defines the route:
     ```toml
     name = "sanzar-api"
     compatibility_date = "2024-09-01"

     [[routes]]
     pattern = "/*"
     service = "api"
     ```
   - The Worker expects environment variables:
     - `FIREBASE_PROJECT_ID` – Firebase project ID for token verification.
     - `SUPER_ADMIN_EMAILS` – comma‑separated list of admin emails.
     - `ALLOWED_ORIGINS` – comma‑separated CORS origins.
     - `APP_ENV` – `dev`, `staging`, or `production`.

4. **Optional Front‑end Deployments**
   - If you want the admin UI hosted on Vercel or Netlify, add the corresponding token as a secret (`VERCEL_TOKEN` or `NETLIFY_TOKEN`) and uncomment the relevant step in the GitHub Actions workflow.

5. **Verify Deployment**
   - After a successful run, the API will be live at the Cloudflare subdomain assigned to your Worker (e.g., `https://<your‑worker‑subdomain>.workers.dev`).
   - Test the endpoint with:
     ```bash
     curl https://<your‑worker‑subdomain>.workers.dev/health
     ```
   - The response should be `{"status":"ok"}`.

## Troubleshooting
- **Flutter not found**: Ensure the `flutter` binary is in the runner’s `PATH`. The workflow installs Flutter automatically.
- **Android SDK missing**: The workflow installs the required platforms and build‑tools.
- **Deployment fails**: Check the GitHub Actions logs for detailed error messages. Verify that the Cloudflare secrets are correctly set and that the `wrangler.toml` route matches your Worker.

---

*This guide assumes the repository has already been created and authentication tokens are configured. Follow the steps above to push your code and let the CI/CD pipeline handle the rest.*