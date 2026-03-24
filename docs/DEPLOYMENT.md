# AOP Deployment Guide — Go Live

Complete step-by-step instructions to provision infrastructure, deploy the application, and go live.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Bootstrap Terraform State Backend](#2-bootstrap-terraform-state-backend)
3. [Create ECR Repositories](#3-create-ecr-repositories)
4. [Register Your Domain & Route 53 Hosted Zone](#4-register-your-domain--route-53-hosted-zone)
5. [Configure Terraform Variables](#5-configure-terraform-variables)
6. [Provision Infrastructure with Terraform](#6-provision-infrastructure-with-terraform)
7. [Build & Push Docker Images](#7-build--push-docker-images)
8. [Configure Application Secrets in AWS](#8-configure-application-secrets-in-aws)
9. [Set Up AWS SES (Email)](#9-set-up-aws-ses-email)
10. [Configure GitHub Secrets](#10-configure-github-secrets)
11. [Configure GitHub Environments](#11-configure-github-environments)
12. [Set Up OIDC Trust Between GitHub and AWS](#12-set-up-oidc-trust-between-github-and-aws)
13. [Run the First Database Migration & Seed](#13-run-the-first-database-migration--seed)
14. [Deploy Staging](#14-deploy-staging)
15. [Deploy Production](#15-deploy-production)
16. [DNS Cutover](#16-dns-cutover)
17. [Post-Go-Live Checklist](#17-post-go-live-checklist)

---

## 1. Prerequisites

Install and configure the following tools before starting.

### Required tools

| Tool       | Minimum version | Install                                                                                                           |
| ---------- | --------------- | ----------------------------------------------------------------------------------------------------------------- |
| AWS CLI    | v2              | `brew install awscli` / [aws docs](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) |
| Terraform  | 1.6+            | `brew install terraform` / [terraform.io](https://developer.hashicorp.com/terraform/downloads)                    |
| Docker     | 24+             | [docker.com](https://docs.docker.com/get-docker/)                                                                 |
| pnpm       | 8+              | `npm install -g pnpm`                                                                                             |
| GitHub CLI | 2+              | `brew install gh`                                                                                                 |
| jq         | any             | `brew install jq`                                                                                                 |

### AWS account setup

1. Create an AWS account (or use an existing one).
2. Create an IAM user or use AWS SSO. The credentials used during bootstrapping need broad permissions (`AdministratorAccess` is simplest for initial setup; scope down after provisioning).
3. Configure your CLI:
   ```bash
   aws configure
   # AWS Access Key ID: <your key>
   # AWS Secret Access Key: <your secret>
   # Default region: us-east-1
   # Default output format: json
   ```
4. Verify access:
   ```bash
   aws sts get-caller-identity
   ```

### Verify region access

`us-east-1` (N. Virginia) is available by default — no opt-in required.

---

## 2. Bootstrap Terraform State Backend

Terraform stores state in S3 and uses DynamoDB for locking. These resources must exist before running `terraform init`.

```bash
# Create the S3 state bucket (versioning + encryption required)
aws s3 mb s3://aop-terraform-state --region us-east-1

aws s3api put-bucket-versioning \
  --bucket aop-terraform-state \
  --versioning-configuration Status=Enabled \
  --region us-east-1

aws s3api put-bucket-encryption \
  --bucket aop-terraform-state \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms"
      }
    }]
  }' \
  --region us-east-1

# Block all public access
aws s3api put-public-access-block \
  --bucket aop-terraform-state \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
  --region us-east-1

# Create the DynamoDB locks table
aws dynamodb create-table \
  --table-name aop-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

echo "State backend ready."
```

---

## 3. Create ECR Repositories

Three repositories are needed — one per service.

```bash
REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

for REPO in aop-api aop-web aop-worker; do
  aws ecr create-repository \
    --repository-name "$REPO" \
    --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=KMS \
    --region "$REGION" 2>/dev/null && echo "Created $REPO" || echo "$REPO already exists"
done

echo "ECR base URI: ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
```

Record your account ID — you'll need it throughout this guide:

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION="us-east-1"
export ECR_BASE="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
```

---

## 4. Register Your Domain & Route 53 Hosted Zone

### Option A — Domain already registered elsewhere (e.g. GoDaddy, Namecheap)

1. Create a hosted zone in Route 53:
   ```bash
   aws route53 create-hosted-zone \
     --name "yourdomain.com" \
     --caller-reference "$(date +%s)"
   ```
2. Note the four NS records that are returned.
3. Log in to your domain registrar and update the nameservers to the four NS values from Route 53.
4. Propagation can take up to 48 hours, but is usually under 30 minutes.

### Option B — Register domain via Route 53

Use the AWS console: **Route 53 → Domains → Register domain**.

### Get your Zone ID

```bash
aws route53 list-hosted-zones --query "HostedZones[?Name=='yourdomain.com.'].Id" --output text
# Output: /hostedzone/Z1234567890ABCDEF
# Strip the prefix: Z1234567890ABCDEF
```

---

## 5. Configure Terraform Variables

### Create staging tfvars

```bash
cp infra/dev.tfvars.example infra/staging.tfvars
```

Edit `infra/staging.tfvars`:

```hcl
aws_region   = "us-east-1"
project_name = "aop"
vpc_cidr     = "10.0.0.0/16"

# DNS — use a subdomain for staging
domain_name     = "staging.yourdomain.com"
route53_zone_id = "Z1234567890ABCDEF"   # from Step 4

# Alerting
alert_email = "devops@yourdomain.com"

# Container images — placeholder; updated by CI after first push
api_container_image    = "123456789012.dkr.ecr.us-east-1.amazonaws.com/aop-api:latest"
worker_container_image = "123456789012.dkr.ecr.us-east-1.amazonaws.com/aop-worker:latest"

# ECS task sizing (staging: moderate)
api_cpu    = 512
api_memory = 1024
worker_cpu = 256
worker_memory = 512

# RDS
db_instance_class       = "db.t3.medium"
db_allocated_storage_gb = 20

# ElastiCache
redis_node_type = "cache.t3.micro"
```

### Create production tfvars

```bash
cp infra/dev.tfvars.example infra/production.tfvars
```

Edit `infra/production.tfvars`:

```hcl
aws_region   = "us-east-1"
project_name = "aop"
vpc_cidr     = "10.0.0.0/16"

domain_name     = "yourdomain.com"      # apex domain for production
route53_zone_id = "Z1234567890ABCDEF"

alert_email = "devops@yourdomain.com"

api_container_image    = "123456789012.dkr.ecr.us-east-1.amazonaws.com/aop-api:latest"
worker_container_image = "123456789012.dkr.ecr.us-east-1.amazonaws.com/aop-worker:latest"

# ECS task sizing (production: full)
api_cpu    = 1024
api_memory = 2048
worker_cpu = 512
worker_memory = 1024

# RDS (production: larger instance, more storage)
db_instance_class       = "db.r6g.large"
db_allocated_storage_gb = 100

# ElastiCache (production)
redis_node_type = "cache.r6g.large"
```

> **Important:** Add both `*.tfvars` files to `.gitignore` — they may contain sensitive values in future iterations.

```bash
echo "infra/staging.tfvars" >> .gitignore
echo "infra/production.tfvars" >> .gitignore
```

---

## 6. Provision Infrastructure with Terraform

### Initialise

```bash
cd infra
terraform init
```

### Provision staging

```bash
terraform workspace new staging
terraform workspace select staging

terraform plan -var-file=staging.tfvars -out=staging.plan
# Review the plan carefully — ~50–70 resources will be created.
terraform apply staging.plan
```

This will take 15–25 minutes (RDS, ElastiCache, CloudFront distributions take time to provision).

### Capture outputs

```bash
terraform output -json > ../infra-outputs-staging.json
cat ../infra-outputs-staging.json | jq '.'
```

Key values you'll need:

```bash
# Staging
STAGING_ECS_CLUSTER=$(terraform output -raw ecs_cluster_name)
STAGING_ALB_DNS=$(terraform output -raw alb_dns_name)
STAGING_CF_DOMAIN=$(terraform output -raw cloudfront_domain)
STAGING_DB_SECRET_ARN=$(terraform output -raw db_secret_arn)

echo "ECS cluster: $STAGING_ECS_CLUSTER"
echo "ALB DNS:     $STAGING_ALB_DNS"
echo "CloudFront:  $STAGING_CF_DOMAIN"
```

### Provision production (after staging is verified)

```bash
terraform workspace new production
terraform workspace select production

terraform plan -var-file=production.tfvars -out=production.plan
terraform apply production.plan

# Capture production outputs
PROD_ECS_CLUSTER=$(terraform output -raw ecs_cluster_name)
PROD_ALB_DNS=$(terraform output -raw alb_dns_name)
PROD_CF_DOMAIN=$(terraform output -raw cloudfront_domain)
PROD_DB_SECRET_ARN=$(terraform output -raw db_secret_arn)
```

---

## 7. Build & Push Docker Images

This is a one-time manual push to seed ECR before CI takes over.

### Authenticate Docker to ECR

```bash
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  "${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com"
```

### Build images (from repo root)

```bash
cd /path/to/aop   # repo root

# API
docker build -f docker/api.Dockerfile \
  -t "${ECR_BASE}/aop-api:latest" \
  -t "${ECR_BASE}/aop-api:initial" .

# Web
docker build -f docker/web.Dockerfile \
  -t "${ECR_BASE}/aop-web:latest" \
  -t "${ECR_BASE}/aop-web:initial" .

# Worker
docker build -f docker/worker.Dockerfile \
  -t "${ECR_BASE}/aop-worker:latest" \
  -t "${ECR_BASE}/aop-worker:initial" .
```

### Push to ECR

```bash
docker push "${ECR_BASE}/aop-api:latest"
docker push "${ECR_BASE}/aop-api:initial"

docker push "${ECR_BASE}/aop-web:latest"
docker push "${ECR_BASE}/aop-web:initial"

docker push "${ECR_BASE}/aop-worker:latest"
docker push "${ECR_BASE}/aop-worker:initial"
```

### Update Terraform variables with real image URIs

Edit `infra/staging.tfvars` and `infra/production.tfvars` and replace the placeholder ECR URIs with the real ones:

```hcl
api_container_image    = "123456789012.dkr.ecr.us-east-1.amazonaws.com/aop-api:latest"
worker_container_image = "123456789012.dkr.ecr.us-east-1.amazonaws.com/aop-worker:latest"
```

Then re-apply Terraform so ECS picks up the real images:

```bash
cd infra
terraform workspace select staging
terraform apply -var-file=staging.tfvars
```

---

## 8. Configure Application Secrets in AWS

The application reads secrets from AWS Secrets Manager at runtime. The database secret is created automatically by Terraform. You need to create the remaining application secrets.

### Database credentials (created by Terraform — verify)

```bash
# Staging
aws secretsmanager get-secret-value \
  --secret-id "${STAGING_DB_SECRET_ARN}" \
  --query SecretString --output text | jq '.'
# Should contain: { "username": "...", "password": "...", "host": "...", "port": 5432, "dbname": "..." }
```

### Create application secrets

Replace `<staging|production>` and fill in real values.

```bash
ENV="staging"   # change to "production" for prod

# JWT signing secret (generate a strong random secret)
JWT_SECRET=$(openssl rand -base64 48)

aws secretsmanager create-secret \
  --name "aop/${ENV}/jwt-secret" \
  --description "JWT signing secret for AOP ${ENV}" \
  --secret-string "${JWT_SECRET}" \
  --region us-east-1

# metals.dev API key
aws secretsmanager create-secret \
  --name "aop/${ENV}/metals-dev-api-key" \
  --description "metals.dev gold price API key" \
  --secret-string '{"METALS_DEV_API_KEY":"your-metals-dev-api-key-here"}' \
  --region us-east-1

# SMS provider credentials (e.g. Twilio / Africa's Talking)
aws secretsmanager create-secret \
  --name "aop/${ENV}/sms-credentials" \
  --description "SMS provider credentials" \
  --secret-string '{"SMS_API_KEY":"...","SMS_SENDER_ID":"AOP"}' \
  --region us-east-1

# Sanctions screening API key
aws secretsmanager create-secret \
  --name "aop/${ENV}/sanctions-api-key" \
  --description "Sanctions/AML screening API key" \
  --secret-string '{"SANCTIONS_API_KEY":"your-key-here"}' \
  --region us-east-1
```

> The ECS task definition (created by Terraform) must reference these ARNs via `secrets` in the container definition. Verify `infra/modules/compute/main.tf` has the correct secret ARNs injected as environment variables.

---

## 9. Set Up AWS SES (Email)

SES is used for transactional emails (KYC notifications, alerts, GDPR reports).

### Verify sender email/domain

```bash
# Verify a sending domain (recommended for production)
aws ses verify-domain-identity \
  --domain "yourdomain.com" \
  --region us-east-1

# This returns a TXT record value — add it to Route 53:
# Name: _amazonses.yourdomain.com
# Type: TXT
# Value: <the returned verification token>
```

Or verify a single email address for testing:

```bash
aws ses verify-email-identity \
  --email-address no-reply@yourdomain.com \
  --region us-east-1
# A verification email will be sent — click the link.
```

### Request production access (remove sandbox)

New AWS accounts start in SES sandbox mode — you can only send to verified addresses.

To go live, request production access via the AWS console:
**SES → Account dashboard → Request production access**

Fill in the form (use case: transactional, daily volume estimate, bounce/complaint handling). AWS typically approves within 24 hours.

---

## 10. Configure GitHub Secrets

All secrets are stored in **GitHub → repo → Settings → Secrets and variables → Actions**.

Go to your repository on GitHub, then navigate to **Settings → Secrets and variables → Actions → New repository secret** for each entry below, or use the GitHub CLI:

```bash
gh secret set SECRET_NAME --body "secret-value"
```

### Shared secrets (used by both CI and CD)

| Secret name                | Value                                                         |
| -------------------------- | ------------------------------------------------------------- |
| `AWS_REGION`               | `us-east-1`                                                   |
| `AWS_CI_ROLE_ARN`          | IAM role ARN for CI (ECR push) — created in Step 12           |
| `AWS_DEPLOY_ROLE_ARN`      | IAM role ARN for staging deploys — created in Step 12         |
| `AWS_PROD_DEPLOY_ROLE_ARN` | IAM role ARN for production deploys — created in Step 12      |
| `ECR_API_REPO`             | `aop-api`                                                     |
| `ECR_WEB_REPO`             | `aop-web`                                                     |
| `ECR_WORKER_REPO`          | `aop-worker`                                                  |
| `CODECOV_TOKEN`            | From [codecov.io](https://codecov.io) after linking your repo |
| `SLACK_DEPLOY_WEBHOOK`     | Slack incoming webhook URL for deploy notifications           |

### Staging secrets

| Secret name                  | Value                                  | How to get                                                    |
| ---------------------------- | -------------------------------------- | ------------------------------------------------------------- |
| `STAGING_ECS_CLUSTER`        | ECS cluster name                       | `terraform output ecs_cluster_name` (staging workspace)       |
| `STAGING_API_SERVICE`        | `aop-staging-api`                      | Check ECS console or `aws ecs list-services --cluster <name>` |
| `STAGING_WEB_SERVICE`        | `aop-staging-web`                      | Same as above                                                 |
| `STAGING_WORKER_SERVICE`     | `aop-staging-worker`                   | Same as above                                                 |
| `STAGING_URL`                | `https://staging.yourdomain.com`       | Your staging domain                                           |
| `STAGING_RDS_INSTANCE_ID`    | RDS instance identifier                | AWS console → RDS → DB identifier                             |
| `STAGING_MIGRATION_TASK_DEF` | ECS task definition ARN for migrations | See below                                                     |
| `STAGING_NETWORK_CONFIG`     | JSON network config for ECS run-task   | See below                                                     |

### Production secrets

| Secret name               | Value                                    |
| ------------------------- | ---------------------------------------- |
| `PROD_ECS_CLUSTER`        | ECS cluster name (production workspace)  |
| `PROD_API_SERVICE`        | `aop-production-api`                     |
| `PROD_WEB_SERVICE`        | `aop-production-web`                     |
| `PROD_WORKER_SERVICE`     | `aop-production-worker`                  |
| `PROD_URL`                | `https://yourdomain.com`                 |
| `PROD_RDS_INSTANCE_ID`    | Production RDS instance identifier       |
| `PROD_MIGRATION_TASK_DEF` | Production migration task definition ARN |
| `PROD_NETWORK_CONFIG`     | Production JSON network config           |

### How to get the migration task definition ARN

```bash
aws ecs list-task-definitions \
  --family-prefix "aop-staging-migrate" \
  --sort DESC \
  --query "taskDefinitionArns[0]" \
  --output text \
  --region us-east-1
```

### How to get the network config JSON

The migration ECS task needs to run in a private subnet with the API security group:

```bash
# Get private subnet IDs
SUBNET_IDS=$(aws ec2 describe-subnets \
  --filters "Name=tag:Name,Values=aop-staging-private-*" \
  --query "Subnets[*].SubnetId" \
  --output json | jq -r 'join(",")' \
  --region us-east-1)

# Get API security group ID
SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=tag:Name,Values=aop-staging-api" \
  --query "SecurityGroups[0].GroupId" \
  --output text \
  --region us-east-1)

# Construct the JSON string
echo "{\"awsvpcConfiguration\":{\"subnets\":[$(echo $SUBNET_IDS | sed 's/,/","/g' | sed 's/^/"/' | sed 's/$/"/')],\"securityGroups\":[\"${SG_ID}\"],\"assignPublicIp\":\"DISABLED\"}}"
```

---

## 11. Configure GitHub Environments

GitHub Environments gate deployments and store environment-specific secrets.

```bash
# Create staging environment (auto-deploys — no reviewers required)
gh api repos/:owner/:repo/environments/staging \
  --method PUT \
  --field deployment_branch_policy='{"protected_branches":false,"custom_branch_policies":true}'

gh api repos/:owner/:repo/environments/staging/deployment-branch-policies \
  --method POST \
  --field name=main

# Create production environment (requires manual approval)
gh api repos/:owner/:repo/environments/production \
  --method PUT \
  --field deployment_branch_policy='{"protected_branches":true,"custom_branch_policies":false}'
```

To add required reviewers to the production environment:

1. Go to **GitHub → repo → Settings → Environments → production**
2. Under **Required reviewers**, add the team leads who can approve production deployments
3. Check **Prevent self-review**

---

## 12. Set Up OIDC Trust Between GitHub and AWS

The CI/CD workflows use OIDC (no long-lived AWS credentials stored in GitHub).

### Create the OIDC identity provider in AWS

```bash
# Add GitHub as an OIDC provider (only needed once per AWS account)
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

### Create IAM roles

Replace `YOUR_GITHUB_ORG` and `YOUR_REPO_NAME` with your GitHub organisation/username and repo name.

```bash
GITHUB_ORG="YOUR_GITHUB_ORG"
REPO="YOUR_REPO_NAME"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"

# ── CI Role (ECR push from any branch) ──────────────────────────────────────
cat > /tmp/ci-trust.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "${OIDC_ARN}" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike":   { "token.actions.githubusercontent.com:sub": "repo:${GITHUB_ORG}/${REPO}:*" }
    }
  }]
}
EOF

aws iam create-role \
  --role-name aop-github-ci \
  --assume-role-policy-document file:///tmp/ci-trust.json

# Attach ECR push permissions
aws iam attach-role-policy \
  --role-name aop-github-ci \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser

# ── Staging Deploy Role ───────────────────────────────────────────────────────
cat > /tmp/staging-deploy-trust.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "${OIDC_ARN}" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:${GITHUB_ORG}/${REPO}:environment:staging"
      }
    }
  }]
}
EOF

aws iam create-role \
  --role-name aop-github-deploy-staging \
  --assume-role-policy-document file:///tmp/staging-deploy-trust.json

# Attach ECS + RDS + Secrets permissions (use managed policies or create custom)
aws iam attach-role-policy --role-name aop-github-deploy-staging --policy-arn arn:aws:iam::aws:policy/AmazonECS_FullAccess
aws iam attach-role-policy --role-name aop-github-deploy-staging --policy-arn arn:aws:iam::aws:policy/AmazonRDSFullAccess

# ── Production Deploy Role ───────────────────────────────────────────────────
cat > /tmp/prod-deploy-trust.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "${OIDC_ARN}" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:${GITHUB_ORG}/${REPO}:environment:production"
      }
    }
  }]
}
EOF

aws iam create-role \
  --role-name aop-github-deploy-production \
  --assume-role-policy-document file:///tmp/prod-deploy-trust.json

aws iam attach-role-policy --role-name aop-github-deploy-production --policy-arn arn:aws:iam::aws:policy/AmazonECS_FullAccess
aws iam attach-role-policy --role-name aop-github-deploy-production --policy-arn arn:aws:iam::aws:policy/AmazonRDSFullAccess
```

### Get the role ARNs and save as GitHub secrets

```bash
CI_ROLE=$(aws iam get-role --role-name aop-github-ci --query Role.Arn --output text)
STAGING_ROLE=$(aws iam get-role --role-name aop-github-deploy-staging --query Role.Arn --output text)
PROD_ROLE=$(aws iam get-role --role-name aop-github-deploy-production --query Role.Arn --output text)

gh secret set AWS_CI_ROLE_ARN --body "$CI_ROLE"
gh secret set AWS_DEPLOY_ROLE_ARN --body "$STAGING_ROLE"
gh secret set AWS_PROD_DEPLOY_ROLE_ARN --body "$PROD_ROLE"

echo "CI role:              $CI_ROLE"
echo "Staging deploy role:  $STAGING_ROLE"
echo "Prod deploy role:     $PROD_ROLE"
```

---

## 13. Run the First Database Migration & Seed

Before the first deployment, the database schema must be created.

### Option A — Via ECS run-task (recommended for production-like environments)

```bash
# Run migrations as a one-off ECS task (staging example)
aws ecs run-task \
  --cluster "${STAGING_ECS_CLUSTER}" \
  --task-definition "aop-staging-migrate" \
  --launch-type FARGATE \
  --network-configuration "${STAGING_NETWORK_CONFIG}" \
  --overrides '{
    "containerOverrides": [{
      "name": "migrate",
      "command": ["pnpm", "--filter", "@aop/db", "migrate:deploy"]
    }]
  }' \
  --region us-east-1
```

Wait for the task to complete:

```bash
aws ecs wait tasks-stopped \
  --cluster "${STAGING_ECS_CLUSTER}" \
  --tasks <task-arn-from-above> \
  --region us-east-1
```

### Option B — Via SSM tunnel (direct Prisma CLI access)

If you have SSM Session Manager access to a bastion or can run the API container locally with the production DATABASE_URL:

```bash
# Get DB connection string from Secrets Manager
DB_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id "${STAGING_DB_SECRET_ARN}" \
  --query SecretString --output text)

DB_HOST=$(echo $DB_SECRET | jq -r .host)
DB_PORT=$(echo $DB_SECRET | jq -r .port)
DB_NAME=$(echo $DB_SECRET | jq -r .dbname)
DB_USER=$(echo $DB_SECRET | jq -r .username)
DB_PASS=$(echo $DB_SECRET | jq -r .password)

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Run migrations
DATABASE_URL="${DATABASE_URL}" pnpm --filter @aop/db migrate:deploy

# Seed initial data (creates admin user, roles, reference data)
DATABASE_URL="${DATABASE_URL}" pnpm --filter @aop/db seed
```

### Verify the schema

```bash
# Quick table count check
psql "${DATABASE_URL}" -c "\dt" | wc -l
```

---

## 14. Deploy Staging

With infrastructure provisioned, images pushed, and the database migrated, you're ready to deploy.

### Set remaining GitHub secrets

Set all remaining staging secrets from Step 10:

```bash
# Get ECS service names
aws ecs list-services \
  --cluster "${STAGING_ECS_CLUSTER}" \
  --region us-east-1 \
  --query "serviceArns[*]" \
  --output text

gh secret set STAGING_ECS_CLUSTER --body "${STAGING_ECS_CLUSTER}"
gh secret set STAGING_API_SERVICE --body "aop-staging-api"
gh secret set STAGING_WEB_SERVICE --body "aop-staging-web"
gh secret set STAGING_WORKER_SERVICE --body "aop-staging-worker"
gh secret set STAGING_URL --body "https://staging.yourdomain.com"
gh secret set AWS_REGION --body "us-east-1"
```

### Trigger staging deploy

Push to `main` — the `deploy-staging` job in `deploy.yml` triggers automatically:

```bash
git push origin main
```

Or manually trigger from GitHub Actions:

```bash
gh workflow run deploy.yml --ref main
```

### Monitor the deployment

```bash
# Watch ECS service stabilise
aws ecs wait services-stable \
  --cluster "${STAGING_ECS_CLUSTER}" \
  --services aop-staging-api aop-staging-web aop-staging-worker \
  --region us-east-1

echo "Staging is live."
```

### Run smoke tests

```bash
# Health check
curl -sf "https://staging.yourdomain.com/api/health" | jq '.'

# Expected:
# { "status": "ok", "version": "...", "db": "connected", "redis": "connected" }
```

---

## 15. Deploy Production

Production deployments require a manual approval via the GitHub Environment gate.

### Set production GitHub secrets

```bash
gh secret set PROD_ECS_CLUSTER     --body "${PROD_ECS_CLUSTER}"
gh secret set PROD_API_SERVICE     --body "aop-production-api"
gh secret set PROD_WEB_SERVICE     --body "aop-production-web"
gh secret set PROD_WORKER_SERVICE  --body "aop-production-worker"
gh secret set PROD_URL             --body "https://yourdomain.com"
# Set PROD_RDS_INSTANCE_ID, PROD_MIGRATION_TASK_DEF, PROD_NETWORK_CONFIG similarly
```

### Run production migration

```bash
# Same as Step 13 but using production cluster and secret ARN
PROD_DB_SECRET_ARN=$(cd infra && terraform workspace select production && terraform output -raw db_secret_arn)

# ... repeat migration steps from Step 13 with production values
```

### Trigger production deploy

```bash
gh workflow run deploy.yml \
  --ref main \
  --field environment=production
```

GitHub will pause the workflow at the `deploy-production` job and wait for an approver from the configured reviewers list to click **Review deployments → Approve**.

---

## 16. DNS Cutover

### Point your domain to CloudFront

CloudFront is the user-facing entry point. Add a CNAME (or ALIAS for apex domains) in Route 53:

```bash
# Get your CloudFront domain
CF_DOMAIN="${PROD_CF_DOMAIN}"   # e.g. d1234abcd.cloudfront.net

# Apex domain — use Route 53 ALIAS record (not CNAME)
aws route53 change-resource-record-sets \
  --hosted-zone-id "Z1234567890ABCDEF" \
  --change-batch "{
    \"Changes\": [{
      \"Action\": \"UPSERT\",
      \"ResourceRecordSet\": {
        \"Name\": \"yourdomain.com\",
        \"Type\": \"A\",
        \"AliasTarget\": {
          \"HostedZoneId\": \"Z2FDTNDATAQYW2\",
          \"DNSName\": \"${CF_DOMAIN}\",
          \"EvaluateTargetHealth\": false
        }
      }
    }]
  }"
