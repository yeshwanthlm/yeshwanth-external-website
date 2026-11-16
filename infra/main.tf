# Contact-form backend for yeshwanthlm.in
#
#   form ─▶ API Gateway (POST /messages, throttled)
#        ─▶ Lambda submit: origin check · honeypot · Cloudflare Turnstile · per-IP limit · validation
#        ─▶ DynamoDB (TTL) + SES email to you
#   /admin ─▶ Cognito (MFA required, admin group) ─▶ API Gateway JWT ─▶ Lambda admin ─▶ DynamoDB
#
# Scales to zero; at personal-site traffic this stays inside the AWS free tier.

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 6.0" }
    archive = { source = "hashicorp/archive", version = "~> 2.5" }
    local   = { source = "hashicorp/local", version = "~> 2.5" }
    random  = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

provider "aws" {
  region  = var.region
  profile = var.aws_profile
  default_tags {
    tags = { Project = "yeshwanthlm-site", ManagedBy = "terraform" }
  }
}

data "aws_caller_identity" "me" {}

locals {
  name            = "ylm-site"
  origins         = concat(var.site_origins, var.dev_origins)
  hosts           = [for o in local.origins : regex("^https?://([^/:]+)", o)[0]]
  admin_callbacks = [for o in local.origins : "${o}/admin/"]
  turnstile_param = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.me.account_id}:parameter${var.turnstile_secret_param}"
}

# ───────────── storage ─────────────
resource "aws_dynamodb_table" "messages" {
  name                        = "${local.name}-messages"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "pk" # "MSG" for messages, "RL" for rate-limit counters
  range_key                   = "sk"
  deletion_protection_enabled = true

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }

  ttl { # messages expire after var.message_retention_days; rate-limit rows after minutes
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery { enabled = true }
  server_side_encryption { enabled = true }
}

# salt for hashing visitor IPs (raw IPs are never stored)
resource "random_id" "ip_salt" {
  byte_length = 32
}

# ───────────── email (SES) ─────────────
# AWS emails a verification link to this address once; click it. Sandbox is fine: you only email yourself.
resource "aws_sesv2_email_identity" "notify" {
  email_identity = var.notify_email
}

# ───────────── lambdas ─────────────
data "archive_file" "submit" {
  type        = "zip"
  source_file = "${path.module}/lambda/submit.mjs"
  output_path = "${path.module}/.build/submit.zip"
}

data "archive_file" "admin" {
  type        = "zip"
  source_file = "${path.module}/lambda/admin.mjs"
  output_path = "${path.module}/.build/admin.zip"
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "submit" {
  name               = "${local.name}-submit"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role" "admin" {
  name               = "${local.name}-admin"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_cloudwatch_log_group" "submit" {
  name              = "/aws/lambda/${local.name}-submit"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "admin" {
  name              = "/aws/lambda/${local.name}-admin"
  retention_in_days = 30
}

# Least privilege: each function may only write its own log group and touch only its own keys.
data "aws_iam_policy_document" "submit" {
  statement {
    sid       = "Tracing"
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
    resources = ["*"] # X-Ray does not support resource-level permissions
  }
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.submit.arn}:*"]
  }
  statement {
    sid       = "AddMessages"
    actions   = ["dynamodb:PutItem"]
    resources = [aws_dynamodb_table.messages.arn]
    condition {
      test     = "ForAllValues:StringEquals"
      variable = "dynamodb:LeadingKeys"
      values   = ["MSG"]
    }
  }
  statement {
    sid       = "RateLimitCounters"
    actions   = ["dynamodb:UpdateItem"]
    resources = [aws_dynamodb_table.messages.arn]
    condition {
      test     = "ForAllValues:StringEquals"
      variable = "dynamodb:LeadingKeys"
      values   = ["RL"]
    }
  }
  statement {
    sid       = "TurnstileSecret"
    actions   = ["ssm:GetParameter"]
    resources = [local.turnstile_param]
  }
  statement {
    sid       = "NotifyOwner"
    actions   = ["ses:SendEmail"]
    resources = [aws_sesv2_email_identity.notify.arn]
    condition {
      test     = "StringEquals"
      variable = "ses:FromAddress"
      values   = [var.notify_email]
    }
  }
}

data "aws_iam_policy_document" "admin" {
  statement {
    sid       = "Tracing"
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
    resources = ["*"] # X-Ray does not support resource-level permissions
  }
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.admin.arn}:*"]
  }
  statement {
    sid       = "ManageMessages"
    actions   = ["dynamodb:Query", "dynamodb:UpdateItem", "dynamodb:DeleteItem"]
    resources = [aws_dynamodb_table.messages.arn]
    condition {
      test     = "ForAllValues:StringEquals"
      variable = "dynamodb:LeadingKeys"
      values   = ["MSG"]
    }
  }
}

resource "aws_iam_role_policy" "submit" {
  role   = aws_iam_role.submit.id
  policy = data.aws_iam_policy_document.submit.json
}

resource "aws_iam_role_policy" "admin" {
  role   = aws_iam_role.admin.id
  policy = data.aws_iam_policy_document.admin.json
}

