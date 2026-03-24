terraform {
  required_providers {
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

locals {
  name = "${var.project}-${var.env}"
  # In prod: 2 nodes with automatic failover; in dev: 1 node
  num_cache_clusters     = var.is_prod ? 2 : 1
  automatic_failover     = var.is_prod
  multi_az               = var.is_prod
}

# ---------------------------------------------------------------------------
# Subnet group
# ---------------------------------------------------------------------------

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${local.name}-redis-subnets"
  subnet_ids = var.subnet_ids

  tags = { Name = "${local.name}-redis-subnets" }
}

# ---------------------------------------------------------------------------
# Redis 7 Replication Group
# ---------------------------------------------------------------------------

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${local.name}-redis"
  description          = "AOP ${var.env} Redis 7 cache and queue broker"

  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.node_type
  num_cache_clusters   = local.num_cache_clusters
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.redis.name
  security_group_ids = [var.redis_sg_id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  # TLS requires AUTH token in production
  auth_token                 = var.is_prod ? random_password.redis_auth[0].result : null

  automatic_failover_enabled = local.automatic_failover
  multi_az_enabled           = local.multi_az

  maintenance_window       = "sun:05:00-sun:06:00"
  snapshot_retention_limit = var.is_prod ? 7 : 1
  snapshot_window          = "04:00-05:00"

  log_delivery_configuration {
    destination      = "/aop/${var.env}/redis/slow-log"
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  tags = { Name = "${local.name}-redis" }
}

# Auth token for production Redis (TLS + AUTH)
resource "random_password" "redis_auth" {
  count   = var.is_prod ? 1 : 0
  length  = 32
  special = false
}
