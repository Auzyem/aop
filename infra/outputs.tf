output "cloudfront_domain" {
  description = "CloudFront distribution domain name (use as CNAME for the apex domain)"
  value       = module.cdn.cloudfront_domain_name
}

output "alb_dns_name" {
  description = "Application Load Balancer DNS name"
  value       = module.compute.alb_dns_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.compute.ecs_cluster_name
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint (host:port)"
  value       = module.database.db_endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = module.cache.redis_primary_endpoint
  sensitive   = true
}

output "documents_bucket" {
  description = "S3 documents bucket name"
  value       = module.storage.documents_bucket_name
}

output "backups_bucket" {
  description = "S3 backups bucket name"
  value       = module.storage.backups_bucket_name
}

output "db_secret_arn" {
  description = "ARN of the Secrets Manager secret holding DB credentials"
  value       = module.database.db_secret_arn
  sensitive   = true
}

output "kms_key_arn" {
  description = "ARN of the KMS CMK used for encryption at rest"
  value       = module.security.kms_key_arn
}

output "sns_alerts_topic_arn" {
  description = "SNS topic ARN for CloudWatch alarm notifications"
  value       = module.monitoring.sns_topic_arn
}
