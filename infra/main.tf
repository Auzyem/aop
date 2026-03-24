# =============================================================================
# AOP Root Module
# Modules are called in dependency order:
#   security + networking → storage + database + cache → compute → cdn → monitoring
# =============================================================================

locals {
  env      = terraform.workspace
  is_prod  = terraform.workspace == "production"
  name_pfx = "${var.project_name}-${local.env}"
}

# -----------------------------------------------------------------------------
# 1. Security — KMS, WAF, CloudTrail
# -----------------------------------------------------------------------------
module "security" {
  source = "./modules/security"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  project = var.project_name
  env     = local.env
  is_prod = local.is_prod
}

# -----------------------------------------------------------------------------
# 2. Networking — VPC, subnets, NAT, security groups
# -----------------------------------------------------------------------------
module "networking" {
  source = "./modules/networking"

  project  = var.project_name
  env      = local.env
  is_prod  = local.is_prod
  vpc_cidr = var.vpc_cidr
}

# -----------------------------------------------------------------------------
# 3a. Storage — S3 buckets (documents + backups)
# -----------------------------------------------------------------------------
module "storage" {
  source = "./modules/storage"

  project     = var.project_name
  env         = local.env
  kms_key_arn = module.security.kms_key_arn
}

# -----------------------------------------------------------------------------
# 3b. Database — RDS PostgreSQL 15
# -----------------------------------------------------------------------------
module "database" {
  source = "./modules/database"

  project              = var.project_name
  env                  = local.env
  is_prod              = local.is_prod
  subnet_ids           = module.networking.private_subnet_ids
  db_sg_id             = module.networking.db_sg_id
  kms_key_arn          = module.security.kms_key_arn
  instance_class       = var.db_instance_class
  allocated_storage_gb = var.db_allocated_storage_gb
}

# -----------------------------------------------------------------------------
# 3c. Cache — ElastiCache Redis 7
# -----------------------------------------------------------------------------
module "cache" {
  source = "./modules/cache"

  project      = var.project_name
  env          = local.env
  is_prod      = local.is_prod
  subnet_ids   = module.networking.private_subnet_ids
  redis_sg_id  = module.networking.db_sg_id
  node_type    = var.redis_node_type
}

# -----------------------------------------------------------------------------
# 4. Compute — ECS Fargate, ALB, auto-scaling
# -----------------------------------------------------------------------------
module "compute" {
  source = "./modules/compute"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  project             = var.project_name
  env                 = local.env
  is_prod             = local.is_prod
  vpc_id              = module.networking.vpc_id
  public_subnet_ids   = module.networking.public_subnet_ids
  private_subnet_ids  = module.networking.private_subnet_ids
  alb_sg_id           = module.networking.alb_sg_id
  api_sg_id           = module.networking.api_sg_id
  worker_sg_id        = module.networking.worker_sg_id
  api_image           = var.api_container_image
  worker_image        = var.worker_container_image
  api_cpu             = var.api_cpu
  api_memory          = var.api_memory
  worker_cpu          = var.worker_cpu
  worker_memory       = var.worker_memory
  domain_name         = var.domain_name
  zone_id             = var.route53_zone_id
  db_secret_arn       = module.database.db_secret_arn
  redis_endpoint      = module.cache.redis_primary_endpoint
  documents_bucket    = module.storage.documents_bucket_name
}

# -----------------------------------------------------------------------------
# 5. CDN — CloudFront
# -----------------------------------------------------------------------------
module "cdn" {
  source = "./modules/cdn"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  project                = var.project_name
  env                    = local.env
  alb_dns_name           = module.compute.alb_dns_name
  documents_bucket_name  = module.storage.documents_bucket_name
  documents_bucket_arn   = module.storage.documents_bucket_arn
  waf_acl_arn            = module.security.waf_acl_arn
  acm_cert_arn           = module.compute.cloudfront_acm_cert_arn
  domain_name            = var.domain_name
}

# -----------------------------------------------------------------------------
# 6. Monitoring — CloudWatch alarms, log groups, SNS
# -----------------------------------------------------------------------------
module "monitoring" {
  source = "./modules/monitoring"

  project       = var.project_name
  env           = local.env
  db_identifier  = module.database.db_identifier
  alb_arn        = module.compute.alb_arn
  alb_arn_suffix = module.compute.alb_arn_suffix
  alert_email    = var.alert_email
}
