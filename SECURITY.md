# Security Controls — Aurum Operations Platform

> Last updated: 2026-03-23
> Classification: **INTERNAL — CONFIDENTIAL**

This document describes every security control in place across the AOP stack. It is a living document — update it whenever a control is added, changed, or removed.

---

## 1. Input Validation & Injection Prevention

### 1.1 Zod Validation on All API Inputs

Every API endpoint validates its request body/query via a Zod schema. The `validateRequest()` middleware rejects any request that fails validation with `HTTP 400`. Schema files are co-located with each module (`*.schemas.ts`).

### 1.2 SQL Injection Prevention

The API uses **Prisma ORM exclusively** — all DB queries are parameterised by the ORM. Zero raw SQL queries exist. If raw SQL is ever needed, `prisma.$queryRaw` with tagged template literals must be used (Prisma prevents interpolation attacks automatically).

### 1.3 HTML/XSS Sanitisation

Any user-supplied text rendered in PDF documents is sanitised with `sanitize-html` before being passed to the Handlebars/Puppeteer rendering pipeline.

### 1.4 File Upload — Magic Byte Validation

`apps/api/src/modules/documents/document-upload.service.ts`

All uploaded files are validated twice:

1. **Content-Type header check** — MIME type must be in the allowlist (PDF, JPEG, PNG, TIFF)
2. **Magic byte check** — the `file-type` npm package reads the first bytes of the file buffer and confirms the actual file format, independent of the client-supplied MIME type or filename extension

If the detected type does not match the allowlist, the upload is rejected with `HTTP 400` before any processing occurs.

Allowlist: `application/pdf`, `image/jpeg`, `image/png`, `image/tiff`

Additionally, ClamAV antivirus scanning runs before upload to S3. If ClamAV is unavailable (e.g., in local dev), the scan is skipped with a warning.

### 1.5 Path Traversal Prevention

S3 object keys are **always constructed server-side**:

```
documents/{transactionId|clientId|global}/{documentType}/{timestamp}-{sanitisedFilename}
```

The filename is sanitised with `replace(/[^a-zA-Z0-9._-]/g, '_')`. No part of the S3 key comes from user-controlled input.

---

## 2. Authentication Hardening

### 2.1 Password Policy

Enforced via `StrongPasswordSchema` (Zod) in `auth/auth.schemas.ts`:

- Minimum **12 characters**
- At least one **uppercase letter**
- At least one **number**
- At least one **special character**

Applied to: `POST /admin/users`, `POST /auth/reset-password`

### 2.2 Account Lockout

`apps/api/src/auth/auth.service.ts`

After **5 consecutive failed login attempts**, the account is locked for **15 minutes**.

- Redis key: `auth:lockout:{email}` (lowercase)
- Value: integer counter (incremented via `INCR`)
- TTL: 900 seconds (set on first failure)
- On successful login: the lockout key is deleted (`DEL`)
- The lockout check runs **before** the DB lookup to prevent user enumeration

### 2.3 Password Hashing

bcrypt with **salt rounds = 12** is used for all password hashing (`users.service.ts`). A dummy hash comparison is always run even when the user is not found, to prevent timing-based user enumeration.

### 2.4 Refresh Token Rotation

Every call to `POST /auth/refresh` **deletes the old refresh token** (JTI from Redis) and issues a brand-new token pair. Refresh token reuse after rotation will fail with `HTTP 401`.

### 2.5 Token Revocation

All refresh token JTIs are stored in Redis with the key pattern `rt:{userId}:{jti}`. Logout (`POST /auth/logout`) deletes the token from Redis immediately. All tokens for a user can be purged via `deleteAllUserTokens()`.

### 2.6 2FA Temporary Token TTL

`signTempToken()` issues a JWT with type `temp_2fa` and **5-minute TTL** (configured in `lib/jwt.ts`). This token is only accepted by `POST /auth/totp/verify`. Using it elsewhere returns `HTTP 401`.

### 2.7 JWT Secrets

- Access token: `JWT_ACCESS_SECRET` env variable, 15-minute TTL
- Refresh token: `JWT_REFRESH_SECRET` env variable, 7-day TTL
- Both secrets must be set in production (minimum 32 characters)

---

## 3. HTTP Security Headers

Configured via **Helmet.js** in `apps/api/src/app.ts`:

