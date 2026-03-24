variable "project"     { type = string }
variable "env"         { type = string }
variable "is_prod"     { type = bool; default = false }
variable "subnet_ids"  { type = list(string) }
variable "redis_sg_id" { type = string }
variable "node_type"   { type = string; default = "cache.t3.micro" }
