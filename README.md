# AWS Lambda Throttling Test Tool

This tool helps test and document AWS Lambda function throttling behavior. It allows you to understand how Lambda functions behave under different concurrency conditions and how throttling affects your application.

## Background

AWS Lambda has built-in concurrency limits that, when exceeded, cause throttling of function invocations. This tool helps to:

1. Test the behavior of Lambda throttling in a controlled environment
2. Measure the impact of throttling on function invocations
3. Document how throttling errors are returned to calling applications
4. Test different retry strategies and their effectiveness

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- AWS account with appropriate permissions
- AWS CLI configured with credentials

### Installation

```bash
git clone https://github.com/yourusername/lambda-throttling.git
cd lambda-throttling
npm install
```

### Usage

1. Build and deploy the test Lambda function using CDK:

```bash
npm run build
npm run deploy
```

2. Run the throttling test:

```bash
npm run test-throttling
```

3. Monitor CloudWatch metrics during testing:

```bash
npm run monitor
```

## Testing Scenarios

### Basic Throttling Test

This test invokes the Lambda function many times concurrently to trigger throttling:

```bash
npx ts-node src/test-throttling.ts
```

### Account-Level vs. Function-Level Concurrency

To test the difference between account-level concurrency limits and function-level reserved concurrency:

1. Set reserved concurrency on the test function:

```bash
aws lambda put-function-concurrency \
  --function-name throttling-test-function \
  --reserved-concurrent-executions 10
```

2. Run the throttling test again

### Retry Strategies

Different retry strategies can be implemented in the calling code to handle throttling errors. This tool can be used to test the effectiveness of different retry strategies.

## Interpretation of Results

- **Successful Invocations**: Functions that executed without being throttled
- **Throttled Invocations**: Functions that were throttled due to concurrency limits
- **Failed Invocations**: Functions that failed for reasons other than throttling
- **Invocation Times**: Time taken for each invocation to complete or fail

## Troubleshooting

Common issues and their solutions:

- **Permission Errors**: Ensure your AWS credentials have proper permissions for Lambda and CloudWatch
- **Missing Metrics**: CloudWatch metrics can take a few minutes to appear after test execution
- **Deployment Failures**: Check IAM role propagation and Lambda service limits

## References

- [AWS Lambda Concurrency Documentation](https://docs.aws.amazon.com/lambda/latest/dg/invocation-scaling.html)
- [AWS Lambda Throttling Behavior](https://docs.aws.amazon.com/lambda/latest/dg/invocation-retries.html)
- [AWS Lambda Quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html)