# AOP Operations Runbook

**Platform:** AWS ECS Fargate · RDS PostgreSQL 15 · ElastiCache Redis 7 · S3 + CloudFront
**Services:** `aop-api` · `aop-web` · `aop-worker`
**On-call rotation:** PagerDuty → `#ops-alerts` Slack channel

---

## Table of Contents

1. [Deployment](#deployment)
2. [Rollback](#rollback)
3. [Database Migrations](#database-migrations)
4. [Accessing Logs](#accessing-logs)
5. [Alarm Response Playbooks](#alarm-response-playbooks)
6. [Database Backup & Restore](#database-backup--restore)
7. [Secrets Rotation](#secrets-rotation)
8. [Useful Commands](#useful-commands)

---

## Deployment

### Normal deployment (automated)

Every push to `main` triggers an automatic staging deployment via the `deploy.yml` workflow.

1. Ensure all CI checks pass on `main` (lint, unit tests, security scan).
2. The `deploy-staging` job runs automatically — monitor it in GitHub Actions.
3. Smoke tests run against the staging URL. Check the Slack `#deployments` channel for the result.

### Promoting staging to production

Production deploys require **manual approval** from a GitHub environment reviewer.

1. Navigate to **GitHub → Actions → Deploy → Run workflow**.
2. Select `environment: production` and optionally specify an `image_tag` (defaults to `latest`).
3. A reviewer must approve the deployment in the GitHub **Environments** page.
4. The workflow runs DB migrations, deploys all three services, waits for stability, then runs a health check.
5. Monitor `#deployments` Slack for success/failure notification.

### Manual ECS deployment (break-glass)

```bash
# Deploy a specific image tag to production API service
aws ecs update-service \
  --cluster aop-prod \
  --service aop-api-prod \
  --force-new-deployment

# Wait for stability
aws ecs wait services-stable \
  --cluster aop-prod \
  --services aop-api-prod aop-web-prod aop-worker-prod
```

---

## Rollback

### Automated rollback via GitHub Actions

Re-run the `deploy.yml` workflow with a known-good `image_tag` (a previous Git SHA):

1. Find the last successful deploy SHA in GitHub Actions history or `#deployments` Slack.
2. Go to **Actions → Deploy → Run workflow**, set `image_tag` to the good SHA.
3. Approve and monitor.

### Manual ECS rollback (< 5 minutes)

ECS keeps the previous task definition revision. To roll back immediately:

```bash
# Get the previous task definition revision
PREV_REVISION=$(aws ecs describe-task-definition \
  --task-definition aop-api-prod \
  --query 'taskDefinition.revision' \
  --output text)
PREV_REVISION=$((PREV_REVISION - 1))

# Update the service to the previous revision
aws ecs update-service \
  --cluster aop-prod \
  --service aop-api-prod \
  --task-definition aop-api-prod:$PREV_REVISION

# Wait for stability
aws ecs wait services-stable \
  --cluster aop-prod \
  --services aop-api-prod
```

Repeat for `aop-web-prod` and `aop-worker-prod` if needed.

### Database rollback

> **Warning:** Rolling back a DB migration is a manual, high-risk operation. Always take a snapshot first.

```bash
# 1. Take a manual RDS snapshot before any rollback
aws rds create-db-snapshot \
  --db-instance-identifier aop-prod-postgres \
  --db-snapshot-identifier aop-pre-rollback-$(date +%Y%m%d%H%M%S)

# 2. Apply down migration (if the migration has a revert)
DATABASE_URL=<prod_url> npx prisma migrate resolve --rolled-back <migration_name>
```

If a revert is not available, restore from the pre-migration snapshot (see [Database Backup & Restore](#database-backup--restore)).

---

## Database Migrations

### Normal migration flow

Migrations run automatically as part of the `deploy.yml` workflow before ECS services are updated. The migration container runs `prisma migrate deploy` (production-safe, no interactive prompts).

### Running migrations manually

```bash
# Connect to the production DB via AWS Session Manager (no public access needed)
aws ssm start-session \
  --target <bastion-instance-id> \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["<rds-endpoint>"],"portNumber":["5432"],"localPortNumber":["5433"]}'

# In a separate terminal, run migrations via the tunnel
DATABASE_URL="postgresql://aop:<password>@localhost:5433/aop" \
  npx prisma migrate deploy
```

### Checking migration status

```bash
DATABASE_URL=<prod_url> npx prisma migrate status
```

### Emergency: skip a failed migration

Only do this if you are certain the migration is safe to skip (e.g., it was already applied manually):

```bash
DATABASE_URL=<prod_url> npx prisma migrate resolve --applied <migration_name>
```

---

## Accessing Logs

### CloudWatch Logs — API

```bash
# Stream live API logs
aws logs tail /aop/api/production --follow --format short

# Search for errors in the last hour
aws logs filter-log-events \
  --log-group-name /aop/api/production \
  --start-time $(date -d '1 hour ago' +%s000) \
  --filter-pattern '{ $.level = "error" }'

# Search by request ID
aws logs filter-log-events \
  --log-group-name /aop/api/production \
  --filter-pattern '{ $.requestId = "req-abc123" }'
```

### CloudWatch Logs Insights — structured queries

```
# Top error routes in last 24h
fields @timestamp, route, statusCode, message
| filter level = "error"
| stats count() by route
| sort count desc
| limit 20
```

```
# Slow requests (> 500ms)
fields @timestamp, route, duration, userId
| filter duration > 500
| sort duration desc
| limit 50
```

### ECS task logs (live container output)

```bash
# Get running task ARN
TASK=$(aws ecs list-tasks --cluster aop-prod --service-name aop-api-prod \
  --query 'taskArns[0]' --output text)

# Follow logs
aws logs tail /aop/api/production --follow
```

### Worker logs

```bash
aws logs tail /aop/worker/production --follow --format short
```

---

## Alarm Response Playbooks

### ALARM: `API-5xx-rate > 1% for 5 minutes`

**Severity:** High — user-facing impact

1. Check CloudWatch Logs for error patterns:
   ```bash
   aws logs filter-log-events \
     --log-group-name /aop/api/production \
     --start-time $(date -d '10 minutes ago' +%s000) \
     --filter-pattern '{ $.statusCode >= 500 }'
   ```
2. Check if a recent deployment is the cause (compare deployment time with alarm start).
3. If deployment-related → **rollback immediately** (see [Rollback](#rollback)).
4. If DB-related (connection errors, timeouts) → check RDS CloudWatch metrics, connection count.
5. If third-party service (LME, email) → check the external service status page; errors may be transient.
6. Acknowledge PagerDuty and post status to `#incidents`.

---

### ALARM: `LME-price-feed-stale > 10 minutes during market hours`

**Market hours:** 06:00–23:00 UTC Mon–Fri (LME trading hours)

**Severity:** High — trading operations blocked

1. Check worker logs for LME polling errors:
   ```bash
   aws logs filter-log-events \
     --log-group-name /aop/worker/production \
     --filter-pattern 'LME'
   ```
2. Check LME API status (reference the API status page stored in `#ops-alerts` channel topic).
3. If LME API is down → trading is blocked by design; notify trading desk; no action needed until API recovers.
4. If worker is crashed → restart the ECS service:
   ```bash
   aws ecs update-service \
     --cluster aop-prod \
     --service aop-worker-prod \
     --force-new-deployment
   ```
5. Verify price updates resume: check `lme_price_records` table or the CloudWatch `lme_price_updated` metric.

---

### ALARM: `RDS-connections > 80% of max_connections`

**Severity:** Medium — degradation risk

1. Check current connection count:
   ```sql
   SELECT count(*), state, wait_event_type, wait_event
   FROM pg_stat_activity
   GROUP BY state, wait_event_type, wait_event
   ORDER BY count DESC;
   ```
2. Identify long-running or idle connections:
   ```sql
   SELECT pid, usename, application_name, state, query_start,
          now() - query_start AS duration, left(query, 100) AS query
   FROM pg_stat_activity
   WHERE state != 'idle'
   ORDER BY duration DESC;
   ```
3. If connections are from ECS tasks → check if a service restart/scale event left orphaned connections; restart the relevant service.
4. If `max_connections` is too low for the current load → increase `max_connections` in the RDS parameter group (requires instance restart) or add PgBouncer.
5. Terminate a specific blocking PID if needed:
   ```sql
   SELECT pg_terminate_backend(<pid>);
   ```

---

### ALARM: `CRITICAL-log-entry` (potential security event)

**Severity:** Critical — treat as a security incident

1. **Do not** resolve until root cause is understood.
2. Retrieve the full log entry:
   ```bash
   aws logs filter-log-events \
     --log-group-name /aop/api/production \
     --filter-pattern '{ $.level = "fatal" || $.level = "critical" }'
   ```
3. Check the `audit_events` table for unusual activity around the same timestamp:
   ```sql
   SELECT * FROM audit_events
   WHERE created_at > now() - interval '30 minutes'
   ORDER BY created_at DESC
   LIMIT 50;
   ```
4. Verify audit log integrity (run the `/api/v1/admin/audit/verify` endpoint as SUPER_ADMIN).
5. If a breach is suspected → engage the security incident response process:
   - Immediately notify CTO and legal.
   - Revoke all active sessions by rotating `JWT_SECRET` (see [Secrets Rotation](#secrets-rotation)).
   - Preserve CloudWatch logs (set retention to `Never expire` on the affected log group).
6. Document in the incident channel with timeline.

---

## Database Backup & Restore

### Automated backups

RDS automated backups are configured for:

- **Retention:** 30 days
- **Backup window:** 01:00–02:00 UTC
- **Point-in-time recovery:** enabled

### List available snapshots

```bash
aws rds describe-db-snapshots \
  --db-instance-identifier aop-prod-postgres \
  --query 'DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime,Status]' \
  --output table
```

### Restore to a point in time

```bash
# Restore to a new RDS instance (does NOT overwrite prod)
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier aop-prod-postgres \
  --target-db-instance-identifier aop-prod-postgres-restored \
  --restore-time 2026-03-23T12:00:00Z

# Wait for the instance to be available
aws rds wait db-instance-available \
  --db-instance-identifier aop-prod-postgres-restored
```

Then update `DATABASE_URL` in the relevant Secrets Manager secret to point to the restored instance and redeploy.

### Manual snapshot before a risky migration

```bash
aws rds create-db-snapshot \
  --db-instance-identifier aop-prod-postgres \
  --db-snapshot-identifier aop-pre-migration-$(date +%Y%m%d%H%M%S)
```

---

## Secrets Rotation

All secrets are stored in **AWS Secrets Manager**. Rotating a secret requires updating both Secrets Manager and the relevant ECS task definition environment variable.

### Rotate JWT_SECRET (invalidates all active sessions)

> This will log out all users immediately. Coordinate with the team before rotating in business hours.

```bash
# Generate new 64-byte hex secret
NEW_SECRET=$(openssl rand -hex 64)

# Update in Secrets Manager
aws secretsmanager put-secret-value \
  --secret-id aop/prod/jwt-secret \
  --secret-string "$NEW_SECRET"

# Force ECS redeployment to pick up the new secret
aws ecs update-service \
  --cluster aop-prod \
  --service aop-api-prod \
  --force-new-deployment
```

### Rotate AUDIT_HMAC_SECRET

> Rotating this key means previously computed HMAC signatures will no longer verify against the new key. The historical audit trail validity is preserved as-is; only new events use the new key.

```bash
NEW_SECRET=$(openssl rand -hex 64)
aws secretsmanager put-secret-value \
  --secret-id aop/prod/audit-hmac-secret \
  --secret-string "$NEW_SECRET"

aws ecs update-service \
  --cluster aop-prod \
  --service aop-api-prod \
  --force-new-deployment
```

### Rotate ENCRYPTION_KEY (PII field encryption)

> **Extreme caution.** Rotating the encryption key requires re-encrypting all PII fields in the database. Do not rotate without a full migration plan.

Contact the engineering lead before rotating this key.

---

## Useful Commands

### Check ECS service status

```bash
aws ecs describe-services \
  --cluster aop-prod \
  --services aop-api-prod aop-web-prod aop-worker-prod \
  --query 'services[*].[serviceName,runningCount,desiredCount,deployments[0].rolloutState]' \
  --output table
```

### Scale a service

```bash
aws ecs update-service \
  --cluster aop-prod \
  --service aop-api-prod \
  --desired-count 4
```

### Check deployed image tag

```bash
aws ecs describe-task-definition \
  --task-definition aop-api-prod \
  --query 'taskDefinition.containerDefinitions[0].image' \
  --output text
```

### Verify audit log integrity

```bash
# Must be run as SUPER_ADMIN with a valid JWT
curl -s -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" \
  https://api.aop.com/api/v1/admin/audit/verify | jq .
```

### One-off Prisma query (via ECS exec)

```bash
# Enable ECS exec if not already enabled on the service
aws ecs update-service \
  --cluster aop-prod \
  --service aop-api-prod \
  --enable-execute-command

TASK=$(aws ecs list-tasks --cluster aop-prod --service-name aop-api-prod \
  --query 'taskArns[0]' --output text)

aws ecs execute-command \
  --cluster aop-prod \
  --task $TASK \
  --container api \
  --interactive \
  --command "/bin/sh"
```

### Export audit log CSV

```bash
curl -s \
  -H "Authorization: Bearer $COMPLIANCE_TOKEN" \
  "https://api.aop.com/api/v1/admin/audit/export?from=2026-01-01&to=2026-03-31" \
  -o audit-export-Q1-2026.csv
```
