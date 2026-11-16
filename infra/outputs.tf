output "site_url" {
  value = "https://${var.domain_name}"
}

output "site_bucket" {
  description = "GitHub repo variable SITE_BUCKET"
  value       = aws_s3_bucket.site.bucket
}

output "cloudfront_distribution_id" {
  description = "GitHub repo variable CF_DISTRIBUTION_ID"
  value       = aws_cloudfront_distribution.site.id
}

output "github_deploy_role_arn" {
  description = "GitHub repo variable AWS_ROLE_ARN"
  value       = aws_iam_role.github_deploy.arn
}

output "name_servers" {
  description = "Only when create_hosted_zone = true: set these at your registrar."
  value       = var.create_hosted_zone ? aws_route53_zone.site[0].name_servers : []
}

output "api_url" {
  value = aws_apigatewayv2_stage.default.invoke_url
}

output "admin_login_url" {
  value = "https://${aws_cognito_user_pool_domain.admin.domain}.auth.${var.region}.amazoncognito.com"
}

output "table" {
  value = aws_dynamodb_table.messages.name
}
