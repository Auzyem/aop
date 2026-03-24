output "sns_topic_arn" {
  value = aws_sns_topic.alerts.arn
}

output "log_group_arns" {
  value = {
    api    = aws_cloudwatch_log_group.api.arn
    worker = aws_cloudwatch_log_group.worker.arn
    nginx  = aws_cloudwatch_log_group.nginx.arn
  }
}
