import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';

export class LambdaThrottlingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a Lambda function for testing throttling
    const throttlingTestFunction = new lambda.Function(this, 'ThrottlingTestFunction', {
      functionName: 'throttling-test-function',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'lambda-function.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', '..', 'dist')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      description: 'Lambda function for testing throttling behavior',
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
      },
    });

    // Allow the function to write to CloudWatch logs
    throttlingTestFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: ['*'],
      })
    );

    // Output the function ARN for reference
    new cdk.CfnOutput(this, 'FunctionArn', {
      value: throttlingTestFunction.functionArn,
      description: 'The ARN of the throttling test Lambda function',
    });

    // Output the function name for reference
    new cdk.CfnOutput(this, 'FunctionName', {
      value: throttlingTestFunction.functionName,
      description: 'The name of the throttling test Lambda function',
    });
  }
}