locals {
  prefix = "tf-next"
}

provider "aws" {
  region = "ap-northeast-2"
}

module "s3-remote-backend" {
  source = "github.com/ACupofCommit/terraform-aws-s3-remote-backend"
  name_prefix = local.prefix
}

output "bucket_name" {
  value = <<EOF
Create `backend.hcl` file with below contents and put your other terraform project,
then `terraform init -backend-config=backend.hcl`

# backend.hcl
region         = "${module.s3-remote-backend.region}"
bucket         = "${module.s3-remote-backend.s3_bucket_name}"
key            = "${local.prefix}.tfstate"
encrypt        = true
kms_key_id     = "${module.s3-remote-backend.kms_key_arn}"
dynamodb_table = "${module.s3-remote-backend.dynamodb_table_name}"
EOF
}
