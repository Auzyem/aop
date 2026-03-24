# Data Map — AOP Personal & Sensitive Data Flows

**Applicable regulations:** GDPR (EU), POPIA (South Africa), AML/FATF, FAIS Act
**Last reviewed:** 2026-03-23
**Owner:** Compliance Officer

---

## Summary Table

| Data Category                       | Source                     | Where Stored                                                                             | Who Can Access                                           | Retention Period                  | Third Parties                               |
| ----------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------- | ------------------------------------------- |
| Client identity (name, national ID) | KYC onboarding             | PostgreSQL `clients` (encrypted fields)                                                  | ADMIN, COMPLIANCE_OFFICER                                | 10 years from last transaction    | Sanctions screening provider                |
| Client contact (email, phone)       | Onboarding                 | PostgreSQL `clients`                                                                     | ADMIN, COMPLIANCE_OFFICER, assigned AGENT                | 10 years from last transaction    | SMTP provider (email delivery), SMS gateway |
| KYC documents                       | Client upload              | S3 `aop-documents` + PostgreSQL `documents`                                              | ADMIN, COMPLIANCE_OFFICER                                | 10 years from last transaction    | None                                        |
| Transaction data                    | Platform operations        | PostgreSQL `transactions`, `phase_history`, `cost_items`, `disbursements`, `settlements` | TRADE_MANAGER, ADMIN, COMPLIANCE_OFFICER, assigned AGENT | 10 years from settlement date     | metals.dev price feed (rate input only)     |
| Audit events                        | System-generated           | PostgreSQL `audit_events`                                                                | SUPER_ADMIN, COMPLIANCE_OFFICER                          | Permanent (no deletion)           | None                                        |
| User credentials                    | User registration          | PostgreSQL `users` (bcrypt hashed, TOTP secret encrypted)                                | SUPER_ADMIN only                                         | Duration of employment + 5 years  | None                                        |
| Agent bank details                  | Agent onboarding           | PostgreSQL `agents` (encrypted at rest)                                                  | SUPER_ADMIN, ADMIN                                       | Duration of licence + 5 years     | None                                        |
| LME prices                          | External feed (metals.dev) | PostgreSQL `lme_price_records`                                                           | All authenticated users                                  | Permanent                         | metals.dev                                  |
| FX rates                            | External feed              | Redis (cache) + PostgreSQL `fx_rates`                                                    | All authenticated users                                  | 90 days in cache; permanent in DB | FX rate provider                            |
| System logs                         | Application runtime        | AWS CloudWatch Logs                                                                      | DevOps, SUPER_ADMIN                                      | 90 days (CloudWatch retention)    | AWS                                         |

---

## PII Fields by Model

### `clients`

| Field                 | Type      | PII Level | Encrypted         | Notes                                 |
| --------------------- | --------- | --------- | ----------------- | ------------------------------------- |
| `fullName`            | String    | Medium    | No                | Business name or individual name      |
| `nationalId`          | String?   | High      | Yes (AES-256-GCM) | National ID / passport number         |
| `miningLicenceNo`     | String?   | Medium    | No                | Public licence number                 |
| `businessRegNo`       | String?   | Medium    | No                | Public company registration           |
| `mobilePhone`         | String?   | Medium    | No                | E.164 format                          |
| `deletionRequestedAt` | DateTime? | —         | No                | GDPR/POPIA deletion request timestamp |

Encryption applied via `apps/api/src/lib/encryption.ts` (`encryptField` / `decryptField`).

### `users`

| Field          | Type    | PII Level | Encrypted        | Notes                           |
| -------------- | ------- | --------- | ---------------- | ------------------------------- |
| `email`        | String  | Medium    | No               | Used for auth + notifications   |
| `passwordHash` | String  | High      | bcrypt (cost 12) | Never returned in API responses |
| `totpSecret`   | String? | High      | AES-256-GCM      | TOTP secret — encrypted at rest |

### `agents`

| Field          | Type    | PII Level | Encrypted         | Notes                 |
| -------------- | ------- | --------- | ----------------- | --------------------- |
| `contactName`  | String  | Medium    | No                | Contact person name   |
| `contactEmail` | String? | Medium    | No                | Contact email         |
| `bankAccount`  | String? | High      | Yes (AES-256-GCM) | Bank account number   |
| `swiftBic`     | String? | Medium    | No                | Public SWIFT/BIC code |

### `audit_events`

| Field       | Type    | Notes                                                         |
| ----------- | ------- | ------------------------------------------------------------- |
| `userId`    | String  | FK to user — links event to a person                          |
| `ipAddress` | String? | May be PII in some jurisdictions                              |
| `userAgent` | String? | Device fingerprint data                                       |
| `newValue`  | JSON    | May contain PII in payload — access restricted to SUPER_ADMIN |

---

## Data Flows to Third Parties

### 1. Sanctions Screening Provider

- **What is sent:** Client full name, nationality, date of birth (where available), national ID
- **When:** On client creation and periodically per scheduled review
- **Provider:** Configured via `SANCTIONS_PROVIDER` env var (mock in dev, live integration in production)
- **Data retained by provider:** Per provider's own data processing agreement (DPA) — DPA must be in place before going live
- **AOP receives back:** Screening status, match details (stored in `sanctions_screenings`)