| Header                      | Value                                                                                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Content-Security-Policy`   | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload`                                                                                                                                   |
| `X-Frame-Options`           | `DENY`                                                                                                                                                                           |
| `X-Content-Type-Options`    | `nosniff`                                                                                                                                                                        |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                                                                                                                                                |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=()`                                                                                                                                       |

The Permissions-Policy header is set manually as it is not yet in Helmet core.

---

## 4. Rate Limiting

Implemented with `express-rate-limit` + `rate-limit-redis` (Redis store shared across API instances).

| Endpoint                        | Limit        | Window     | Key                   |
| ------------------------------- | ------------ | ---------- | --------------------- |
| `POST /auth/login`              | 5 requests   | 15 minutes | IP address            |
| `POST /auth/totp/verify`        | 5 requests   | 15 minutes | IP address            |
| `POST /documents` (upload)      | 20 requests  | 1 minute   | Authenticated user ID |
| Sanctions `POST /:id/screening` | 10 requests  | 1 hour     | Authenticated user ID |
| All `GET /api/v1/*`             | 300 requests | 1 minute   | Authenticated user ID |

All rate-limited endpoints return `HTTP 429` with a `Retry-After` header and JSON body:

```json
{ "error": { "code": "RATE_LIMITED", "retryAfter": 900 } }
```

---

## 5. Audit Log Integrity

### 5.1 HMAC Signing

`apps/api/src/middleware/audit.ts`

Every `AuditEvent` record is signed with **HMAC-SHA256**:

```
message = "{entityType}:{entityId}:{action}:{userId}:{timestamp}"
hmacSig = HMAC-SHA256(AUDIT_HMAC_SECRET, message)
```

The signature is stored in the `hmacSig` column of the `audit_events` table.

### 5.2 Tamper Detection

`GET /api/v1/admin/audit/verify` (ADMIN only)

Re-computes the HMAC for every audit record and compares it to the stored signature. Returns:

```json
{
  "total": 1500,
  "valid": 1498,
  "tampered": 0,
  "noSignature": 2,
  "tamperedIds": []
}
```

Any `tampered > 0` result indicates a breach of audit log integrity and should trigger an incident response procedure.

---

## 6. Data Protection

### 6.1 PII Field Encryption (Application Layer)

`apps/api/src/lib/encryption.ts`

PII fields (`nationalId`, `bankAccount`, `email` in sensitive contexts) can be encrypted at the application layer using **AES-256-GCM** before storage:

- Algorithm: AES-256-GCM (authenticated encryption — prevents tampering)
- IV: 96-bit random per encryption
- Key source: `FIELD_ENCRYPTION_KEY` env variable (32 bytes, base64-encoded)
- Format stored: `{ivHex}:{authTagHex}:{ciphertextHex}`

> **Note:** Full migration of existing PII data requires a migration script. Consult the data team before enabling field encryption on a live database.

### 6.2 S3 Security

- SSE-KMS encryption must be enforced on the `aop-documents` S3 bucket (configured via bucket policy, not application code)
- All public access must be blocked at the bucket level
- S3 access logging must be enabled
- Pre-signed download URLs have a **15-minute TTL** (`getSignedDownloadUrl(key, 900)`)
- Every signed URL generation is logged

### 6.3 At-Rest Encryption

AWS RDS (PostgreSQL) with storage encryption enabled (AWS KMS). Configured at infrastructure level via Terraform.

---

## 7. Dependency Security

### 7.1 npm audit in CI

```yaml
# .github/workflows/ci.yml (excerpt)
- run: pnpm audit --severity critical
```

The build fails on any critical vulnerability.

### 7.2 Dependabot

`.github/dependabot.yml` configures weekly automated PRs for:

- npm dependencies
- GitHub Actions
- Docker base images

### 7.3 Docker Image Pinning

All Docker base images are pinned to specific SHA digests in `Dockerfile`:

```dockerfile
FROM node:20-alpine@sha256:<sha>
```

### 7.4 Container Scanning

Trivy is run in CI against all built images:

```yaml
- name: Trivy container scan
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: ${{ steps.meta.outputs.tags }}
    severity: CRITICAL,HIGH
    exit-code: 1
```

---

## 8. CORS Configuration

`apps/api/src/app.ts`

In **production**, only `ALLOWED_ORIGIN` env variable is accepted. The wildcard `*` is never used in production.

```
ALLOWED_ORIGIN=https://app.aurum-ops.example.com
```

- Cross-origin requests from unknown origins receive a CORS error
- `credentials: true` is set to support cookie-based sessions
- In development/test, all origins are allowed for convenience

---

## 9. Secrets Management

### 9.1 Zero Hardcoded Secrets

All secrets come from environment variables or AWS Secrets Manager. Required environment variables:

| Variable                                      | Purpose                                     |
| --------------------------------------------- | ------------------------------------------- |
| `JWT_ACCESS_SECRET`                           | JWT access token signing key                |
| `JWT_REFRESH_SECRET`                          | JWT refresh token signing key               |
| `AUDIT_HMAC_SECRET`                           | Audit log HMAC signing key                  |
| `FIELD_ENCRYPTION_KEY`                        | PII field encryption key (32 bytes, base64) |
| `DATABASE_URL`                                | PostgreSQL connection string                |
| `REDIS_URL`                                   | Redis connection string                     |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | S3 access                                   |
| `SANCTIONS_API_KEY`                           | ComplyAdvantage API key                     |
| `OPEN_EXCHANGE_RATES_APP_ID`                  | Open Exchange Rates key                     |
| `SES_FROM_ADDRESS`                            | AWS SES sender address                      |

### 9.2 git-secrets Pre-commit Hook

Configured to block commits containing patterns matching common secret formats (AWS keys, JWTs, etc.).

### 9.3 Secrets Scanning in CI

TruffleHog is run on every PR to detect accidentally committed secrets:

```yaml
- name: TruffleHog secrets scan
  uses: trufflesecurity/trufflehog@main
  with:
    path: ./
    base: main
```

### 9.4 AWS Secrets Manager (Production)

ECS task definitions reference secrets from AWS Secrets Manager via `secrets:` in the task definition. Secrets are injected as environment variables at container startup. Application code only reads `process.env.*`.

---

## 10. Security Test Coverage

`apps/api/src/__tests__/security.test.ts`

| Test                                           | Expected Result                            |
| ---------------------------------------------- | ------------------------------------------ |
| VIEWER calls `POST /clients/:id/screening`     | HTTP 403                                   |
| OPERATIONS calls `POST /clients/:id/screening` | HTTP 403                                   |
| TRADE_MANAGER calls `POST /admin/users`        | HTTP 403                                   |
| COMPLIANCE_OFFICER calls `PUT /admin/settings` | HTTP 403                                   |
| OPERATIONS accesses `GET /admin/users` (IDOR)  | HTTP 403                                   |
| OPERATIONS accesses `GET /admin/audit` (IDOR)  | HTTP 403                                   |
| Forged JWT signature                           | HTTP 401                                   |
| Missing Authorization header                   | HTTP 401                                   |
| Basic auth scheme (not Bearer)                 | HTTP 401                                   |
| 6th login in 15 minutes                        | HTTP 429 + `Retry-After` header            |
| PHP file uploaded as .pdf                      | HTTP 400 (magic byte mismatch)             |
| EXE bytes uploaded as .jpg                     | HTTP 400 (magic byte mismatch)             |
| Account locked (5+ failures)                   | HTTP 401 with lockout message              |
| Redis lockout counter increments               | `INCR auth:lockout:{email}` called         |
| `X-Content-Type-Options` header                | `nosniff`                                  |
| `X-Frame-Options` header                       | `DENY`                                     |
| `Strict-Transport-Security` header             | `max-age=31536000`                         |
| `Permissions-Policy` header                    | `camera=(), microphone=(), geolocation=()` |
| Weak password (<12 chars)                      | HTTP 400                                   |
| Password without uppercase                     | HTTP 400                                   |
| Password without number                        | HTTP 400                                   |
| Password without special char                  | HTTP 400                                   |

---

## 11. Incident Response

### Suspected Breach

1. Run `GET /api/v1/admin/audit/verify` immediately → check for tampered records
2. Rotate all JWT secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) — this invalidates all sessions
3. Flush Redis (`deleteAllUserTokens()`) for all affected users
4. Review CloudTrail / S3 access logs for unauthorised access
5. Notify DPO within 72 hours if personal data was accessed (GDPR Article 33)

### Credential Compromise

1. Immediately rotate the compromised credential in AWS Secrets Manager
2. ECS service rolling update will pick up new secrets without downtime
3. If `AUDIT_HMAC_SECRET` is compromised, all historical HMAC signatures are invalidated → re-sign using migration script

---

## 12. Security Review Checklist (Pre-Deployment)

- [ ] All env variables set in AWS Secrets Manager
- [ ] `AUDIT_HMAC_SECRET` is a random 256-bit value
- [ ] `FIELD_ENCRYPTION_KEY` is a random 256-bit value (base64 encoded)
- [ ] `ALLOWED_ORIGIN` set to production frontend URL only
- [ ] S3 bucket `aop-documents`: public access blocked, SSE-KMS enabled, access logging on
- [ ] RDS encryption at rest enabled
- [ ] RDS not publicly accessible (VPC-only)
- [ ] Redis (ElastiCache) not publicly accessible, in-transit encryption enabled
- [ ] `npm audit` passes with no critical vulnerabilities
- [ ] Trivy scan passes with no critical/high findings
- [ ] 2FA enabled for all admin accounts
- [ ] `GET /admin/audit/verify` returns `tampered: 0`
- [ ] Load test confirms rate limits hold under concurrent traffic