```

> The CloudFront hosted zone ID `Z2FDTNDATAQYW2` is a fixed AWS constant for all CloudFront distributions.

### Verify DNS propagation

```bash
# Check from multiple DNS resolvers
dig +short yourdomain.com @8.8.8.8
dig +short yourdomain.com @1.1.1.1

# Should return the CloudFront domain or its resolved IP
nslookup yourdomain.com
```

### Verify TLS certificate

```bash
curl -sv "https://yourdomain.com/api/health" 2>&1 | grep "SSL certificate"
# Should show: * SSL certificate verify ok.
```

---

## 17. Post-Go-Live Checklist

Work through this checklist after DNS has propagated and production is serving traffic.

### Health & connectivity

- [ ] `GET https://yourdomain.com/api/health` returns `{ "status": "ok", "db": "connected", "redis": "connected" }`
- [ ] Login flow works end-to-end
- [ ] Create a test client, run through KYC steps
- [ ] Create a test transaction, verify settlement calculation

### Infrastructure

- [ ] CloudWatch dashboards show healthy metrics (CPU, memory, 5xx rate = 0)
- [ ] RDS automated backups are enabled (check AWS console → RDS → Maintenance & backups)
- [ ] CloudTrail is recording in `us-east-1`
- [ ] SNS alerts topic has a confirmed email subscription (check the alert_email inbox for the confirmation link)

