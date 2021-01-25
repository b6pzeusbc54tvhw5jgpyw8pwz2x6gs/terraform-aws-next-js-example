terraform {
  required_version = "~> 0.14.5"
  backend "s3" {}
}

provider "aws" {
  region = "eu-west-1"
}

provider "aws" {
  alias = "virginia"
  region = "us-east-1"
}

module "tf-next" {
  // source = "github.com/b6pzeusbc54tvhw5jgpyw8pwz2x6gs/terraform-aws-next-js"
  // for local test
  source = "../../terraform-aws-next-js"
  name_prefix = "tf-next-test"
}

output "domain" {
  value = module.tf-next.cloudfront_domain_name
}
