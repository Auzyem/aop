output "kms_key_arn" {
  value = aws_kms_key.main.arn
}

output "kms_key_id" {
  value = aws_kms_key.main.key_id
}

output "waf_acl_arn" {
  value = aws_wafv2_web_acl.main.arn
}
