output "db_endpoint" {
  value     = aws_db_instance.postgres.endpoint
  sensitive = true
}

output "db_port" {
  value = aws_db_instance.postgres.port
}

output "db_name" {
  value = aws_db_instance.postgres.db_name
}

output "db_identifier" {
  value = aws_db_instance.postgres.identifier
}

output "db_secret_arn" {
  value     = aws_secretsmanager_secret.db_credentials.arn
  sensitive = true
}
