variable "project"            { type = string }
variable "env"                { type = string }
variable "is_prod"            { type = bool; default = false }
variable "vpc_id"             { type = string }
variable "public_subnet_ids"  { type = list(string) }
variable "private_subnet_ids" { type = list(string) }
variable "alb_sg_id"          { type = string }
variable "api_sg_id"          { type = string }
variable "worker_sg_id"       { type = string }
variable "api_image"          { type = string }
variable "worker_image"       { type = string }
variable "api_cpu"            { type = number; default = 512 }
variable "api_memory"         { type = number; default = 1024 }
variable "worker_cpu"         { type = number; default = 256 }
variable "worker_memory"      { type = number; default = 512 }
variable "domain_name"        { type = string }
variable "zone_id"            { type = string }
variable "db_secret_arn"      { type = string }
variable "redis_endpoint"     { type = string }
variable "documents_bucket"   { type = string }
