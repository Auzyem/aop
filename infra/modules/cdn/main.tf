terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      configuration_aliases = [aws.us_east_1]
    }
  }
}

locals {
  name           = "${var.project}-${var.env}"
  alb_origin_id  = "alb-api"
  s3_origin_id   = "s3-documents"
}

data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------
# Origin Access Control — for S3 documents bucket
# ---------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "documents" {
  name                              = "${local.name}-documents-oac"
  description                       = "OAC for AOP ${var.env} documents bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ---------------------------------------------------------------------------
# CloudFront Distribution
# ---------------------------------------------------------------------------

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "AOP ${var.env} — API + documents CDN"
  aliases             = [var.domain_name, "www.${var.domain_name}"]
  price_class         = "PriceClass_All"
  web_acl_id          = var.waf_acl_arn
  default_root_object = ""

  # ── Origin 1: ALB (API + web app) ────────────────────────────────────────
  origin {
    domain_name = var.alb_dns_name
    origin_id   = local.alb_origin_id

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    custom_header {
      name  = "X-Forwarded-Proto"
      value = "https"
    }
  }

  # ── Origin 2: S3 documents bucket ────────────────────────────────────────
  origin {
    domain_name              = "${var.documents_bucket_name}.s3.us-east-1.amazonaws.com"
    origin_id                = local.s3_origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.documents.id
  }

  # ── Default cache behaviour → ALB ────────────────────────────────────────
  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD", "OPTIONS"]
    target_origin_id = local.alb_origin_id

    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Host", "Origin", "Accept", "Content-Type"]
      cookies { forward = "all" }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0
    compress               = true
  }

  # ── /documents/* → S3 ────────────────────────────────────────────────────
  ordered_cache_behavior {
    path_pattern     = "/documents/*"
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = local.s3_origin_id

    forwarded_values {
      query_string = true
      headers      = ["Origin", "Access-Control-Request-Headers", "Access-Control-Request-Method"]
      cookies { forward = "none" }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 86400    # 1 day
    max_ttl                = 31536000 # 1 year
    compress               = true
  }

  # ── Custom error pages ────────────────────────────────────────────────────
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    acm_certificate_arn      = var.acm_cert_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = { Name = "${local.name}-cf" }
}

# ---------------------------------------------------------------------------
# S3 Bucket Policy — grant CloudFront OAC read access
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "documents_cf" {
  statement {
    sid    = "AllowCloudFrontOAC"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${var.documents_bucket_arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.main.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "documents_cf" {
  bucket = var.documents_bucket_name
  policy = data.aws_iam_policy_document.documents_cf.json
}
