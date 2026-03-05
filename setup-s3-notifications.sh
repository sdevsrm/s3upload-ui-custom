#!/usr/bin/env bash
# setup-s3-notifications.sh
# Wires S3 event notifications to all four analysis Lambda functions.
# Run AFTER pipeline.yaml is deployed as stack s3upload-pipeline.

set -uo pipefail

BUCKET="s3uploadv281d32340117947dd82b04e7880362a5156621-dev"
REGION="us-east-1"
STACK="s3upload-pipeline"

echo "Fetching Lambda ARNs from CloudFormation stack: $STACK"

get_output() {
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

VIDEO_ARN=$(get_output VideoTriggerArn)
IMAGE_ARN=$(get_output ImageAnalyzerArn)
AUDIO_ARN=$(get_output AudioAnalyzerArn)
DOC_ARN=$(get_output DocumentAnalyzerArn)

echo "  Video:    $VIDEO_ARN"
echo "  Image:    $IMAGE_ARN"
echo "  Audio:    $AUDIO_ARN"
echo "  Document: $DOC_ARN"

cat > /tmp/s3-notification.json << EOF
{
  "LambdaFunctionConfigurations": [
    {
      "Id": "VideoAnalysisTrigger",
      "LambdaFunctionArn": "$VIDEO_ARN",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {"Key": {"FilterRules": [{"Name": "prefix", "Value": "videos/"}]}}
    },
    {
      "Id": "ImageAnalysisTrigger",
      "LambdaFunctionArn": "$IMAGE_ARN",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {"Key": {"FilterRules": [{"Name": "prefix", "Value": "images/"}]}}
    },
    {
      "Id": "AudioAnalysisTrigger",
      "LambdaFunctionArn": "$AUDIO_ARN",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {"Key": {"FilterRules": [{"Name": "prefix", "Value": "audio/"}]}}
    },
    {
      "Id": "DocumentAnalysisTrigger",
      "LambdaFunctionArn": "$DOC_ARN",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {"Key": {"FilterRules": [{"Name": "prefix", "Value": "documents/"}]}}
    }
  ]
}
EOF

echo ""
echo "Applying S3 event notifications to: $BUCKET"
aws s3api put-bucket-notification-configuration \
  --bucket "$BUCKET" \
  --notification-configuration file:///tmp/s3-notification.json

echo "✅ Done. All four pipelines wired."