resource "aws_lambda_function" "submit" {
  function_name = "${local.name}-submit"
  role          = aws_iam_role.submit.arn
  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  handler       = "submit.handler"
  tracing_config {
    mode = "Active"
  }
  filename         = data.archive_file.submit.output_path
  source_code_hash = data.archive_file.submit.output_base64sha256
  memory_size      = 256
  timeout          = 8
  environment {
    variables = {
      TABLE           = aws_dynamodb_table.messages.name
      ALLOWED_ORIGINS = join(",", local.origins)
      ALLOWED_HOSTS   = join(",", local.hosts)
      TURNSTILE_PARAM = var.turnstile_secret_param
      NOTIFY_EMAIL    = var.notify_email
      RETENTION_DAYS  = tostring(var.message_retention_days)
      IP_SALT         = random_id.ip_salt.hex
      MAX_PER_IP      = tostring(var.max_messages_per_ip)
    }
  }
  depends_on = [aws_cloudwatch_log_group.submit]
}

resource "aws_lambda_function" "admin" {
  function_name = "${local.name}-admin"
  role          = aws_iam_role.admin.arn
  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  handler       = "admin.handler"
  tracing_config {
    mode = "Active"
  }
  filename         = data.archive_file.admin.output_path
  source_code_hash = data.archive_file.admin.output_base64sha256
  memory_size      = 128
  timeout          = 5
  environment {
    variables = {
      TABLE       = aws_dynamodb_table.messages.name
      ADMIN_GROUP = aws_cognito_user_group.admin.name
    }
  }
  depends_on = [aws_cloudwatch_log_group.admin]
}

# ───────────── auth (admin login) ─────────────
resource "aws_cognito_user_pool" "admin" {
  name                     = "${local.name}-admin"
  user_pool_tier           = "LITE"
  deletion_protection      = "ACTIVE"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = "ON" # the sign-in page walks you through authenticator-app setup

  software_token_mfa_configuration { enabled = true }

  admin_create_user_config { allow_admin_create_user_only = true } # no public sign-up

  password_policy {
    minimum_length                   = 14
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 3
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
}

resource "aws_cognito_user_pool_domain" "admin" {
  domain                = var.cognito_domain_prefix
  user_pool_id          = aws_cognito_user_pool.admin.id
  managed_login_version = 1 # classic hosted UI (Lite tier), handles MFA enrolment
}

resource "aws_cognito_user_pool_client" "admin" {
  name                                 = "${local.name}-admin-web"
  user_pool_id                         = aws_cognito_user_pool.admin.id
  generate_secret                      = false # browser app: auth code + PKCE
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = local.admin_callbacks
  logout_urls                          = local.admin_callbacks
  explicit_auth_flows                  = ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true
  access_token_validity                = 60
  id_token_validity                    = 60
  refresh_token_validity               = 1
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

resource "aws_cognito_user_group" "admin" {
  name         = "admin"
  user_pool_id = aws_cognito_user_pool.admin.id
  description  = "May read and manage contact-form messages."
}

# Your login. Cognito emails a temporary password; first sign-in asks for a new password + MFA app.
resource "aws_cognito_user" "owner" {
  user_pool_id = aws_cognito_user_pool.admin.id
  username     = var.admin_email
  attributes = {
    email          = var.admin_email
    email_verified = true
  }
  desired_delivery_mediums = ["EMAIL"]
}

resource "aws_cognito_user_in_group" "owner" {
  user_pool_id = aws_cognito_user_pool.admin.id
  group_name   = aws_cognito_user_group.admin.name
  username     = aws_cognito_user.owner.username
}

# ───────────── API ─────────────
resource "aws_apigatewayv2_api" "api" {
  name          = "${local.name}-api"
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = local.origins
    allow_methods = ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["content-type", "authorization"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.api.id
  name             = "cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  jwt_configuration {
    issuer   = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.admin.id}"
    audience = [aws_cognito_user_pool_client.admin.id]
  }
}

resource "aws_apigatewayv2_integration" "submit" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.submit.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "admin" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.admin.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "submit" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /messages"
  target    = "integrations/${aws_apigatewayv2_integration.submit.id}"
}

resource "aws_apigatewayv2_route" "admin" {
  for_each           = toset(["GET /admin/messages", "PATCH /admin/messages/{id}", "DELETE /admin/messages/{id}"])
  api_id             = aws_apigatewayv2_api.api.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.admin.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/apigateway/${local.name}-api"
  retention_in_days = 30
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 20
    throttling_rate_limit  = 10
  }
  route_settings { # the public form: tight global ceiling on top of the per-IP limit in Lambda
    route_key              = aws_apigatewayv2_route.submit.route_key
    throttling_burst_limit = 5
    throttling_rate_limit  = 1
  }

  access_log_settings { # request metadata only, never bodies
    destination_arn = aws_cloudwatch_log_group.api.arn
    format = jsonencode({
      time      = "$context.requestTime", id = "$context.requestId", ip = "$context.identity.sourceIp",
      route     = "$context.routeKey", status = "$context.status", latency = "$context.responseLatency",
      authError = "$context.authorizer.error", integrationError = "$context.integrationErrorMessage"
    })
  }
}

resource "aws_lambda_permission" "submit" {
  statement_id  = "apigw"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.submit.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*/messages"
}

resource "aws_lambda_permission" "admin" {
  statement_id  = "apigw"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.admin.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*/admin/messages*"
}

# ───────────── site config (public values only) ─────────────
resource "local_file" "site_config" {
  filename = "${path.module}/../assets/config.js"
  content = <<-EOT
    // Generated by infra/ (terraform apply). Public values only: safe to commit.
    window.YLM_CONFIG = ${jsonencode({
  apiUrl           = aws_apigatewayv2_stage.default.invoke_url
  cognitoDomain    = "https://${aws_cognito_user_pool_domain.admin.domain}.auth.${var.region}.amazoncognito.com"
  cognitoClient    = aws_cognito_user_pool_client.admin.id
  turnstileSiteKey = var.turnstile_site_key
  region           = var.region
})};
  EOT
}
