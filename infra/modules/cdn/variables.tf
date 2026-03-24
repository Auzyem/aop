variable "project"               { type = string }
variable "env"                   { type = string }
variable "alb_dns_name"          { type = string }
variable "documents_bucket_name" { type = string }
variable "documents_bucket_arn"  { type = string }
variable "waf_acl_arn"           { type = string }
variable "acm_cert_arn"          { type = string }
variable "domain_name"           { type = string }
