# =============================================================================
# Root variables — all sensitive values supplied via tfvars, never hardcoded.
# =============================================================================

variable "aws_region" {
  description = "Primary AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short project identifier used in all resource names"
  type        = string
  default     = "aop"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

# ---------------------------------------------------------------------------
# DNS / TLS
# ---------------------------------------------------------------------------

variable "domain_name" {
  description = "Primary domain for the platform (e.g. aop.example.com)"
  type        = string
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID for the domain"
  type        = string
}

# ---------------------------------------------------------------------------
# Alerting
# ---------------------------------------------------------------------------

variable "alert_email" {
  description = "Email address to receive CloudWatch alarm notifications"
  type        = string
}

# ---------------------------------------------------------------------------
# Container images (ECR URIs supplied at deploy time)
# ---------------------------------------------------------------------------

variable "api_container_image" {
  description = "Full ECR image URI for the API service (e.g. 123456789.dkr.ecr.us-east-1.amazonaws.com/aop-api:latest)"
  type        = string
}

variable "worker_container_image" {
  description = "Full ECR image URI for the worker service"
  type        = string
}

# ---------------------------------------------------------------------------
# ECS task sizing
# ---------------------------------------------------------------------------

variable "api_cpu" {
  description = "CPU units for the API Fargate task (1 vCPU = 1024)"
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "Memory (MiB) for the API Fargate task"
  type        = number
  default     = 1024
}

variable "worker_cpu" {
  description = "CPU units for the worker Fargate task"
  type        = number
  default     = 256
}

variable "worker_memory" {
  description = "Memory (MiB) for the worker Fargate task"
  type        = number
  default     = 512
}

# ---------------------------------------------------------------------------
# RDS
# ---------------------------------------------------------------------------

variable "db_instance_class" {
  description = "RDS instance class (db.t3.medium for dev, db.r6g.large for prod)"
  type        = string
  default     = "db.t3.medium"
}

variable "db_allocated_storage_gb" {
  description = "Initial allocated storage in GiB"
  type        = number
  default     = 20
}

# ---------------------------------------------------------------------------
# ElastiCache
# ---------------------------------------------------------------------------

variable "redis_node_type" {
  description = "ElastiCache Redis node type (cache.t3.micro for dev, cache.r6g.large for prod)"
  type        = string
  default     = "cache.t3.micro"
}