### 2. Email Provider (AWS SES / SMTP)

- **What is sent:** User email addresses, notification content (which may reference client names or transaction IDs)
- **When:** Login notifications, KYC status updates, LME price alerts, retention review reports, backup verification reports, 2FA codes
- **Provider:** AWS SES (production), nodemailer/SMTP (staging/dev)
- **Data retained by provider:** AWS SES does not retain email content after delivery. Email metadata (recipient, timestamp) retained per AWS standard log retention.

### 3. SMS Gateway (Africa's Talking or equivalent)

- **What is sent:** Client mobile phone number, message content (typically OTP codes or transaction status)
- **When:** Transaction status updates (if `smsOptIn = true`)
- **Provider:** Configured via `SMS_PROVIDER` env var
- **Data retained by provider:** Per provider's DPA

### 4. FX Rate Provider

- **What is sent:** Currency pair identifiers only (e.g., `USD/ZAR`) — no PII
- **When:** Hourly FX rate polling via worker cron job
- **Provider:** Configured via `FX_PROVIDER` env var

### 5. metals.dev Price Feed

- **What is sent:** No data sent — AOP is a consumer only (HTTP GET to `https://api.metals.dev/v1/latest`)
- **When:** SPOT poll every minute during LME market hours (Mon–Fri 06:00–16:30 London time), every 15 minutes outside hours. AM Fix captured at 10:30 UTC Mon–Fri; PM Fix at 15:00 UTC Mon–Fri.
- **Provider:** metals.dev — `METALS_DEV_API_KEY` env var
- **Data returned:** Gold spot price in USD/kg, converted internally to USD/troy oz (`price × 31.1035 / 1000`)

### 6. AWS Infrastructure

The following AWS services process or store AOP data:

| Service             | Data                                          | Notes                                                                    |
| ------------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| RDS (PostgreSQL)    | All persistent data                           | Encrypted at rest (AES-256), in-transit (TLS 1.2+)                       |
| S3                  | KYC documents, generated reports              | Encrypted at rest (SSE-S3), versioning enabled, cross-region replication |
| ElastiCache (Redis) | Session tokens, rate limit counters, FX cache | In-transit TLS, no persistence of sensitive data                         |
| CloudWatch Logs     | Application logs                              | May contain user IDs, IP addresses — 90-day retention                    |
| SES                 | Outbound email                                | See email provider section above                                         |

---

## Data Retention Schedule

| Data Type               | Minimum Retention                | Maximum Retention | Deletion Trigger                            |
| ----------------------- | -------------------------------- | ----------------- | ------------------------------------------- |
| Transaction records     | 10 years (AML/FAIS)              | Permanent         | Manual compliance review after 10 years     |
| KYC records & documents | 10 years (FATF Rec. 11)          | Permanent         | Manual compliance review after 10 years     |
| Audit events            | Permanent                        | Permanent         | Never deleted                               |
| LME price records       | Permanent                        | Permanent         | Never deleted (settlement dispute evidence) |
| User accounts (staff)   | Duration of employment + 5 years | —                 | HR offboarding process                      |
| Application logs        | 90 days                          | 90 days           | CloudWatch auto-expiry                      |
| Redis cache             | TTL-based (minutes to hours)     | —                 | Automatic TTL expiry                        |

---

## Subject Rights Procedures

### Data Subject Access Request (DSAR)

**Who can action:** ADMIN or COMPLIANCE_OFFICER

**API endpoint:** `POST /api/v1/admin/data/export-subject-data`

**Response:** JSON export of all personal data held for the specified client, including identity, KYC records, sanctions screenings, transaction history, and documents.

**SLA:** 30 days from receipt of verified request (GDPR Art. 12 / POPIA Sec. 23).

### Deletion Request

**Who can action:** ADMIN or COMPLIANCE_OFFICER

**API endpoint:** `POST /api/v1/admin/data/request-deletion`

**Behaviour:**

1. Sets `client.deletionRequestedAt` timestamp.
2. Returns a response explaining AML retention constraints.
3. If the client has transactional records, immediate deletion is **not possible** — AML/FATF requires 10-year retention.
4. A COMPLIANCE_OFFICER must review the request manually and communicate the outcome to the data subject.
5. For clients with no transactional records, eligible non-transactional PII (e.g., contact details) may be anonymised within 30 days.

**SLA:** 30 days from receipt of verified request, with a possible 2-month extension for complex cases.

---

## Data Protection Impact Assessment (DPIA) — Required For

The following changes require a DPIA review before implementation:

- Adding new PII fields to any model
- Sending new categories of data to third parties
- Changing the retention period for any category
- Implementing automated decision-making affecting data subjects (e.g., auto-rejecting KYC based on risk score)
- Cross-border data transfers to jurisdictions outside South Africa / EU adequacy list

Contact the Compliance Officer to initiate a DPIA before beginning work on any of the above.
