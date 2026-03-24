terraform {
  required_providers {
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

locals {
  name    = "${var.project}-${var.env}"
  db_name = "aop"
  db_user = "aop"
}

# ---------------------------------------------------------------------------
# Random password — stored in Secrets Manager; never in Terraform state
# ---------------------------------------------------------------------------

resource "random_password" "db" {
  length           = 24
  special          = true
  override_special = "!#$%^&*()-_=+"
}

# ---------------------------------------------------------------------------
# Secrets Manager
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "db_credentials" {
  name                    = "${local.name}/rds/credentials"
  description             = "AOP ${var.env} RDS PostgreSQL credentials"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.is_prod ? 30 : 0

  tags = { Name = "${local.name}-db-credentials" }
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    engine   = "postgres"
    host     = aws_db_instance.postgres.address
    port     = aws_db_instance.postgres.port
    dbname   = local.db_name
    username = local.db_user
    password = random_password.db.result
  })

  # Prevent replacement when the secret rotates; managed by rotation lambda later.
  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ---------------------------------------------------------------------------
# Subnet group
# ---------------------------------------------------------------------------

resource "aws_db_subnet_group" "main" {
  name       = "${local.name}-db-subnets"
  subnet_ids = var.subnet_ids

  tags = { Name = "${local.name}-db-subnets" }
}

# ---------------------------------------------------------------------------
# Parameter group — PostgreSQL 15 tuning
# ---------------------------------------------------------------------------

resource "aws_db_parameter_group" "postgres15" {
  name   = "${local.name}-pg15"
  family = "postgres15"

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"  # Log queries > 1s
  }

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_lock_waits"
    value = "1"
  }

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  tags = { Name = "${local.name}-pg15-params" }
}

# ---------------------------------------------------------------------------
# RDS Instance — PostgreSQL 15
# ---------------------------------------------------------------------------

resource "aws_db_instance" "postgres" {
  identifier        = "${local.name}-postgres"
  engine            = "postgres"
  engine_version    = "15"
  instance_class    = var.instance_class
  allocated_storage = var.allocated_storage_gb
  max_allocated_storage = var.is_prod ? 500 : 100  # autoscaling ceiling

  storage_type      = "gp3"
  storage_encrypted = true
  kms_key_id        = var.kms_key_arn

  db_name  = local.db_name
  username = local.db_user
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.db_sg_id]
  parameter_group_name   = aws_db_parameter_group.postgres15.name
  publicly_accessible    = false

  multi_az               = var.is_prod
  deletion_protection    = var.is_prod
  skip_final_snapshot    = !var.is_prod
  final_snapshot_identifier = var.is_prod ? "${local.name}-final-snapshot" : null
  copy_tags_to_snapshot  = true

  backup_retention_period = var.is_prod ? 35 : 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  performance_insights_enabled          = var.is_prod
  performance_insights_retention_period = var.is_prod ? 31 : null
  performance_insights_kms_key_id       = var.is_prod ? var.kms_key_arn : null

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  auto_minor_version_upgrade = true

  tags = { Name = "${local.name}-postgres" }

  lifecycle {
    prevent_destroy = false  # Override to true for production after first deploy
  }
}
