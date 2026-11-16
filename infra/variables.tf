variable "region" {
  description = "AWS region for the backend."
  type        = string
  default     = "ap-south-1"
}

variable "aws_profile" {
  description = "AWS CLI profile to deploy with (set in terraform.tfvars). null = default credential chain."
  type        = string
  default     = null
}

variable "admin_email" {
  description = "Your admin login. Cognito sends the first temporary password here."
  type        = string
  default     = "techwithyeshwanth@gmail.com"
}

variable "notify_email" {
  description = "Where new-message emails go (sent by SES from and to this address)."
  type        = string
  default     = "techwithyeshwanth@gmail.com"
}

variable "cognito_domain_prefix" {
  description = "Prefix for the login page: <prefix>.auth.<region>.amazoncognito.com. Must be globally unique."
  type        = string
  default     = "yeshwanthlm-admin"
}

variable "site_origins" {
  description = "Live site origins: allowed to call the API, to pass the bot check, and to receive the admin login redirect."
  type        = list(string)
  default     = ["https://yeshwanthlm.in", "https://www.yeshwanthlm.in"]
}

variable "dev_origins" {
  description = "Local preview origins. Empty in production; set e.g. [\"http://127.0.0.1:8767\"] only while testing."
  type        = list(string)
  default     = []
}

variable "turnstile_site_key" {
  description = "Cloudflare Turnstile site key (public). Create a free widget at dash.cloudflare.com -> Turnstile."
  type        = string
}

variable "turnstile_secret_param" {
  description = "SSM SecureString holding the Turnstile secret key. Created by you, outside Terraform, so the secret never enters state."
  type        = string
  default     = "/ylm-site/turnstile-secret"
}

variable "message_retention_days" {
  description = "Messages are deleted automatically after this many days (data minimisation)."
  type        = number
  default     = 365
}

variable "domain_name" {
  description = "Apex domain of the site."
  type        = string
  default     = "yeshwanthlm.in"
}

variable "create_hosted_zone" {
  description = "false: use the Route 53 zone created when you registered/transferred the domain. true: create one (then point your registrar's NS records at output name_servers)."
  type        = bool
  default     = false
}

variable "github_repo" {
  description = "owner/repo allowed to deploy (main branch only)."
  type        = string
  default     = "yeshwanthlm/yeshwanth-cloud"
}

variable "create_github_oidc_provider" {
  description = "An AWS account can have only one GitHub OIDC provider. Set false if it already exists."
  type        = bool
  default     = true
}

variable "budget_limit_usd" {
  description = "Monthly AWS spend that triggers an alert email."
  type        = number
  default     = 5
}

variable "max_messages_per_ip" {
  description = "Messages allowed per visitor (hashed IP) per 10 minutes."
  type        = number
  default     = 3
}