### Security

- [ ] WAF is attached to the CloudFront distribution
- [ ] All S3 buckets have public access blocked
- [ ] Secrets Manager secrets are not publicly accessible
- [ ] No secrets committed to git (`git log --all -- '*.env'`)

### CI/CD

- [ ] Push a small change to `main` — verify staging auto-deploys
- [ ] Verify the production deploy workflow pauses for approval
- [ ] Dependabot is enabled (Settings → Code security → Dependabot)

### Third-party integrations

- [ ] SES production access granted (sandbox removed)
- [ ] Send a test transactional email — verify it arrives and is not spam
- [ ] metals.dev API key is set in Secrets Manager and the LME worker is polling (check CloudWatch logs for `aop-staging-worker`)
- [ ] AM Fix (10:30 UTC) and PM Fix (15:00 UTC) BullMQ jobs are scheduled

### Monitoring alerts

- [ ] Trigger a test alarm: connect > threshold DB connections, verify SNS email arrives
- [ ] Verify CloudWatch log groups exist for all three services

### Go-live sign-off

- [ ] Stakeholder smoke test complete
- [ ] On-call runbook shared with ops team ([RUNBOOK.md](./RUNBOOK.md))
- [ ] Incident response contacts documented
- [ ] First production backup verified (run backup-verify job manually via BullMQ dashboard or CLI)

---

## Appendix: Common Commands

```bash
# Force ECS service update (rolling restart without new image)
aws ecs update-service \
  --cluster "${PROD_ECS_CLUSTER}" \
  --service aop-production-api \
  --force-new-deployment \
  --region us-east-1

# Tail ECS logs
aws logs tail /ecs/aop-production-api --follow --region us-east-1

# Get current Terraform workspace
cd infra && terraform workspace show

# Destroy a workspace (DANGER — irreversible, requires explicit confirmation)
# terraform workspace select staging
# terraform destroy -var-file=staging.tfvars

# List all Secrets Manager secrets
aws secretsmanager list-secrets \
  --filter Key=name,Values=aop/ \
  --region us-east-1 \
  --query "SecretList[*].Name"
```

See [RUNBOOK.md](./RUNBOOK.md) for incident response, rollback procedures, and operational playbooks.
