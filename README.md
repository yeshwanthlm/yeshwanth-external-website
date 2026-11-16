# yeshwanthlm.in

Personal site of Yeshwanth L M. Plain HTML, CSS and JS (no framework, no build step), hosted on AWS.
Everything in AWS is Terraform (`infra/`).

```
python3 -m http.server 8767 --bind 127.0.0.1
```

## Architecture

```
visitor ─▶ Route 53 ─▶ CloudFront (TLS 1.2+, security headers, redirects) ─▶ private S3 bucket
form    ─▶ API Gateway ─▶ Lambda submit (origin · honeypot · Turnstile · per-IP limit) ─▶ DynamoDB + SES email
/admin  ─▶ Cognito (MFA, admin group) ─▶ API Gateway JWT ─▶ Lambda admin ─▶ DynamoDB
GitHub Actions (OIDC, no keys) ─▶ S3 sync + CloudFront invalidation · hourly YouTube sync
AWS Budget ─▶ email at 80% of $5/month
```

## Where things live

| Path | What |
|---|---|
| `index.html` | page layout |
| `assets/data.js` | all text: about, work, talks, IEEE roles, awards, testimonials, links |
| `assets/videos.json` | YouTube uploads (generated, do not edit by hand) |
| `assets/app.js` | rendering, live terminal, drop-down terminal (`` ` `` or ⌘K) |
| `assets/ping.js` | contact form (Turnstile + API) |
| `assets/admin.js`, `admin/` | private inbox |
| `assets/config.js` | API / Cognito / Turnstile public values (written by `terraform apply`) |
| `assets/boot.js` | theme before paint (keeps the CSP free of inline scripts) |
| `assets/style.css` | design tokens and styles (dark + light, AWS orange accent) |
| `scripts/fetch-videos.mjs` | syncs `assets/videos.json` from the Tech With Yeshwanth channel |
| `infra/site.tf` | S3, CloudFront, ACM, Route 53, security headers |
| `infra/cloudfront/router.js` | www → apex, old URLs → new sections, `/dir/` → `index.html` |
| `infra/main.tf` | contact API, Lambdas, DynamoDB, Cognito, SES |
| `infra/github.tf` | GitHub OIDC deploy role (main branch only) |
| `infra/budget.tf` | monthly spend alert |
| `.github/workflows/deploy.yml` | deploy on push, hourly video sync, manual run |

## First-time setup

1. **Domain**: register or transfer `yeshwanthlm.in` in Route 53 (this creates the hosted zone).
   Keeping another registrar instead? Set `create_hosted_zone = true` and copy output `name_servers` there.
2. **Turnstile**: create a free widget at dash.cloudflare.com → Turnstile, hostname `yeshwanthlm.in`.
   Store the **secret** in SSM (never in Terraform or git):
   `aws ssm put-parameter --name /ylm-site/turnstile-secret --type SecureString --value "<secret>" --region ap-south-1 --profile <profile>`
3. **Variables**: create `infra/terraform.tfvars` (git-ignored):
   ```
   aws_profile        = "<profile>"
   turnstile_site_key = "<site key>"
   ```
4. **Apply**:
   ```
   cd infra
   terraform init
   terraform plan -out=tfplan
   terraform apply tfplan
   ```
5. **Confirm emails**: SES verification link, AWS Budgets subscription, Cognito temporary password.
6. **GitHub**: add repo variables `AWS_ROLE_ARN`, `SITE_BUCKET`, `CF_DISTRIBUTION_ID` from `terraform output`,
   commit the regenerated `assets/config.js`, push to `main`. The workflow uploads the site.
7. **Admin**: open `https://yeshwanthlm.in/admin/`, sign in, set a new password and an authenticator app.

Preview the inbox locally without a backend: `http://127.0.0.1:8767/admin/?demo`.

## YouTube sync

`node scripts/fetch-videos.mjs` refreshes `assets/videos.json` from the public feed (latest 15),
merged into the full list. The workflow runs it hourly and redeploys only when a new upload appears.
