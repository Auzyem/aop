output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

output "alb_arn" {
  value = aws_lb.main.arn
}

output "alb_arn_suffix" {
  value = aws_lb.main.arn_suffix
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "api_service_name" {
  value = aws_ecs_service.api.name
}

output "cloudfront_acm_cert_arn" {
  description = "ACM cert ARN in us-east-1 for CloudFront"
  value       = aws_acm_certificate.cloudfront.arn
}
