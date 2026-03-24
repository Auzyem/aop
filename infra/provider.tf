terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # S3 backend — workspace-aware key keeps dev/staging/prod state isolated.
  # Bootstrap once: aws s3 mb s3://aop-terraform-state --region us-east-1
  #                 aws dynamodb create-table --table-name aop-terraform-locks \
  #                   --attribute-definitions AttributeName=LockID,AttributeType=S \
  #                   --key-schema AttributeName=LockID,KeyType=HASH \
  #                   --billing-mode PAY_PER_REQUEST --region us-east-1
  backend "s3" {
    bucket         = "aop-terraform-state"
    key            = "aop/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "aop-terraform-locks"
    encrypt        = true
    workspace_key_prefix = "workspaces"
  }
}

# Primary provider — us-east-1 (N. Virginia)
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = terraform.workspace
      ManagedBy   = "terraform"
      Repository  = "aop"
    }
  }
}

# Alias provider — us-east-1 required for CloudFront WAF and global ACM certificates
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = terraform.workspace
      ManagedBy   = "terraform"
      Repository  = "aop"
    }
  }
}
