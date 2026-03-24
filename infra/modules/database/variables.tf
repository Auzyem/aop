variable "project"              { type = string }
variable "env"                  { type = string }
variable "is_prod"              { type = bool; default = false }
variable "subnet_ids"           { type = list(string) }
variable "db_sg_id"             { type = string }
variable "kms_key_arn"          { type = string }
variable "instance_class"       { type = string; default = "db.t3.medium" }
variable "allocated_storage_gb" { type = number; default = 20 }
